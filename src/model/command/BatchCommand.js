import { Command } from "./Command.js";

/**
 * 批量命令 — 将多个子命令组合为一个原子操作
 *
 * 用于粘贴、剪切、自动填充等一次操作修改多个单元格的场景。
 * undo/redo 时按逆序/正序依次执行所有子命令，保证一次性撤销/重做整个批量操作。
 */
export class BatchCommand extends Command {
    /**
     * @param {Array<Command>} commands - 子命令列表
     */
    constructor(commands) {
        super();
        this.commands = commands;
    }

    redo() {
        for (const cmd of this.commands) {
            cmd.redo();
        }
    }

    undo() {
        // 逆序撤销，确保单元格状态正确恢复
        for (let i = this.commands.length - 1; i >= 0; i--) {
            this.commands[i].undo();
        }
    }
}
