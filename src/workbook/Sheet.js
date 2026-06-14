import {stylePool, DEFAULT_STYLE_ID} from "../styles/index.js";
import {
    ChunkedCellStore,
    ConditionalRule,
    SelectionManager,
    SetCellCommand,
    ToggleDisableCommand,
    HistoryStack,
    MergeManager,
    MergeCommand,
    UnmergeCommand,
    Cell,
} from "../model/index.js";
import {RowColManager} from "../core/RowColManager.js";
import {CONFIG} from "../constants/config";
import {STYLE_LEVEL} from "../constants/styleLevel";

export class Sheet {
    #renderEngine = null;

    constructor(name, renderEngine) {
        this.name = name;
        this.workbook = null;
        this.visible = true;

        this.cellStore = new ChunkedCellStore();
        this.selection = new SelectionManager();
        this.history = new HistoryStack();
        this.mergeManager = new MergeManager();
        this.rowColManager = new RowColManager();
        this.conditionalRules = [];
        this.rowStyles = new Map();
        this.colStyles = new Map();
        this.dataBindings = new Map();

        this.colHeaders = true;
        this.rowHeaders = true;

        if (renderEngine) this.#renderEngine = renderEngine;
    }

    get renderEngine() { return this.#renderEngine; }
    set renderEngine(engine) { this.#renderEngine = engine; }

    toRealRow(pageRow) {
        const offset = this.rowColManager.pageStartRow;
        return offset >= 0 ? offset + pageRow : pageRow;
    }

    toPageRow(realRow) {
        const offset = this.rowColManager.pageStartRow;
        return offset >= 0 ? realRow - offset : realRow;
    }

    #invalidateAll() {
        const re = this.#renderEngine;
        if (re && typeof re.invalidateAll === 'function') re.invalidateAll();
    }

    #invalidateCell(r, c) {
        const re = this.#renderEngine;
        if (re && typeof re.invalidateCell === 'function') re.invalidateCell(r, c);
    }

    setCell(r, c, value, styleId = 0) {
        const realR = this.toRealRow(r);
        this.rowColManager.ensureSize(realR + 1, c + 1);
        const old = this.cellStore.get(realR, c);
        const cell = new Cell(value, styleId);
        this.history.push(new SetCellCommand(this.cellStore, realR, c, old, cell));
        this.cellStore.set(realR, c, cell);
        this.#invalidateCell(realR, c);
    }

    disableCell(r, c) {
        const realR = this.toRealRow(r);
        this.rowColManager.ensureSize(realR + 1, c + 1);
        let cell = this.cellStore.get(realR, c);
        const oldState = cell?.disabled || false;
        if (!cell) {
            cell = new Cell("", 0, true);
        } else {
            cell.disabled = true;
        }
        this.history.push(new ToggleDisableCommand(this.cellStore, realR, c, oldState));
        this.cellStore.set(realR, c, cell);
        this.#invalidateCell(realR, c);
    }

    enableCell(r, c) {
        const realR = this.toRealRow(r);
        const cell = this.cellStore.get(realR, c);
        if (!cell) return;
        const oldState = cell.disabled;
        cell.disabled = false;
        this.history.push(new ToggleDisableCommand(this.cellStore, realR, c, oldState));
        this.#invalidateCell(realR, c);
    }

    isDisabled(r, c) {
        const realR = this.toRealRow(r);
        return this.cellStore.get(realR, c)?.disabled === true;
    }

    setRowStyle(row, styleId) {
        this.rowStyles.set(row, styleId);
    }

    setColStyle(col, styleId) {
        this.colStyles.set(col, styleId);
    }

    addConditionalRule(range, conditionFn, styleId) {
        this.conditionalRules.push(new ConditionalRule(range, conditionFn, styleId));
    }

    matchConditionalStyle(r, c, cell) {
        const realR = this.toRealRow(r);
        for (const rule of this.conditionalRules) {
            if (rule.match(realR, c, cell)) return rule.styleId;
        }
        return null;
    }

    bindDataStyle(col, mapperFn) {
        this.dataBindings.set(col, mapperFn);
    }

    getDataBindStyle(r, c) {
        const realR = this.toRealRow(r);
        const fn = this.dataBindings.get(c);
        if (!fn) return null;
        const cell = this.cellStore.get(realR, c);
        return fn(cell?.value);
    }

    getColHeader(col) {
        const ch = this.colHeaders;
        if (ch === true || ch == null) return this.#defaultColLabel(col);
        if (Array.isArray(ch)) return col < ch.length ? ch[col] : this.#defaultColLabel(col);
        if (typeof ch === 'function') return ch(col);
        return this.#defaultColLabel(col);
    }

    getRowHeader(row) {
        const rh = this.rowHeaders;
        if (rh === true || rh == null) return String(row + 1);
        if (Array.isArray(rh)) return row < rh.length ? rh[row] : String(row + 1);
        if (typeof rh === 'function') return rh(row);
        return String(row + 1);
    }

    #defaultColLabel(col) {
        let label = "";
        let n = col;
        do {
            label = String.fromCharCode(65 + (n % 26)) + label;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return label;
    }

