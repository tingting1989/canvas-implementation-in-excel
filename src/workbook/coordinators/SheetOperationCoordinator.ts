import { CONFIG } from "../../constants/config";
import { SHEET_EVENTS } from "../../constants/sheetEvents";
import { errorHandler } from "../../core/ErrorHandler";
import type { ISheet } from "../interfaces/ISheet";
import { ERROR_CODE } from "../../constants/errorCodes";

const SUB = {
    INSERT_ROW: "insertRow",
    INSERT_COL: "insertCol",
    DELETE_ROW: "deleteRow",
    DELETE_COL: "deleteCol",
    MOVE_ROW: "moveRow",
    MOVE_COL: "moveCol",
} as const;

type SubMethod = (typeof SUB)[keyof typeof SUB];

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
    #sheet: ISheet;

    constructor(sheet: ISheet) {
        this.#sheet = sheet;
    }

    beginBatch(): void {
        this.#sheet.batchOp.beginBatch();
    }

    endBatch(): void {
        this.#sheet.batchOp.endBatch(this.#sheet.history);
    }

    render(): void {
        this.#sheet.bus.emit(SHEET_EVENTS.RENDER_REQUEST, null);
    }

    undo(): void {
        if (!this.#sheet._ensureWritable()) return;

        this.#sheet.history.undo();
        this.#sheet.bus.emit(SHEET_EVENTS.UNDO);
        this.#sheet._invalidateAll();
    }

    redo(): void {
        if (!this.#sheet._ensureWritable()) return;

        this.#sheet.history.redo();
        this.#sheet.bus.emit(SHEET_EVENTS.REDO, null);
        this.#sheet._invalidateAll();
    }

    insertRow(atRow: number): void {
        if (!this.#sheet._ensureWritable()) return;
        if (!this.#isValidIndex(atRow, CONFIG.MAX_ROWS)) return;

        this.#dispatchToSubSystems(SUB.INSERT_ROW, atRow);
        this.#sheet.rowSync.insert(atRow);
    }

    insertCol(atCol: number): void {
        if (!this.#sheet._ensureWritable()) return;
        if (!this.#isValidIndex(atCol, CONFIG.MAX_COLS)) return;

        this.#dispatchToSubSystems(SUB.INSERT_COL, atCol);
        this.#sheet.colSync.insert(atCol);
    }

    deleteRow(atRow: number): void {
        if (!this.#sheet._ensureWritable()) return;
        if (!this.#isValidIndex(atRow, CONFIG.MAX_ROWS)) return;

        this.#dispatchToSubSystems(SUB.DELETE_ROW, atRow);
        this.#sheet.rowSync.delete(atRow);
    }

    deleteCol(atCol: number): void {
        if (!this.#sheet._ensureWritable()) return;
        if (!this.#isValidIndex(atCol, CONFIG.MAX_COLS)) return;

        this.#dispatchToSubSystems(SUB.DELETE_COL, atCol);
        this.#sheet.colSync.delete(atCol);
    }

    moveCol(fromCol: number, toCol: number): void {
        if (!this.#sheet._ensureWritable()) return;
        if (fromCol === toCol || fromCol < 0 || toCol < 0) return;
        if (fromCol >= CONFIG.MAX_COLS || toCol >= CONFIG.MAX_COLS) return;

        this.#dispatchToSubSystems(SUB.MOVE_COL, fromCol, toCol);
        this.#sheet.colSync.move(fromCol, toCol);
        this.#sheet._invalidateAll();
    }

    moveRow(fromRow: number, toRow: number): void {
        if (!this.#sheet._ensureWritable()) return;
        if (fromRow === toRow || fromRow < 0 || toRow < 0) return;
        if (fromRow >= CONFIG.MAX_ROWS || toRow >= CONFIG.MAX_ROWS) return;

        this.#dispatchToSubSystems(SUB.MOVE_ROW, fromRow, toRow);
        this.#sheet.rowSync.move(fromRow, toRow);
        this.#sheet._invalidateAll();
    }

    setRowCount(rows: number): void {
        if (!Number.isInteger(rows) || rows < 1) {
            errorHandler.warn(ERROR_CODE.GENERIC_WARN, `[Sheet] setRowCount: invalid rows=${rows}, must be integer >= 1`);
            return;
        }

        const currentCols = this.#sheet.rowColManager.colCount;
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[Sheet] setRowCount: ${this.#sheet.rowColManager.rowCount} → ${rows}`);

        this.#sheet.rowColManager.resetSize(rows, currentCols);
        this.#finishResize();
    }

    setColCount(cols: number): void {
        if (!Number.isInteger(cols) || cols < 1) {
            errorHandler.warn(ERROR_CODE.GENERIC_WARN, `[Sheet] setColCount: invalid cols=${cols}, must be integer >= 1`);
            return;
        }

        const currentRows = this.#sheet.rowColManager.rowCount;
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[Sheet] setColCount: ${this.#sheet.rowColManager.colCount} → ${cols}`);

        this.#sheet.rowColManager.resetSize(currentRows, cols);
        this.#finishResize();
    }

    setGridSize(rows: number, cols: number): void {
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

    #dispatchToSubSystems(method: string, ...args: unknown[]): void {
        (this.#sheet.rowColManager as unknown as Record<string, (...a: unknown[]) => void>)[method](...args);
        (this.#sheet.cellStore as unknown as Record<string, (...a: unknown[]) => void>)[method](...args);
        (this.#sheet.mergeManager as unknown as Record<string, (...a: unknown[]) => void>)[method](...args);

        if (this.#sheet.chartManager && typeof (this.#sheet.chartManager as unknown as Record<string, unknown>)[method] === "function") {
            (this.#sheet.chartManager as unknown as Record<string, (...a: unknown[]) => void>)[method](...args);
        }

        this.#sheet._invalidateAll();
    }

    #isValidIndex(index: number, max: number): boolean {
        return index >= 0 && index < max;
    }

    #finishResize(): void {
        this.#sheet._invalidateAll();
        this.render();
        this.#sheet.bus.emit(SHEET_EVENTS.AFTER_CHANGE, []);
    }
}
