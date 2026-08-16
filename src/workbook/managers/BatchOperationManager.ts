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
 *
 * @class BatchOperationManager
 */
export class BatchOperationManager {
    /** 是否处于批量模式 */
    #inBatch = false;
    /** 批量模式下暂存的命令列表 */
    #batchCommands: Command[] = [];

    /**
     * 进入批量操作模式
     *
     * 调用后，pushCommand 将暂存命令而非直接推入历史栈。
     */
    beginBatch(): void {
        this.#inBatch = true;
        this.#batchCommands = [];
    }

    /**
     * 退出批量操作模式
     *
     * 将暂存的所有命令合并为单个 BatchCommand 推入历史栈。
     * 如果暂存列表为空，不推入任何命令。
     *
     * @param history - 历史栈实例
     */
    endBatch(history: HistoryStack): void {
        this.#inBatch = false;
        const commands = this.#batchCommands;
        this.#batchCommands = [];
        if (commands.length > 0) {
            history.push(new BatchCommand(commands));
        }
    }

    /**
     * 推入命令
     *
     * 批量模式下暂存命令，非批量模式下直接推入历史栈。
     *
     * @param cmd - 命令实例
     * @param history - 历史栈实例
     */
    pushCommand(cmd: Command, history: HistoryStack): void {
        if (this.#inBatch) {
            this.#batchCommands.push(cmd);
        } else {
            history.push(cmd);
        }
    }

    /**
     * 是否处于批量模式
     * @returns 是否批量模式
     */
    get inBatch(): boolean {
        return this.#inBatch;
    }
}
