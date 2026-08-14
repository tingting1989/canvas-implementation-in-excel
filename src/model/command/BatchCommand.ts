import { Command } from "./Command.js";

/**
 * 批量命令 (Batch Command)
 *
 * 将多个子命令组合为一个原子操作。
 * - redo 时按正序依次执行所有子命令
 * - undo 时按逆序依次撤销所有子命令
 *
 * @class BatchCommand
 * @extends Command
 */
export class BatchCommand extends Command {
    /** 待执行的子命令数组 */
    commands: Command[];

    /**
     * @param commands - 子命令列表
     */
    constructor(commands: Command[]) {
        super();
        this.commands = commands;
    }

    /** 正序执行所有子命令的 redo 操作 */
    redo(): void {
        for (const cmd of this.commands) {
            cmd.redo();
        }
    }

    /** 逆序执行所有子命令的 undo 操作 */
    undo(): void {
        for (let i = this.commands.length - 1; i >= 0; i--) {
            this.commands[i].undo();
        }
    }
}