    loadData(data) {
        if (!Array.isArray(data)) return;
        const rows = data.length;
        if (rows === 0) return;

        let maxCols = 0;
        for (let r = 0; r < rows; r++) {
            const row = data[r];
            if (Array.isArray(row) && row.length > maxCols) {
                maxCols = row.length;
            }
        }
        if (maxCols === 0) return;

        this.rowColManager.ensureSize(rows, maxCols);

        for (let r = 0; r < rows; r++) {
            const row = data[r];
            if (!Array.isArray(row)) continue;
            for (let c = 0; c < row.length; c++) {
                if (row[c] !== undefined && row[c] !== null && row[c] !== '') {
                    this.cellStore.set(r, c, new Cell(row[c], 0));
                }
            }
        }

        this.#invalidateAll();
        this.#refreshPagination();
    }

    #refreshPagination() {
        const pg = this.workbook?.getPlugin('pagination');
        if (pg && pg.active) {
            pg.refresh();
        }
    }

    resolveStyle(r, c) {
        const realR = this.toRealRow(r);
        const base = stylePool.getStyle(DEFAULT_STYLE_ID);
        const colStyleId = this.colStyles.get(c);
        const rowStyleId = this.rowStyles.get(realR);
        const cell = this.cellStore.get(realR, c);
        const cellStyleId = cell?.styleId;

        if (!colStyleId && !rowStyleId && !cellStyleId) return base;

        let style = base;
        if (colStyleId) style = {...style, ...stylePool.getStyle(colStyleId)};
        if (rowStyleId) style = {...style, ...stylePool.getStyle(rowStyleId)};
        if (cellStyleId) style = {...style, ...stylePool.getStyle(cellStyleId)};
        return style;
    }

    mergeCells(topRow, topCol, bottomRow, bottomCol) {
        const cmd = new MergeCommand(this.mergeManager, topRow, topCol, bottomRow, bottomCol);
        cmd.redo();
        if (cmd.succeeded) {
            this.history.push(cmd);
            this.#invalidateAll();
        }
        return cmd.succeeded;
    }

    unmergeCells(row, col) {
        const cmd = new UnmergeCommand(this.mergeManager, row, col);
        cmd.redo();
        if (cmd.oldMerge) {
            this.history.push(cmd);
            this.#invalidateAll();
            return true;
        }
        return false;
    }

    getMerge(row, col) {
        const realRow = this.toRealRow(row);
        const merge = this.mergeManager.getMerge(realRow, col);
        if (!merge) return null;
        const offset = this.rowColManager.pageStartRow;
        if (offset < 0) return merge;
        return {
            ...merge,
            topRow: merge.topRow - offset,
            bottomRow: merge.bottomRow - offset,
        };
    }

    isMergeTopLeft(row, col) {
        const realRow = this.toRealRow(row);
        return this.mergeManager.isTopLeft(realRow, col);
    }

    isMergedCell(row, col) {
        const realRow = this.toRealRow(row);
        return this.mergeManager.isMerged(realRow, col);
    }

    getAllMerges() {
        return this.mergeManager.getAllMerges();
    }

    render() {
        const re = this.#renderEngine;
        if (re && typeof re.render === 'function') re.render(this);
    }

    undo() {
        this.history.undo();
        this.#invalidateAll();
    }

    redo() {
        this.history.redo();
        this.#invalidateAll();
    }

    insertRow(atRow) {
        if (atRow < 0 || atRow >= CONFIG.MAX_ROWS) return;
        this.rowColManager.insertRow(atRow);
        this.cellStore.insertRow(atRow);
        this.mergeManager.insertRow(atRow);
        this.#invalidateAll();
    }

    insertCol(atCol) {
        if (atCol < 0 || atCol >= CONFIG.MAX_COLS) return;
        this.rowColManager.insertCol(atCol);
        this.cellStore.insertCol(atCol);
        this.mergeManager.insertCol(atCol);
        this.#invalidateAll();
    }

    deleteRow(atRow) {
        if (atRow < 0 || atRow >= CONFIG.MAX_ROWS) return;
        this.rowColManager.deleteRow(atRow);
        this.cellStore.deleteRow(atRow);
        this.mergeManager.deleteRow(atRow);
        this.#invalidateAll();
    }

    deleteCol(atCol) {
        if (atCol < 0 || atCol >= CONFIG.MAX_COLS) return;
        this.rowColManager.deleteCol(atCol);
        this.cellStore.deleteCol(atCol);
        this.mergeManager.deleteCol(atCol);
        this.#invalidateAll();
    }

    moveCol(fromCol, toCol) {
        if (fromCol === toCol || fromCol < 0 || toCol < 0) return;
        if (fromCol >= CONFIG.MAX_COLS || toCol >= CONFIG.MAX_COLS) return;

        this.cellStore.moveCol(fromCol, toCol);
        this.rowColManager.moveCol(fromCol, toCol);
        this.mergeManager.moveCol(fromCol, toCol);

        if (Array.isArray(this.colHeaders) && this.colHeaders.length > Math.max(fromCol, toCol)) {
            const [header] = this.colHeaders.splice(fromCol, 1);
            this.colHeaders.splice(toCol, 0, header);
        }

        this.#invalidateAll();
    }
}