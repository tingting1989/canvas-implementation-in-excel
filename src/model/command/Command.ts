/**
 * 命令基类 (Command Pattern)
 *
 * 所有可撤销/可重做的操作都封装为 Command 子类，由 HistoryStack 统一管理。
 * 每个命令必须实现 redo() 和 undo() 两个方法。
 *
 * @class Command
 */
export class Command {
    /** 执行/重做操作，子类必须重写 */
    redo(): void {}

    /** 撤销操作，子类必须重写 */
    undo(): void {}
}
