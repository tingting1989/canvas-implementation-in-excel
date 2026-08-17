import { Command } from "./Command.js";

/** 单元格数据存储最小接口（含 disabled 属性） */
interface DisableCellStore {
    get(row: number, col: number): { disabled?: boolean } | null | undefined;
}

/**
 * 切换单元格禁用状态命令 (Toggle Disable Command)
 *
 * 将指定单元格的 disabled 属性在启用/禁用之间切换，遵循 Command 模式以支持撤销/重做。
 *
 * @class ToggleDisableCommand
 * @extends Command
 */
export class ToggleDisableCommand extends Command {
    /** 单元格数据存储 */
    store: DisableCellStore;
    /** 目标单元格行号 */
    row: number;
    /** 目标单元格列号 */
    col: number;
    /** 操作前的禁用状态快照 */
    oldState: boolean;

    /**
     * @param store - 单元格数据存储
     * @param row - 目标单元格行号
     * @param col - 目标单元格列号
     * @param oldState - 操作前单元格的禁用状态
     */
    constructor(store: DisableCellStore, row: number, col: number, oldState: boolean) {
        super();
        this.store = store;
        this.row = row;
        this.col = col;
        this.oldState = oldState;
    }

    /** 执行/重做禁用状态切换 */
    redo(): void {
        const cell = this.store.get(this.row, this.col);
        if (cell) cell.disabled = !this.oldState;
    }

    /** 撤销禁用状态切换 */
    undo(): void {
        const cell = this.store.get(this.row, this.col);
        if (cell) cell.disabled = this.oldState;
    }
}
