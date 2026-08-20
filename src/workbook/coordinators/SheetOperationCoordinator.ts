import { CONFIG } from "../../constants/config";
import { SHEET_EVENTS } from "../../constants/sheetEvents";
import { errorHandler } from "../../core/ErrorHandler";
import type { ISheet } from "../interfaces/ISheet";
import { ERROR_CODE } from "../../constants/errorCodes";

/**
 * 子系统分发方法名常量
 *
 * 行列插入/删除/移动操作需要同步到所有子系统：
 * rowColManager / cellStore / mergeManager / chartManager
 */
const SUB = {
    INSERT_ROW: "insertRow",
    INSERT_COL: "insertCol",
    DELETE_ROW: "deleteRow",
    DELETE_COL: "deleteCol",
    MOVE_ROW: "moveRow",
    MOVE_COL: "moveCol",
} as const;

/** 子系统方法名类型 */
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
 * 设计特点：
 * - 所有操作都有权限检查（_ensureWritable）
 * - 行列操作通过 #dispatchToSubSystems 同步到所有子系统
 * - 支持边界检查（CONFIG.MAX_ROWS / CONFIG.MAX_COLS）和错误处理
 * - 通过 ISheet 接口解耦对具体实现的依赖
 *
 * 子系统同步流程：
 * ┌──────────────┐
 * │ insertRow(n) │
 * └──────┬───────┘
 *        ├── rowColManager.insertRow(n)  ── 尺寸更新
 *        ├── cellStore.insertRow(n)      ── 数据移位
 *        ├── mergeManager.insertRow(n)   ── 合并区域移位
 *        ├── chartManager.insertRow(n)   ── 图表锚点移位
 *        ├── rowSync.insert(n)           ── 行附属状态移位
 *        └── _invalidateAll()            ── 缓存失效
 *
 * @class SheetOperationCoordinator
 */
export class SheetOperationCoordinator {
    /** 工作表接口引用 */
    #sheet: ISheet;

    /**
     * @param sheet - 工作表接口实例
     */
    constructor(sheet: ISheet) {
        this.#sheet = sheet;
    }

    /**
     * 进入批量操作模式
     *
     * 在 beginBatch / endBatch 之间的所有命令
     * 将合并为单个撤销步骤。
     */
    beginBatch(): void {
        this.#sheet.batchOp.beginBatch();
    }

    /**
     * 退出批量操作模式
     *
     * 将暂存的命令合并为单个 MacroCommand 推入历史栈。
     */
    endBatch(): void {
        this.#sheet.batchOp.endBatch(this.#sheet.history);
    }

    /**
     * 触发重渲染
     *
     * 通过事件总线发出 RENDER_REQUEST 事件，
     * 由 RenderEngine 监听并执行实际渲染。
     */
    render(): void {
        this.#sheet.bus.emit(SHEET_EVENTS.RENDER_REQUEST, null);
    }

