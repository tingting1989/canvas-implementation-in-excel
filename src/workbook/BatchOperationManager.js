import { BatchCommand } from "../model/index.js";

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
    /** 是否处于批量模式 */
    #inBatch = false;
    /** 暂存的子命令队列 */
    #batchCommands = [];

    /**
     * 进入批量模式，清空暂存命令队列
     */
    beginBatch() {
        this.#inBatch = true;
        this.#batchCommands = [];
    }

    /**
     * 退出批量模式
     * 将暂存的子命令合并为一个 BatchCommand 推入历史栈。
     * 如果没有子命令（空操作），不推入任何内容。
     * @param {import("../model/index.js").HistoryStack} history
     */
    endBatch(history) {
        this.#inBatch = false;
        const commands = this.#batchCommands;
        this.#batchCommands = [];
        if (commands.length > 0) {
            history.push(new BatchCommand(commands));
        }
    }

    /**
     * 推入一条命令
     * 批量模式下暂存，非批量模式下直接推入历史栈
     * @param {import("../model/index.js").Command} cmd
     * @param {import("../model/index.js").HistoryStack} history
     */
    pushCommand(cmd, history) {
        if (this.#inBatch) {
            this.#batchCommands.push(cmd);
        } else {
            history.push(cmd);
        }
    }

    /** 是否处于批量模式 */
    get inBatch() {
        return this.#inBatch;
    }
}
