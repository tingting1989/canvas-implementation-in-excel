/**
 * 合并单元格命令
 *
 * 将指定矩形区域内的单元格合并为一个合并单元格。
 * 遵循 Command 模式，提供 redo/undo 接口以支持撤销/重做。
 *
 * 执行流程：
 * 1. redo() 调用 manager.merge() 合并指定区域，并记录操作是否成功
 * 2. undo() 仅在合并成功时调用 manager.unmerge() 取消合并
 *
 * 合并可能失败的场景：区域与已有合并区域重叠、区域仅含单个单元格等
 *
 * @example
 * const cmd = new MergeCommand(mergeManager, 0, 0, 2, 3);
 * cmd.redo();  // 合并 (0,0)~(2,3) 区域
 * cmd.undo();  // 取消合并，恢复原始单元格
 */
export class MergeCommand {
    /**
     * @param {object} manager - 合并管理器实例，需提供 merge() 和 unmerge() 方法
     * @param {number} topRow - 合并区域起始行号（左上角行）
     * @param {number} topCol - 合并区域起始列号（左上角列）
     * @param {number} bottomRow - 合并区域结束行号（右下角行）
     * @param {number} bottomCol - 合并区域结束列号（右下角列）
     */
    constructor(manager, topRow, topCol, bottomRow, bottomCol) {
        /** @type {object} 合并管理器，提供 merge/unmerge 操作 */
        this.manager = manager;
        /** @type {number} 合并区域起始行号 */
        this.topRow = topRow;
        /** @type {number} 合并区域起始列号 */
        this.topCol = topCol;
        /** @type {number} 合并区域结束行号 */
        this.bottomRow = bottomRow;
        /** @type {number} 合并区域结束列号 */
        this.bottomCol = bottomCol;
        /** @type {boolean} 标记合并操作是否成功执行，用于 undo 时判断是否需要撤销 */
        this.succeeded = false;
    }

    /**
     * 执行合并操作
     * 调用 manager.merge() 合并指定区域，并将返回值记录到 succeeded
     * @returns {void}
     */
    redo() {
        this.succeeded = this.manager.merge(this.topRow, this.topCol, this.bottomRow, this.bottomCol);
    }

    /**
     * 撤销合并操作
     * 仅在 redo 成功（succeeded 为 true）时才调用 manager.unmerge() 取消合并，
     * 避免对未成功的合并执行无效的撤销
     * @returns {void}
     */
    undo() {
        if (this.succeeded) {
            this.manager.unmerge(this.topRow, this.topCol);
        }
    }
}
