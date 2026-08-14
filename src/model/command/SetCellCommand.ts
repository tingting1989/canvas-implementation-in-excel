import { Command } from "./Command.js";

/** 单元格数据存储最小接口 */
interface CellStore {
    get(row: number, col: number): any;
    set(row: number, col: number, cell: any): void;
    delete(row: number, col: number): void;
}

/**
 * 单元格赋值命令 (Set Cell Command)
 *
 * 将指定单元格的值从 oldCell 替换为 newCell，遵循 Command 模式以支持撤销/重做。
 *
 * @class SetCellCommand
 * @extends Command
 */
export class SetCellCommand extends Command {
    /** 单元格数据存储 */
    store: CellStore;
    /** 目标单元格行号 */
    row: number;
    /** 目标单元格列号 */
    col: number;
    /** 操作前的单元格数据快照 */
    oldCell: any;
    /** 操作后的单元格数据 */
    newCell: any;

    /**
     * @param store - 单元格数据存储
     * @param row - 目标单元格行号
     * @param col - 目标单元格列号
     * @param oldCell - 操作前的单元格数据，null 表示该单元格原来不存在
     * @param newCell - 操作后的单元格数据，null 表示删除该单元格
     */
    constructor(store: CellStore, row: number, col: number, oldCell: any, newCell: any) {
        super();
        this.store = store;
        this.row = row;
        this.col = col;
        this.oldCell = oldCell;
        this.newCell = newCell;
    }

    /** 执行/重做单元格赋值操作 */
    redo(): void {
        this.store.set(this.row, this.col, this.newCell);
    }

    /** 撤销单元格赋值操作 */
    undo(): void {
        if (this.oldCell) {
            this.store.set(this.row, this.col, this.oldCell);
        } else {
            this.store.delete(this.row, this.col);
        }
    }
}
