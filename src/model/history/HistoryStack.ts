import { Command } from "../command/Command";

/**
 * 历史栈（撤销/重做管理器）
 *
 * 基于双栈结构实现 Command 模式的撤销/重做机制：
 * - undoStack：存放已执行但尚未撤销的命令，栈顶为最近执行的命令
 * - redoStack：存放已撤销但可重做的命令，栈顶为最近撤销的命令
 *
 * 操作流程：
 * 1. 执行新命令后调用 push(cmd) 将命令压入 undoStack，同时清空 redoStack
 * 2. 撤销时从 undoStack 弹出命令执行 undo()，并压入 redoStack
 * 3. 重做时从 redoStack 弹出命令执行 redo()，并压入 undoStack
 *
 * 注意：push 新命令时清空 redoStack 是标准行为，
 * 因为在已有撤销记录的情况下执行新操作，会使之前的撤销路径失效
 *
 * @example
 * const history = new HistoryStack();
 * history.push(new SetCellCommand(store, 0, 0, null, { value: "A" }));
 * history.undo(); // 撤销赋值
 * history.redo(); // 重做赋值
 */
export class HistoryStack {
    /** 撤销栈，存放已执行但尚未撤销的命令 */
    undoStack: Command[];

    /** 重做栈，存放已撤销但可重做的命令 */
    redoStack: Command[];

    /**
     * 初始化双栈结构
     */
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * 将新执行的命令压入撤销栈
     * 同时清空重做栈，因为新操作会使之前的撤销路径失效
     * @param cmd - 已执行的命令实例，需提供 undo() 和 redo() 方法
     */
    push(cmd: Command): void {
        this.undoStack.push(cmd);
        this.redoStack = [];
    }

    /**
     * 撤销最近一次操作
     * 从 undoStack 弹出栈顶命令，执行其 undo() 方法，并压入 redoStack
     * 若 undoStack 为空则不执行任何操作
     */
    undo(): void {
        const cmd = this.undoStack.pop();
        if (cmd) {
            cmd.undo();
            this.redoStack.push(cmd);
        }
    }

    /**
     * 重做最近一次撤销的操作
     * 从 redoStack 弹出栈顶命令，执行其 redo() 方法，并压入 undoStack
     * 若 redoStack 为空则不执行任何操作
     */
    redo(): void {
        const cmd = this.redoStack.pop();
        if (cmd) {
            cmd.redo();
            this.undoStack.push(cmd);
        }
    }
}
