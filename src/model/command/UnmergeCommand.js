/**
 * 取消合并命令
 *
 * 将指定位置的合并单元格拆分为独立单元格，支持撤销恢复。
 * 执行时先快照当前合并区域信息（oldMerge），再调用 manager.unmerge() 拆分；
 * 撤销时利用快照重新调用 manager.merge() 恢复合并。
 *
 * 注意：未继承 Command 基类，但遵循 redo()/undo() 接口约定，
 * 可被 HistoryStack 和 BatchCommand 统一调度。
 */
export class UnmergeCommand {
    /**
     * @param {import("../MergeManager.js").MergeManager} manager - 合并管理器
     * @param {number} row - 合并区域左上角行号
     * @param {number} col - 合并区域左上角列号
     */
    constructor(manager, row, col) {
        this.manager = manager;
        this.row = row;
        this.col = col;
        /** @type {{ topRow:number, topCol:number, bottomRow:number, bottomCol:number }|null} 快照的合并区域，撤销时用于恢复 */
        this.oldMerge = null;
    }

    /** 执行取消合并：先快照再拆分 */
    redo() {
        this.oldMerge = this.manager.getMerge(this.row, this.col);
        if (this.oldMerge) {
            this.manager.unmerge(this.row, this.col);
        }
    }

    /** 撤销：利用快照恢复原合并区域 */
    undo() {
        if (this.oldMerge) {
            this.manager.merge(this.oldMerge.topRow, this.oldMerge.topCol, this.oldMerge.bottomRow, this.oldMerge.bottomCol);
        }
    }
}