    /**
     * 撤销上一步操作
     *
     * 处理流程：
     * 1. 权限检查
     * 2. 调用 HistoryStack.undo()
     * 3. 发出 UNDO 事件（通知公式引擎等子系统）
     * 4. 使所有缓存失效
     */
    undo(): void {
        if (!this.#sheet._ensureWritable()) return;

        this.#sheet.history.undo();
        this.#sheet.bus.emit(SHEET_EVENTS.UNDO);
        this.#sheet._invalidateAll();
    }

    /**
     * 重做下一步操作
     *
     * 处理流程：
     * 1. 权限检查
     * 2. 调用 HistoryStack.redo()
     * 3. 发出 REDO 事件
     * 4. 使所有缓存失效
     */
    redo(): void {
        if (!this.#sheet._ensureWritable()) return;

        this.#sheet.history.redo();
        this.#sheet.bus.emit(SHEET_EVENTS.REDO, null);
        this.#sheet._invalidateAll();
    }

    /**
     * 在指定位置插入行
     *
     * @param atRow - 插入位置行号，新行插入到 atRow 处，原 atRow 及之后的行下移
     */
    insertRow(atRow: number): void {
        if (!this.#sheet._ensureWritable()) return;
        if (!this.#isValidIndex(atRow, CONFIG.MAX_ROWS)) return;

        this.#dispatchToSubSystems(SUB.INSERT_ROW, atRow);
        this.#sheet.rowSync.insert(atRow);

        this.#sheet.bus.emit(SHEET_EVENTS.ROW_INSERTED, { atRow });
    }

    /**
     * 在指定位置插入列
     *
     * @param atCol - 插入位置列号，新列插入到 atCol 处，原 atCol 及之后的列右移
     */
    insertCol(atCol: number): void {
        if (!this.#sheet._ensureWritable()) return;
        if (!this.#isValidIndex(atCol, CONFIG.MAX_COLS)) return;

        this.#dispatchToSubSystems(SUB.INSERT_COL, atCol);
        this.#sheet.colSync.insert(atCol);

        this.#sheet.bus.emit(SHEET_EVENTS.COLUMN_INSERTED, { atCol });
    }

    /**
     * 删除指定行
     *
     * @param atRow - 要删除的行号
     */
    deleteRow(atRow: number): void {
        if (!this.#sheet._ensureWritable()) return;
        if (!this.#isValidIndex(atRow, CONFIG.MAX_ROWS)) return;

        this.#dispatchToSubSystems(SUB.DELETE_ROW, atRow);
        this.#sheet.rowSync.delete(atRow);

        this.#sheet.bus.emit(SHEET_EVENTS.ROW_DELETED, { atRow });
    }

    /**
     * 删除指定列
     *
     * @param atCol - 要删除的列号
     */
    deleteCol(atCol: number): void {
        if (!this.#sheet._ensureWritable()) return;
        if (!this.#isValidIndex(atCol, CONFIG.MAX_COLS)) return;

        this.#dispatchToSubSystems(SUB.DELETE_COL, atCol);
        this.#sheet.colSync.delete(atCol);

        this.#sheet.bus.emit(SHEET_EVENTS.COLUMN_DELETED, { atCol });
    }

    /**
     * 移动列
     *
     * 将 fromCol 列移动到 toCol 位置，
     * 其他列相应左移或右移。
     *
     * @param fromCol - 源列号
     * @param toCol - 目标列号
     */
    moveCol(fromCol: number, toCol: number): void {
        if (!this.#sheet._ensureWritable()) return;
        if (fromCol === toCol || fromCol < 0 || toCol < 0) return;
        if (fromCol >= CONFIG.MAX_COLS || toCol >= CONFIG.MAX_COLS) return;

        this.#dispatchToSubSystems(SUB.MOVE_COL, fromCol, toCol);
        this.#sheet.colSync.move(fromCol, toCol);

        this.#sheet.bus.emit(SHEET_EVENTS.COLUMN_MOVED, { fromCol, toCol });

        this.#sheet._invalidateAll();
    }

    /**
     * 移动行
     *
     * @param fromRow - 源行号
     * @param toRow - 目标行号
     */
    moveRow(fromRow: number, toRow: number): void {
        if (!this.#sheet._ensureWritable()) return;
        if (fromRow === toRow || fromRow < 0 || toRow < 0) return;
        if (fromRow >= CONFIG.MAX_ROWS || toRow >= CONFIG.MAX_ROWS) return;

        this.#dispatchToSubSystems(SUB.MOVE_ROW, fromRow, toRow);
        this.#sheet.rowSync.move(fromRow, toRow);

        this.#sheet.bus.emit(SHEET_EVENTS.ROW_MOVED, { fromRow, toRow });

        this.#sheet._invalidateAll();
    }

    /**
     * 设置行数
     *
     * 直接重置网格行数，不保留超出范围的数据。
     *
     * @param rows - 新行数，必须为正整数
     */
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

    /**
     * 设置列数
     *
     * @param cols - 新列数，必须为正整数
     */
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

    /**
     * 设置网格尺寸
     *
     * 同时设置行数和列数。
     *
     * @param rows - 新行数，必须为正整数
     * @param cols - 新列数，必须为正整数
     */
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

    /**
     * 将操作分发到所有子系统
     *
     * 行列的 insert/delete/move 操作需要同步到：
     * - rowColManager：尺寸更新
     * - cellStore：数据移位
     * - mergeManager：合并区域移位
     * - chartManager：图表锚点移位（可选）
     *
     * @param method - 子系统方法名
     * @param args - 方法参数
     */
    #dispatchToSubSystems(method: string, ...args: unknown[]): void {
        (this.#sheet.rowColManager as unknown as Record<string, (...a: unknown[]) => void>)[method](...args);
        (this.#sheet.cellStore as unknown as Record<string, (...a: unknown[]) => void>)[method](...args);
        (this.#sheet.mergeManager as unknown as Record<string, (...a: unknown[]) => void>)[method](...args);

        if (this.#sheet.chartManager && typeof (this.#sheet.chartManager as unknown as Record<string, unknown>)[method] === "function") {
            (this.#sheet.chartManager as unknown as Record<string, (...a: unknown[]) => void>)[method](...args);
        }

        this.#sheet._invalidateAll();
    }

    /**
     * 验证索引是否在有效范围内
     * @param index - 待验证索引
     * @param max - 最大值（不含）
     * @returns 是否有效
     */
    #isValidIndex(index: number, max: number): boolean {
        return index >= 0 && index < max;
    }

    /**
     * 尺寸调整后的收尾工作
     *
     * 使缓存失效、触发渲染、发出 AFTER_CHANGE 事件。
     */
    #finishResize(): void {
        this.#sheet._invalidateAll();
        this.render();
        this.#sheet.bus.emit(SHEET_EVENTS.AFTER_CHANGE, []);
    }
}