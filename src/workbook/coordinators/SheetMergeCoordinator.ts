import type { ISheet } from "../interfaces/ISheet";
import { MergeCommand } from "../../model/command/MergeCommand";
import { UnmergeCommand } from "../../model/command/UnmergeCommand";

/**
 * 工作表合并单元格协调者
 *
 * 负责：
 * - 合并/取消合并单元格区域
 * - 查询合并信息（getMerge / isMergeTopLeft / isMergedCell）
 * - 确保合并操作的合法性（如禁止跨不同列类型合并）
 *
 * 设计特点：
 * - 合并前检查列类型一致性（不同列类型的区域不允许合并）
 * - 操作记录为 MergeCommand / UnmergeCommand，支持撤销
 * - 通过 ISheet 接口解耦对具体实现的依赖
 *
 * @class SheetMergeCoordinator
 */
export class SheetMergeCoordinator {
    /** 工作表接口引用 */
    #sheet: ISheet;

    /**
     * @param sheet - 工作表接口实例
     */
    constructor(sheet: ISheet) {
        this.#sheet = sheet;
    }

    /**
     * 获取合并管理器（直接引用 Sheet 的 mergeManager）
     * @returns 合并管理器实例
     */
    get mergeManager() {
        return this.#sheet.mergeManager;
    }

    /**
     * 合并单元格区域
     *
     * 处理流程：
     * 1. 权限检查（只读保护）
     * 2. 列类型一致性检查（区域内所有列必须为同一类型）
     * 3. 执行 MergeCommand.redo()
     * 4. 合并成功时推入历史栈并使缓存失效
     *
     * @param topRow - 左上角行号
     * @param topCol - 左上角列号
     * @param bottomRow - 右下角行号
     * @param bottomCol - 右下角列号
     * @returns 是否合并成功
     */
    mergeCells(topRow: number, topCol: number, bottomRow: number, bottomCol: number): boolean {
        if (!this.#sheet._ensureWritable()) return false;

        if (!this.#sheet.meta._checkColumnTypeConsistency(topCol, bottomCol)) {
            return false;
        }

        const cmd = new MergeCommand(this.mergeManager, topRow, topCol, bottomRow, bottomCol);
        cmd.redo();

        if (cmd.succeeded) {
            this.#sheet.history.push(cmd);
            this.#sheet._invalidateAll();
        }

        return cmd.succeeded;
    }

    /**
     * 取消合并
     *
     * 处理流程：
     * 1. 权限检查
     * 2. 执行 UnmergeCommand.redo()
     * 3. 取消成功时推入历史栈并使缓存失效
     *
     * @param row - 合并区域左上角行号
     * @param col - 合并区域左上角列号
     * @returns 是否取消成功（指定位置无合并区域时返回 false）
     */
    unmergeCells(row: number, col: number): boolean {
        if (!this.#sheet._ensureWritable()) return false;

        const cmd = new UnmergeCommand(this.mergeManager, row, col);
        cmd.redo();

        if (cmd.oldMerge) {
            this.#sheet.history.push(cmd);
            this.#sheet._invalidateAll();
            return true;
        }

        return false;
    }

    /**
     * 获取指定位置的合并区域信息
     * @param row - 行号
     * @param col - 列号
     * @returns 合并范围，未合并返回 null
     */
    getMerge(row: number, col: number) {
        return this.mergeManager.getMerge(row, col);
    }

    /**
     * 判断是否为合并区域的左上角单元格
     * @param row - 行号
     * @param col - 列号
     * @returns 是否为左上角
     */
    isMergeTopLeft(row: number, col: number): boolean {
        return this.mergeManager.isTopLeft(row, col);
    }

    /**
     * 判断是否处于合并区域内（非左上角也算）
     * @param row - 行号
     * @param col - 列号
     * @returns 是否被合并
     */
    isMergedCell(row: number, col: number): boolean {
        return this.mergeManager.isMerged(row, col);
    }

    /**
     * 获取工作表内所有合并区域
     * @returns 合并区域数组
     */
    getAllMerges() {
        return this.mergeManager.getAllMerges();
    }
}
