import { CONFIG } from "../../constants/config";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import { errorHandler, ERROR_CODE, ERROR_LEVEL } from "../../core/ErrorHandler.js";
import { ISheet } from "../interfaces/ISheet.js";

/** @enum {string} 子系统行列操作方法名（供 #dispatchToSubSystems 使用） */
const SUB = {
    INSERT_ROW: "insertRow",
    INSERT_COL: "insertCol",
    DELETE_ROW: "deleteRow",
    DELETE_COL: "deleteCol",
    MOVE_ROW: "moveRow",
    MOVE_COL: "moveCol",
};

/**
 * 工作表操作协调者
 *
 * 负责：
 * - 撤销/重做操作
 * - 渲染触发
 * - 批量操作管理
 * - 行列插入/删除/移动
 * - 动态行列尺寸调整
 *
 * 特点：
 * - 所有操作都有权限检查
 * - 行列操作会同步更新所有子系统
 * - 支持边界检查和错误处理
 * - 通过 ISheet 接口解耦对具体实现的依赖
 */
export class SheetOperationCoordinator {
    /** @type {ISheet} */
    #sheet;

    /**
     * @param {ISheet} sheet - 所属工作表实例（通过接口访问）
     */
    constructor(sheet) {
        this.#sheet = sheet;
    }

    // ─── 批量操作 ─────────────────────────────────────

    beginBatch() {
        this.#sheet.batchOp.beginBatch();
    }

    endBatch() {
        this.#sheet.batchOp.endBatch(this.#sheet.history);
    }

    // ─── 渲染控制 ─────────────────────────────────────

    /**
     * 触发工作表重新渲染
     *
     * 通过事件总线通知 Workbook 执行实际的 Canvas 重绘
     */
    render() {
        this.#sheet.bus.emit(SHEET_EVENTS.RENDER_REQUEST);
    }

    // ─── 撤销 / 重做 ──────────────────────────────────

