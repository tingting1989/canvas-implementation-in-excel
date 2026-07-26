import { Command } from "./Command.js";

/**
 * 切换单元格禁用状态命令
 *
 * 将指定单元格的 disabled 属性在启用/禁用之间切换，遵循 Command 模式以支持撤销/重做。
 * 常用于锁定/解锁单元格，防止用户编辑受保护的单元格。
 *
 * 执行流程：
 * 1. redo() 将 disabled 设为 oldState 的反值（切换状态）
 * 2. undo() 将 disabled 恢复为 oldState（还原原始状态）
 *
 * @extends Command
 *
 * @example
 * // 单元格 (0,0) 当前为启用状态，切换为禁用
 * const cmd = new ToggleDisableCommand(cellStore, 0, 0, false);
 * cmd.redo();  // disabled 变为 true（禁用）
 * cmd.undo();  // disabled 恢复为 false（启用）
 */
export class ToggleDisableCommand extends Command {
    /**
     * @param {object} store - 单元格数据存储，需提供 get() 方法
     * @param {number} row - 目标单元格行号
     * @param {number} col - 目标单元格列号
     * @param {boolean} oldState - 操作前单元格的禁用状态（true=禁用，false=启用）
     */
    constructor(store, row, col, oldState) {
        super();
        /** @type {object} 单元格数据存储 */
        this.store = store;
        /** @type {number} 目标单元格行号 */
        this.row = row;
        /** @type {number} 目标单元格列号 */
        this.col = col;
        /** @type {boolean} 操作前的禁用状态快照 */
        this.oldState = oldState;
    }

    /**
     * 执行/重做禁用状态切换
     * 将目标单元格的 disabled 设为 oldState 的反值
     * 若单元格不存在则不执行任何操作
     * @returns {void}
     */
    redo() {
        const cell = this.store.get(this.row, this.col);
        if (cell) cell.disabled = !this.oldState;
    }

    /**
     * 撤销禁用状态切换
     * 将目标单元格的 disabled 恢复为 oldState
     * 若单元格不存在则不执行任何操作
     * @returns {void}
     */
    undo() {
        const cell = this.store.get(this.row, this.col);
        if (cell) cell.disabled = this.oldState;
    }
}
