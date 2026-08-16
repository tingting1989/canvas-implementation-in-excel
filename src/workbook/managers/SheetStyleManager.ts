import { stylePool, DEFAULT_STYLE_ID } from "../../model/styles/index";
import { Cell } from "../../model/store/Cell";
import { StyleChangeRecorder, StyleChangeCommand } from "../../model/command/StyleChangeRecorder";
import { STYLE_SCOPE } from "../../constants/enums/StyleScope";
import { themeStyleProvider } from "../../theme/index";
import type { Sheet } from "../Sheet";
import type { StyleObject } from "../interfaces/ISheet";
import type { CellRange } from "../../model/types";

/**
 * 工作表样式管理器
 *
 * 负责管理单个工作表（Sheet）的样式体系，包括：
 * - 默认样式（defaultStyle）：所有单元格的基础样式
 * - 行样式（rowStyles）：整行应用的样式
 * - 列样式（colStyles）：整列应用的样式
 * - 单元格样式（cell.styleId）：单个单元格的样式
 *
 * 样式优先级（从低到高，后者覆盖前者同名属性）：
 *   第1层: defaultStyle（基础默认样式）
 *   第2层: themeStyle（主题样式，按单元格类型匹配）
 *   第3层: colStyle（列级样式）
 *   第4层: rowStyle（行级样式）
 *   第5层: cellStyle（单元格级样式）
 *   第6层: cellType默认样式（如数字列右对齐）
 *   第7层: cellProps.style（cells/cell 配置中的样式）
 *   第8层: conditionalFormat（条件格式样式）
 *   第9层: dataBinding（数据绑定样式）
 *
 * 缓存机制：
 * - 内部维护 #styleCache（Map）和版本号 #styleCacheVersion
 * - 任何样式变更都递增版本号，resolveStyle 检测版本不一致则清空缓存
 * - 同一渲染帧内，版本号一致时直接从缓存读取，避免重复计算
 *
 * 撤销/重做：
 * - 所有样式修改操作通过 StyleChangeRecorder 记录变更
 * - 调用 buildStyleCommand() 生成可撤销/重做的 Command 对象
 * - Command 内部调用 applyStyleId() 恢复或重做样式
 *
 * 主题订阅：
 * - 构造时订阅 themeStyleProvider，主题切换时自动失效缓存
 * - 销毁时需调用 destroy() 取消订阅，避免内存泄漏
 */
export class SheetStyleManager {
    #sheet: Sheet;
    #rowStyles: Map<number, number> = new Map();
    #colStyles: Map<number, number> = new Map();
    #defaultStyleId: number = DEFAULT_STYLE_ID;
    #styleCache: Map<string, StyleObject> = new Map();
    #styleCacheVersion: number = 0;
    #styleCacheFrameVersion: number = -1;
    #recorder: StyleChangeRecorder = new StyleChangeRecorder();
    #unsubscribeTheme: (() => void) | null = null;