    /**
     * 撤销上一步操作
     */
    undo() {
        if (!this.#sheet._ensureWritable()) return;

        this.#sheet.history.undo();
        this.#sheet.bus.emit(SHEET_EVENTS.UNDO);
        this.#sheet._invalidateAll();
    }

    /**
     * 重做上一步撤销的操作
     */
    redo() {
        if (!this.#sheet._ensureWritable()) return;

        this.#sheet.history.redo();
        this.#sheet.bus.emit(SHEET_EVENTS.REDO);
        this.#sheet._invalidateAll();
    }

    // ─── 行列操作：插入 ────────────────────────────────

    /**
     * 在指定位置插入新行
     * @param {number} atRow - 插入位置的行号
     */
    insertRow(atRow) {
        if (!this.#sheet._ensureWritable()) return;
        if (!this.#isValidIndex(atRow, CONFIG.MAX_ROWS)) return;

        this.#dispatchToSubSystems(SUB.INSERT_ROW, atRow);
        this.#sheet.rowSync.insert(atRow);
    }

    /**
     * 在指定位置插入新列
     * @param {number} atCol - 插入位置的列号
     */
    insertCol(atCol) {
        if (!this.#sheet._ensureWritable()) return;
        if (!this.#isValidIndex(atCol, CONFIG.MAX_COLS)) return;

        this.#dispatchToSubSystems(SUB.INSERT_COL, atCol);
        this.#sheet.colSync.insert(atCol);
    }

    // ─── 行列操作：删除 ────────────────────────────────

    /**
     * 删除指定行
     * @param {number} atRow - 要删除的行号
     */
    deleteRow(atRow) {
        if (!this.#sheet._ensureWritable()) return;
        if (!this.#isValidIndex(atRow, CONFIG.MAX_ROWS)) return;

        this.#dispatchToSubSystems(SUB.DELETE_ROW, atRow);
        this.#sheet.rowSync.delete(atRow);
    }

    /**
     * 删除指定列
     * @param {number} atCol - 要删除的列号
     */
    deleteCol(atCol) {
        if (!this.#sheet._ensureWritable()) return;
        if (!this.#isValidIndex(atCol, CONFIG.MAX_COLS)) return;

        this.#dispatchToSubSystems(SUB.DELETE_COL, atCol);
        this.#sheet.colSync.delete(atCol);
    }

    // ─── 行列操作：移动 ────────────────────────────────

    /**
     * 移动列：将 fromCol 的数据移到 toCol 位置
     * @param {number} fromCol - 源列号
     * @param {number} toCol - 目标列号
     */
    moveCol(fromCol, toCol) {
        if (!this.#sheet._ensureWritable()) return;
        if (fromCol === toCol || fromCol < 0 || toCol < 0) return;
        if (fromCol >= CONFIG.MAX_COLS || toCol >= CONFIG.MAX_COLS) return;

        this.#dispatchToSubSystems(SUB.MOVE_COL, fromCol, toCol);
        this.#sheet.colSync.move(fromCol, toCol);
        this.#sheet._invalidateAll();
    }

    /**
     * 移动行：将 fromRow 的数据移到 toRow 位置
     * @param {number} fromRow - 源行号
     * @param {number} toRow - 目标行号
     */
    moveRow(fromRow, toRow) {
        if (!this.#sheet._ensureWritable()) return;
        if (fromRow === toRow || fromRow < 0 || toRow < 0) return;
        if (fromRow >= CONFIG.MAX_ROWS || toRow >= CONFIG.MAX_ROWS) return;

        this.#dispatchToSubSystems(SUB.MOVE_ROW, fromRow, toRow);
        this.#sheet.rowSync.move(fromRow, toRow);
        this.#sheet._invalidateAll();
    }

    // ─── 动态尺寸调整 ──────────────────────────────────

    /**
     * 动态设置行数
     * @param {number} rows - 新的行数（必须 >= 1）
     */
    setRowCount(rows) {
        if (!Number.isInteger(rows) || rows < 1) {
            errorHandler.warn(ERROR_CODE.GENERIC_WARN, `[Sheet] setRowCount: invalid rows=${rows}, must be integer >= 1`);
            return;
        }

        const currentCols = this.#sheet.rowColManager.colCount;
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[Sheet] setRowCount: ${this.#sheet.rowColManager.rowCount} → ${rows}`);

        this.#sheet.rowColManager.resetSize(rows, currentCols);
        this.#finishResize();
    }

    /**
     * 动态设置列数
     * @param {number} cols - 新的列数（必须 >= 1）
     */
    setColCount(cols) {
        if (!Number.isInteger(cols) || cols < 1) {
            errorHandler.warn(ERROR_CODE.GENERIC_WARN, `[Sheet] setColCount: invalid cols=${cols}, must be integer >= 1`);
            return;
        }

        const currentRows = this.#sheet.rowColManager.rowCount;
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[Sheet] setColCount: ${this.#sheet.rowColManager.colCount} → ${cols}`);

        this.#sheet.rowColManager.resetSize(currentRows, cols);
        this.#finishResize();
    }

    /**
     * 同时动态设置行数和列数
     * @param {number} rows - 新的行数（必须 >= 1）
     * @param {number} cols - 新的列数（必须 >= 1）
     */
    setGridSize(rows, cols) {
        if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1) {
            errorHandler.warn(ERROR_CODE.GENERIC_WARN, `[Sheet] setGridSize: invalid size ${rows}x${cols}, must be integers >= 1`);
            return;
        }

        errorHandler.debug(
            ERROR_CODE.DEBUG_LOG,
            `[Sheet] setGridSize: ${this.#sheet.rowColManager.rowCount}x${this.#sheet.rowColManager.colCount} → ${rows}x${cols}`,
        );

        this.#sheet.rowColManager.resetSize(rows, cols);
        this.#finishResize();
    }

    // ─── 内部方法 ──────────────────────────────────────

    /**
     * 将行列操作分发给所有子系统
     *
     * 受影响的子系统：
     * - RowColManager: 更新尺寸和坐标
     * - ChunkedCellStore: 移动/删除数据
     * - MergeManager: 更新合并区域坐标
     * - ChartManager: 更新图表数据引用
     *
     * @param {string} method - 方法名（如 "insertRow"）
     * @param {...*} args - 参数列表
     */
    #dispatchToSubSystems(method, ...args) {
        this.#sheet.rowColManager[method](...args);
        this.#sheet.cellStore[method](...args);
        this.#sheet.mergeManager[method](...args);

        if (this.#sheet.chartManager && typeof this.#sheet.chartManager[method] === "function") {
            this.#sheet.chartManager[method](...args);
        }

        this.#sheet._invalidateAll();
    }

    /**
     * 验证索引是否在有效范围内
     * @param {number} index - 待验证的索引
     * @param {number} max - 最大允许值
     * @returns {boolean}
     */
    #isValidIndex(index, max) {
        return index >= 0 && index < max;
    }

    /**
     * 完成尺寸调整后的清理工作
     */
    #finishResize() {
        this.#sheet._invalidateAll();
        this.render();
        this.#sheet.bus.emit(SHEET_EVENTS.AFTER_CHANGE, { changes: [] });
    }
}