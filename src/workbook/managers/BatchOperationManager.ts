import { BatchCommand } from "../../model/command/BatchCommand";
import type { Command } from "../../model/command/Command";
import type { HistoryStack } from "../../model/history/HistoryStack";

/**
 * 批量操作管理器
 *
 * 将多个 setCell/disableCell/enableCell 产生的命令合并为一个 BatchCommand，
 * 确保粘贴、剪切、自动填充等多单元格操作可以一键撤销。
 *
 * 批量模式：
 *   1. beginBatch() 进入批量模式
 *   2. 各操作方法调用 pushCommand(cmd, history)，命令暂存
 *   3. endBatch(history) 退出，合并为一个 BatchCommand 推入历史栈
 *
 * 非批量模式：
 *   pushCommand(cmd, history) 直接推入历史栈
 */
export class BatchOperationManager {
    #inBatch = false;
    #batchCommands: Command[] = [];

    beginBatch(): void {
        this.#inBatch = true;
        this.#batchCommands = [];
    }

    endBatch(history: HistoryStack): void {
        this.#inBatch = false;
        const commands = this.#batchCommands;
        this.#batchCommands = [];
        if (commands.length > 0) {
            history.push(new BatchCommand(commands));
        }
    }

    pushCommand(cmd: Command, history: HistoryStack): void {
        if (this.#inBatch) {
            this.#batchCommands.push(cmd);
        } else {
            history.push(cmd);
        }
    }

    get inBatch(): boolean {
        return this.#inBatch;
    }
}
