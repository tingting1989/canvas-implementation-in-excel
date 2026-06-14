import {CONFIG, STYLE_LEVEL} from "../core/constants.js";
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

export class Sheet {
    constructor(name, renderEngine) {
        this.name = name;
        this.cellStore = new ChunkedCellStore();
        this.selection = new SelectionManager();
        this.history = new HistoryStack();
        this.mergeManager = new MergeManager();
        this.conditionalRules = [];
        this.visible = true;
        this.renderEngine = renderEngine;
        /** 所属工作簿引用（由 Workbook.addSheet 设置） */
        this.workbook = null;

        this.rowColManager = new RowColManager();

        this.rowStyles = new Map();
        this.colStyles = new Map();

        this.dataBindings = new Map();
    }

    setCell(r, c, value, styleId = 0) {
        this.rowColManager.ensureSize(r + 1, c + 1);
        const old = this.cellStore.get(r, c);
        const cell = new Cell(value, styleId);
        this.history.push(new SetCellCommand(this.cellStore, r, c, old, cell));
        this.cellStore.set(r, c, cell);
        if (this.renderEngine && typeof this.renderEngine.invalidateCell === 'function') {
            this.renderEngine.invalidateCell(r, c);
        }
    }

    disableCell(r, c) {
        this.rowColManager.ensureSize(r + 1, c + 1);
        let cell = this.cellStore.get(r, c);
        const oldState = cell?.disabled || false;
        if (!cell) {
            cell = new Cell("", 0, true);
        } else {
            cell.disabled = true;
        }
        this.history.push(new ToggleDisableCommand(this.cellStore, r, c, oldState));
        this.cellStore.set(r, c, cell);
        if (this.renderEngine && typeof this.renderEngine.invalidateCell === 'function') {
            this.renderEngine.invalidateCell(r, c);
        }
    }

    enableCell(r, c) {
        const cell = this.cellStore.get(r, c);
        if (!cell) return;
        const oldState = cell.disabled;
        cell.disabled = false;
        this.history.push(new ToggleDisableCommand(this.cellStore, r, c, oldState));
        if (this.renderEngine && typeof this.renderEngine.invalidateCell === 'function') {
            this.renderEngine.invalidateCell(r, c);
        }
    }

    isDisabled(r, c) {
        return this.cellStore.get(r, c)?.disabled === true;
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
        for (const rule of this.conditionalRules) {
            if (rule.match(r, c, cell)) return rule.styleId;
        }
        return null;
    }

    bindDataStyle(col, mapperFn) {
        this.dataBindings.set(col, mapperFn);
    }

    getDataBindStyle(r, c) {
        const fn = this.dataBindings.get(c);
        if (!fn) return null;
        const cell = this.cellStore.get(r, c);
        return fn(cell?.value);
    }

    resolveStyle(r, c) {
        let style = stylePool.getStyle(DEFAULT_STYLE_ID);

        const colStyleId = this.colStyles.get(c);
        if (colStyleId) {
            style = {...style, ...stylePool.getStyle(colStyleId)};
        }

        const rowStyleId = this.rowStyles.get(r);
        if (rowStyleId) {
            style = {...style, ...stylePool.getStyle(rowStyleId)};
        }

        const cell = this.cellStore.get(r, c);
        if (cell?.styleId) {
            style = {...style, ...stylePool.getStyle(cell.styleId)};
        }

        return style;
    }

    mergeCells(topRow, topCol, bottomRow, bottomCol) {
        const cmd = new MergeCommand(this.mergeManager, topRow, topCol, bottomRow, bottomCol);
        cmd.redo();
        if (cmd.succeeded) {
            this.history.push(cmd);
            if (this.renderEngine && typeof this.renderEngine.invalidateAll === 'function') {
                this.renderEngine.invalidateAll();
            }
        }
        return cmd.succeeded;
    }

    unmergeCells(row, col) {
        const cmd = new UnmergeCommand(this.mergeManager, row, col);
        cmd.redo();
        if (cmd.oldMerge) {
            this.history.push(cmd);
            if (this.renderEngine && typeof this.renderEngine.invalidateAll === 'function') {
                this.renderEngine.invalidateAll();
            }
            return true;
        }
        return false;
    }

    getMerge(row, col) {
        return this.mergeManager.getMerge(row, col);
    }

    isMergeTopLeft(row, col) {
        return this.mergeManager.isTopLeft(row, col);
    }

    isMergedCell(row, col) {
        return this.mergeManager.isMerged(row, col);
    }

    getAllMerges() {
        return this.mergeManager.getAllMerges();
    }

    render() {
        if (this.renderEngine && typeof this.renderEngine.render === 'function') {
            this.renderEngine.render(this);
        }
    }

    undo() {
        this.history.undo();
        if (this.renderEngine && typeof this.renderEngine.invalidateAll === 'function') {
            this.renderEngine.invalidateAll();
        }
    }

    redo() {
        this.history.redo();
        if (this.renderEngine && typeof this.renderEngine.invalidateAll === 'function') {
            this.renderEngine.invalidateAll();
        }
    }

    /**
     * 插入行
     * 在指定行号处插入一个空行，该行及以下所有数据下移一行
     * 协调 RowColManager、ChunkedCellStore、MergeManager 三者
     *
     * @param {number} atRow - 插入位置的行号（新行将出现在此位置）
     */
    insertRow(atRow) {
        if (atRow < 0 || atRow >= CONFIG.MAX_ROWS) return;

        this.rowColManager.insertRow(atRow);
        this.cellStore.insertRow(atRow);
        this.mergeManager.insertRow(atRow);

        if (this.renderEngine && typeof this.renderEngine.invalidateAll === 'function') {
            this.renderEngine.invalidateAll();
        }
    }

    /**
     * 插入列
     * 在指定列号处插入一个空列，该列及右侧所有数据右移一列
     *
     * @param {number} atCol - 插入位置的列号（新列将出现在此位置）
     */
    insertCol(atCol) {
        if (atCol < 0 || atCol >= CONFIG.MAX_COLS) return;

        this.rowColManager.insertCol(atCol);
        this.cellStore.insertCol(atCol);
        this.mergeManager.insertCol(atCol);

        if (this.renderEngine && typeof this.renderEngine.invalidateAll === 'function') {
            this.renderEngine.invalidateAll();
        }
    }

    /**
     * 删除行
     * 删除指定行号处的行，该行以下所有数据上移一行
     *
     * @param {number} atRow - 要删除的行号
     */
    deleteRow(atRow) {
        if (atRow < 0 || atRow >= CONFIG.MAX_ROWS) return;

        this.rowColManager.deleteRow(atRow);
        this.cellStore.deleteRow(atRow);
        this.mergeManager.deleteRow(atRow);

        if (this.renderEngine && typeof this.renderEngine.invalidateAll === 'function') {
            this.renderEngine.invalidateAll();
        }
    }

    /**
     * 删除列
     * 删除指定列号处的列，该列右侧所有数据左移一列
     *
     * @param {number} atCol - 要删除的列号
     */
    deleteCol(atCol) {
        if (atCol < 0 || atCol >= CONFIG.MAX_COLS) return;

        this.rowColManager.deleteCol(atCol);
        this.cellStore.deleteCol(atCol);
        this.mergeManager.deleteCol(atCol);

        if (this.renderEngine && typeof this.renderEngine.invalidateAll === 'function') {
            this.renderEngine.invalidateAll();
        }
    }
}