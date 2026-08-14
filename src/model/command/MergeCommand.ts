/** 合并管理器最小接口 */
interface MergeManager {
    merge(topRow: number, topCol: number, bottomRow: number, bottomCol: number): boolean;
    unmerge(row: number, col: number): void;
}

/**
 * 合并单元格命令 (Merge Command)
 *
 * 将指定矩形区域内的单元格合并为一个合并单元格。
 *
 * @class MergeCommand
 */
export class MergeCommand {
    /** 合并管理器 */
    manager: MergeManager;
    /** 合并区域起始行号 */
    topRow: number;
    /** 合并区域起始列号 */
    topCol: number;
    /** 合并区域结束行号 */
    bottomRow: number;
    /** 合并区域结束列号 */
    bottomCol: number;
    /** 标记合并操作是否成功执行 */
    succeeded: boolean;

    /**
     * @param manager - 合并管理器实例
     * @param topRow - 合并区域起始行号
     * @param topCol - 合并区域起始列号
     * @param bottomRow - 合并区域结束行号
     * @param bottomCol - 合并区域结束列号
     */
    constructor(manager: MergeManager, topRow: number, topCol: number, bottomRow: number, bottomCol: number) {
        this.manager = manager;
        this.topRow = topRow;
        this.topCol = topCol;
        this.bottomRow = bottomRow;
        this.bottomCol = bottomCol;
        this.succeeded = false;
    }

    /** 执行合并操作 */
    redo(): void {
        this.succeeded = this.manager.merge(this.topRow, this.topCol, this.bottomRow, this.bottomCol);
    }

    /** 撤销合并操作 */
    undo(): void {
        if (this.succeeded) {
            this.manager.unmerge(this.topRow, this.topCol);
        }
    }
}