    constructor(sheet: Sheet) {
        this.#sheet = sheet;

        this.#unsubscribeTheme = themeStyleProvider.subscribe(() => {
            this.invalidateCache();
        });
    }

    /**
     * 销毁样式管理器
     *
     * 取消主题订阅，避免内存泄漏。Sheet 销毁时调用。
     */
    destroy(): void {
        if (this.#unsubscribeTheme) {
            this.#unsubscribeTheme();
            this.#unsubscribeTheme = null;
        }
    }

    get rowStyles(): Map<number, number> {
        return this.#rowStyles;
    }

    get colStyles(): Map<number, number> {
        return this.#colStyles;
    }

    get defaultStyleId(): number {
        return this.#defaultStyleId;
    }

    /** 使样式缓存失效（递增版本号，下次 resolveStyle 时清空缓存） */
    invalidateCache(): void {
        this.#styleCacheVersion++;
    }

    /**
     * 设置行样式 ID
     * @param row - 行号
     * @param styleId - 样式 ID
     */
    setRowStyle(row: number, styleId: number): void {
        const oldStyleId = this.#rowStyles.get(row) || 0;
        this.#recorder.record("row", String(row), oldStyleId, styleId);
        this.#rowStyles.set(row, styleId);
        this.invalidateCache();
    }

    /**
     * 设置列样式 ID
     * @param col - 列号
     * @param styleId - 样式 ID
     */
    setColStyle(col: number, styleId: number): void {
        const oldStyleId = this.#colStyles.get(col) || 0;
        this.#recorder.record("col", String(col), oldStyleId, styleId);
        this.#colStyles.set(col, styleId);
        this.invalidateCache();
    }

    /**
     * 设置默认样式（与已有默认样式合并）
     * @param styleObj - 样式对象
     */
    setDefaultStyle(styleObj: StyleObject): void {
        const current = this.#defaultStyleId ? stylePool.getStyle(this.#defaultStyleId) : {};
        const merged = { ...current, ...styleObj };
        this.#defaultStyleId = stylePool.getStyleId(merged);
        this.invalidateCache();
    }

    /**
     * 获取默认样式
     * @returns 默认样式对象
     */
    getDefaultStyle(): StyleObject {
        return stylePool.getStyle(this.#defaultStyleId);
    }

    /**
     * 设置单元格样式（与已有样式合并）
     * @param r - 行号
     * @param c - 列号
     * @param styleObj - 样式对象
     */
    setCellStyle(r: number, c: number, styleObj: StyleObject): void {
        this.#sheet.rowColManager.ensureSize(r + 1, c + 1);
        const cell = this.#sheet.cellStore.get(r, c);
        const currentStyleId = cell?.styleId || 0;

        const currentStyle = currentStyleId ? stylePool.getStyle(currentStyleId) : {};

        const mergedStyle = { ...currentStyle, ...styleObj };
        const newStyleId = stylePool.getStyleId(mergedStyle);
        const value = cell?.value ?? "";

        this.#recorder.record("cell", `${r},${c}`, currentStyleId, newStyleId);
        this.#sheet.cellStore.set(r, c, new Cell(value, newStyleId, cell?.disabled || false));
        this.invalidateCache();
    }

    /**
     * 清除单元格样式
     * @param r - 行号
     * @param c - 列号
     */
    clearCellStyle(r: number, c: number): void {
        const cell = this.#sheet.cellStore.get(r, c);
        if (!cell || cell.styleId === 0) return;
        this.#sheet.cellStore.set(r, c, new Cell(cell.value, 0, cell.disabled));
        this.invalidateCache();
    }

    /** 清除行样式 @param row - 行号 */
    clearRowStyle(row: number): void {
        if (!this.#rowStyles.has(row)) return;
        this.#rowStyles.delete(row);
        this.invalidateCache();
    }

    /** 清除列样式 @param col - 列号 */
    clearColStyle(col: number): void {
        if (!this.#colStyles.has(col)) return;
        this.#colStyles.delete(col);
        this.invalidateCache();
    }

    /**
     * 设置区域样式
     *
     * 智能分派：
     * - 选区覆盖整行 → 设置行样式
     * - 选区覆盖整列 → 设置列样式
     * - 否则 → 逐单元格设置
     *
     * @param range - 单元格区域
     * @param styleObj - 样式对象
     */
    setRangeStyle(range: CellRange, styleObj: StyleObject): void {
        const { topRow, topCol, bottomRow, bottomCol } = range;
        const rowColManager = this.#sheet.rowColManager;

        if (topCol === 0 && bottomCol >= rowColManager.colCount - 1) {
            for (let r = topRow; r <= bottomRow; r++) {
                const existingId = this.#rowStyles.get(r);
                const existing = existingId ? stylePool.getStyle(existingId) : {};
                const merged = { ...existing, ...styleObj };
                const newId = stylePool.getStyleId(merged);
                this.#recorder.record("row", String(r), existingId || 0, newId);
                this.#rowStyles.set(r, newId);
            }
            this.invalidateCache();
            return;
        }

        if (topRow === 0 && bottomRow >= rowColManager.rowCount - 1) {
            for (let c = topCol; c <= bottomCol; c++) {
                const existingId = this.#colStyles.get(c);
                const existing = existingId ? stylePool.getStyle(existingId) : {};
                const merged = { ...existing, ...styleObj };
                const newId = stylePool.getStyleId(merged);
                this.#recorder.record("col", String(c), existingId || 0, newId);
                this.#colStyles.set(c, newId);
            }
            this.invalidateCache();
            return;
        }

        const accessor = this.#sheet.cellDataAccessor;
        accessor.forEach(topRow, topCol, bottomRow, bottomCol, (r: number, c: number) => {
            if (!this.#sheet.isDisabled(r, c)) {
                this.setCellStyle(r, c, styleObj);
            }
        });
        this.invalidateCache();
    }

    /**
     * 清除区域样式（行样式 + 单元格样式）
     * @param range - 单元格区域
     */
    clearRangeStyle(range: CellRange): void {
        const { topRow, topCol, bottomRow, bottomCol } = range;
        const accessor = this.#sheet.cellDataAccessor;

        for (let r = topRow; r <= bottomRow; r++) {
            this.#rowStyles.delete(r);
        }

        accessor.forEach(topRow, topCol, bottomRow, bottomCol, (r: number, c: number) => {
            this.clearCellStyle(r, c);
        });
        this.invalidateCache();
    }

    /**
     * 根据列类型名称获取主题样式
     *
     * 将列类型名映射到主题样式键（如 hyperlink → "cell.hyperlink"），
     * 未匹配时使用 "cell.default"。
     *
     * @param cellType - 列类型实例（含 name 属性）
     * @returns 主题样式对象
     */
    #getThemeStyleByCellType(cellType: { name?: string } | null): StyleObject {
        const typeToStyleMap: Record<string, string> = {
            hyperlink: "cell.hyperlink",
            numeric: "cell.numeric",
            text: "cell.text",
            textarea: "cell.textarea",
            date: "cell.date",
            checkbox: "cell.checkbox",
            selected: "cell.selected",
        };
        const styleType = typeToStyleMap[cellType?.name ?? ""] || "cell.default";
        return themeStyleProvider.getStyle(styleType);
    }

    /**
     * 解析单元格最终样式
     *
     * 按 9 层优先级从低到高合并：
     * 1. defaultStyle → 2. themeStyle → 3. colStyle → 4. rowStyle
     * → 5. cellStyle → 6. typeDefaultStyle → 7. cellProps.style
     * → 8. conditionalFormat → 9. dataBinding
     *
     * 带缓存：同一渲染帧内版本号一致时直接返回缓存结果。
     *
     * @param r - 行号
     * @param c - 列号
     * @returns 合并后的最终样式对象
     */
    resolveStyle(r: number, c: number): StyleObject {
        const key = `${r},${c}`;

        if (this.#styleCacheFrameVersion === this.#styleCacheVersion) {
            const cached = this.#styleCache.get(key);
            if (cached !== undefined) return cached;
        } else {
            this.#styleCacheFrameVersion = this.#styleCacheVersion;
            this.#styleCache.clear();
        }

        const base = stylePool.getStyle(this.#defaultStyleId);
        const colStyleId = this.#colStyles.get(c);
        const rowStyleId = this.#rowStyles.get(r);
        const cell = this.#sheet.cellStore.get(r, c);
        const cellStyleId = cell?.styleId;

        if (
            !colStyleId &&
            !rowStyleId &&
            !cellStyleId &&
            !this.#sheet.cellsFn &&
            !this.#sheet.columnsConfig.get(c)?.style &&
            !this.#sheet.hasConditionalRules() &&
            !this.#sheet.hasDataBindings()
        ) {
            const cellType = this.#sheet.getCellTypeInstance(r, c);
            const themeStyle = this.#getThemeStyleByCellType(cellType as { name?: string } | null);
            let result = { ...base, ...themeStyle };

            if (cellType) {
                result = cellType.getDefaultStyle(result);
            }

            this.#styleCache.set(key, result);
            return result;
        }

        const cellType = this.#sheet.getCellTypeInstance(r, c);

        const themeStyle = this.#getThemeStyleByCellType(cellType as { name?: string } | null);

        let style: StyleObject = { ...base, ...themeStyle };
        if (colStyleId) style = { ...style, ...stylePool.getStyle(colStyleId) };

        if (rowStyleId) style = { ...style, ...stylePool.getStyle(rowStyleId) };

        if (cellStyleId) style = { ...style, ...stylePool.getStyle(cellStyleId) };

        if (cellType) {
            style = cellType.getDefaultStyle(style);
        }

        const cellProps = this.#sheet.resolveCellProperties(r, c);
        if (cellProps?.style) style = { ...style, ...cellProps.style };

        const cfStyleId = this.#sheet.matchConditionalStyle(r, c, cell);
        if (cfStyleId) style = { ...style, ...stylePool.getStyle(cfStyleId) };

        const dbStyleId = this.#sheet.getDataBindStyle(r, c);
        if (dbStyleId) style = { ...style, ...stylePool.getStyle(dbStyleId) };

        this.#styleCache.set(key, style);
        return style;
    }

    /**
     * 应用样式 ID 到指定范围（撤销/重做时调用）
     *
     * @param type - 范围类型："row" | "col" | "cell"
     * @param key - 行号/列号/"r,c" 字符串
     * @param styleId - 样式 ID，0 表示清除
     */
    applyStyleId(type: string, key: number | string, styleId: number): void {
        if (type === STYLE_SCOPE.ROW) {
            if (styleId === 0) {
                this.#rowStyles.delete(key as number);
            } else {
                this.#rowStyles.set(key as number, styleId);
            }
        } else if (type === STYLE_SCOPE.COL) {
            if (styleId === 0) {
                this.#colStyles.delete(key as number);
            } else {
                this.#colStyles.set(key as number, styleId);
            }
        } else if (type === STYLE_SCOPE.CELL) {
            const [r, c] = (key as string).split(",").map(Number);
            const cell = this.#sheet.cellStore.get(r, c);
            if (cell) {
                this.#sheet.cellStore.set(r, c, new Cell(cell.value, styleId, cell.disabled, cell.formula));
            }
        }
        this.invalidateCache();
    }

    /**
     * 构建样式变更命令（用于撤销/重做）
     * @returns 样式变更命令，无变更返回 null
     */
    buildStyleCommand(): StyleChangeCommand | null {
        return this.#recorder.buildCommand(this);
    }

    /** 重置样式变更记录器 */
    resetRecorder(): void {
        this.#recorder.reset();
    }
}
