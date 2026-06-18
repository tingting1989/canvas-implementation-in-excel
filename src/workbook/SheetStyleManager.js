import { stylePool, DEFAULT_STYLE_ID } from "../styles/index.js";
import { Cell } from "../model/index.js";

export class SheetStyleManager {
    #sheet;
    #defaultStyleId = DEFAULT_STYLE_ID;
    #styleCache = new Map();
    #styleCacheVersion = 0;
    #styleCacheFrameVersion = -1;

    constructor(sheet) {
        this.#sheet = sheet;
    }

    get defaultStyleId() {
        return this.#defaultStyleId;
    }

    invalidateCache() {
        this.#styleCacheVersion++;
    }

    setRowStyle(row, styleId) {
        this.#sheet.rowStyles.set(row, styleId);
        this.invalidateCache();
    }

    setColStyle(col, styleId) {
        this.#sheet.colStyles.set(col, styleId);
        this.invalidateCache();
    }

    setDefaultStyle(styleObj) {
        this.#defaultStyleId = stylePool.getStyleId(styleObj);
        this.invalidateCache();
    }

    getDefaultStyle() {
        return stylePool.getStyle(this.#defaultStyleId);
    }

    setCellStyle(r, c, styleObj) {
        const realR = this.#sheet.toRealRow(r);
        this.#sheet.rowColManager.ensureSize(realR + 1, c + 1);
        const cell = this.#sheet.cellStore.get(realR, c);
        const currentStyleId = cell?.styleId || 0;
        const currentStyle = currentStyleId ? stylePool.getStyle(currentStyleId) : {};
        const mergedStyle = { ...currentStyle, ...styleObj };
        const newStyleId = stylePool.getStyleId(mergedStyle);
        const value = cell?.value ?? "";
        this.#sheet.cellStore.set(realR, c, new Cell(value, newStyleId, cell?.disabled || false));
        this.invalidateCache();
    }

    clearCellStyle(r, c) {
        const realR = this.#sheet.toRealRow(r);
        const cell = this.#sheet.cellStore.get(realR, c);
        if (!cell || cell.styleId === 0) return;
        this.#sheet.cellStore.set(realR, c, new Cell(cell.value, 0, cell.disabled));
        this.invalidateCache();
    }

    clearRowStyle(row) {
        if (!this.#sheet.rowStyles.has(row)) return;
        this.#sheet.rowStyles.delete(row);
        this.invalidateCache();
    }

    clearColStyle(col) {
        if (!this.#sheet.colStyles.has(col)) return;
        this.#sheet.colStyles.delete(col);
        this.invalidateCache();
    }

    setRangeStyle(range, styleObj) {
        const styleId = stylePool.getStyleId(styleObj);
        const { topRow, topCol, bottomRow, bottomCol } = range;
        const rowColManager = this.#sheet.rowColManager;

        if (topCol === 0 && bottomCol >= rowColManager.colCount - 1) {
            for (let r = topRow; r <= bottomRow; r++) {
                this.#sheet.rowStyles.set(this.#sheet.toRealRow(r), styleId);
            }
            this.invalidateCache();
            return;
        }

        if (topRow === 0 && bottomRow >= rowColManager.rowCount - 1) {
            for (let c = topCol; c <= bottomCol; c++) {
                this.#sheet.colStyles.set(c, styleId);
            }
            this.invalidateCache();
            return;
        }

        for (let r = topRow; r <= bottomRow; r++) {
            for (let c = topCol; c <= bottomCol; c++) {
                if (!this.#sheet.isDisabled(r, c)) {
                    this.setCellStyle(r, c, styleObj);
                }
            }
        }
        this.invalidateCache();
    }

    resolveStyle(r, c) {
        const realR = this.#sheet.toRealRow(r);
        const key = `${realR},${c}`;

        if (this.#styleCacheFrameVersion === this.#styleCacheVersion) {
            const cached = this.#styleCache.get(key);
            if (cached !== undefined) return cached;
        } else {
            this.#styleCacheFrameVersion = this.#styleCacheVersion;
            this.#styleCache.clear();
        }

        const base = stylePool.getStyle(this.#defaultStyleId);
        const colStyleId = this.#sheet.colStyles.get(c);
        const rowStyleId = this.#sheet.rowStyles.get(realR);
        const cell = this.#sheet.cellStore.get(realR, c);
        const cellStyleId = cell?.styleId;

        if (!colStyleId && !rowStyleId && !cellStyleId && !this.#sheet.cellsFn && !this.#sheet.columnsConfig.get(c)?.style) {
            this.#styleCache.set(key, base);
            return base;
        }

        let style = base;
        if (colStyleId) style = { ...style, ...stylePool.getStyle(colStyleId) };
        if (rowStyleId) style = { ...style, ...stylePool.getStyle(rowStyleId) };
        if (cellStyleId) style = { ...style, ...stylePool.getStyle(cellStyleId) };

        const cellType = this.#sheet.getCellTypeInstance(r, c);
        if (cellType) {
            style = cellType.getDefaultStyle(style);
        }

        const cellProps = this.#sheet.resolveCellProperties(r, c);
        if (cellProps?.style) style = { ...style, ...cellProps.style };

        this.#styleCache.set(key, style);
        return style;
    }
}
