import type { MergeInfo } from "../types";

/** 合并管理器最小接口（含 getMerge） */
interface MergeManagerWithGet {
    merge(topRow: number, topCol: number, bottomRow: number, bottomCol: number): boolean;
    unmerge(row: number, col: number): void;
    getMerge(row: number, col: number): MergeInfo | null;
}

/**
 * 取消合并命令 (Unmerge Command)
 *
 * 将指定位置的合并单元格拆分为独立单元格，支持撤销恢复。
 *
 * @class UnmergeCommand
 */
export class UnmergeCommand {
    /** 合并管理器 */
    manager: MergeManagerWithGet;
    /** 合并区域左上角行号 */
    row: number;
    /** 合并区域左上角列号 */
    col: number;
    /** 快照的合并区域，撤销时用于恢复 */
    oldMerge: MergeInfo | null;

    /**
     * @param manager - 合并管理器
     * @param row - 合并区域左上角行号
     * @param col - 合并区域左上角列号
     */
    constructor(manager: MergeManagerWithGet, row: number, col: number) {
        this.manager = manager;
        this.row = row;
        this.col = col;
        this.oldMerge = null;
    }

    /** 执行取消合并：先快照再拆分 */
    redo(): void {
        this.oldMerge = this.manager.getMerge(this.row, this.col);
        if (this.oldMerge) {
            this.manager.unmerge(this.row, this.col);
        }
    }

    /** 撤销：利用快照恢复原合并区域 */
    undo(): void {
        if (this.oldMerge) {
            this.manager.merge(this.oldMerge.topRow, this.oldMerge.topCol, this.oldMerge.bottomRow, this.oldMerge.bottomCol);
        }
    }
}

export type { MergeInfo, MergeManagerWithGet };
