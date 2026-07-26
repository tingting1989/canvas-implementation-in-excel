import { Command } from "./Command.js";

/**
 * 单元格赋值命令
 *
 * 将指定单元格的值从 oldCell 替换为 newCell，遵循 Command 模式以支持撤销/重做。
 * 这是最基础的编辑命令，几乎所有单元格内容变更都通过此命令执行。
 *
 * 执行流程：
 * 1. redo() 调用 store.set() 将单元格设置为新值
 * 2. undo() 根据旧值是否存在，调用 store.set() 恢复旧值或 store.delete() 删除单元格
 *
 * @extends Command
 *
 * @example
 * const cmd = new SetCellCommand(cellStore, 0, 0, null, { value: "Hello" });
 * cmd.redo();  // 单元格 (0,0) 设为 "Hello"
 * cmd.undo();  // 单元格 (0,0) 恢复为空（oldCell 为 null 时删除）
 */
export class SetCellCommand extends Command {
    /**
     * @param {object} store - 单元格数据存储，需提供 set() 和 delete() 方法
     * @param {number} row - 目标单元格行号
     * @param {number} col - 目标单元格列号
     * @param {object|null} oldCell - 操作前的单元格数据，null 表示该单元格原来不存在
     * @param {object|null} newCell - 操作后的单元格数据，null 表示删除该单元格
     */
    constructor(store, row, col, oldCell, newCell) {
        super();
        /** @type {object} 单元格数据存储 */
        this.store = store;
        /** @type {number} 目标单元格行号 */
        this.row = row;
        /** @type {number} 目标单元格列号 */
        this.col = col;
        /** @type {object|null} 操作前的单元格数据快照 */
        this.oldCell = oldCell;
        /** @type {object|null} 操作后的单元格数据 */
        this.newCell = newCell;
    }

    /**
     * 执行/重做单元格赋值操作
     * 调用 store.set() 将目标单元格设置为新值
     * @returns {void}
     */
    redo() {
        this.store.set(this.row, this.col, this.newCell);
    }

    /**
     * 撤销单元格赋值操作
     * - 若 oldCell 存在，调用 store.set() 恢复原始数据
     * - 若 oldCell 为 null（单元格原来不存在），调用 store.delete() 删除该单元格
     * @returns {void}
     */
    undo() {
        if (this.oldCell) {
            this.store.set(this.row, this.col, this.oldCell);
        } else {
            this.store.delete(this.row, this.col);
        }
    }
}
