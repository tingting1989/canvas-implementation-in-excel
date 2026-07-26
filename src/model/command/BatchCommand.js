import { Command } from "./Command.js";

/**
 * 批量命令 — 将多个子命令组合为一个原子操作
 *
 * 继承自 Command 基类，用于粘贴、剪切、自动填充等一次操作修改多个单元格的场景。
 * - redo 时按正序依次执行所有子命令，保证操作按原始顺序生效
 * - undo 时按逆序依次撤销所有子命令，确保单元格状态正确恢复
 *
 * @extends Command
 *
 * @example
 * const batch = new BatchCommand([
 *     new CellEditCommand(sheet, 0, 0, "Hello"),
 *     new CellEditCommand(sheet, 0, 1, "World"),
 * ]);
 * batch.redo(); // 依次执行两个编辑
 * batch.undo(); // 逆序撤销，先撤销 (0,1) 再撤销 (0,0)
 */
export class BatchCommand extends Command {
    /**
     * @param {Command[]} commands - 子命令列表，每个元素均为 Command 实例
     */
    constructor(commands) {
        super();
        /** @type {Command[]} 待执行的子命令数组 */
        this.commands = commands;
    }

    /**
     * 正序执行所有子命令的 redo 操作
     * 子命令按数组顺序依次执行，确保操作按原始顺序生效
     */
    redo() {
        for (const cmd of this.commands) {
            cmd.redo();
        }
    }

    /**
     * 逆序执行所有子命令的 undo 操作
     * 从最后一个子命令开始依次撤销，确保依赖关系正确恢复
     * 例如：若子命令 A 修改了子命令 B 依赖的单元格，
     * 逆序撤销时先撤销 B 再撤销 A，避免中间状态不一致
     */
    undo() {
        for (let i = this.commands.length - 1; i >= 0; i--) {
            this.commands[i].undo();
        }
    }
}
