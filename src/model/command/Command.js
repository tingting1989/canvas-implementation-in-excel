/**
 * 命令基类（Command Pattern）
 *
 * 所有可撤销/可重做的操作都封装为 Command 子类，由 HistoryStack 统一管理。
 * 每个命令必须实现 redo() 和 undo() 两个方法：
 * - redo()：执行（或重做）操作，将状态从旧值切换到新值
 * - undo()：撤销操作，将状态从新值恢复到旧值
 *
 * 典型子类：
 * - SetCellCommand：单元格赋值（记录 oldCell / newCell）
 * - ToggleDisableCommand：切换单元格禁用状态
 * - BatchCommand：批量命令组合（粘贴、剪切等多单元格操作）
 * - MergeCommand / UnmergeCommand：合并/取消合并单元格
 *
 * 生命周期：
 * 1. 创建命令实例（捕获旧状态）
 * 2. 调用 redo() 执行操作
 * 3. 命令被推入 HistoryStack
 * 4. 撤销时调用 undo()，重做时再次调用 redo()
 *
 * 注意：
 * - 基类的 redo() / undo() 为空实现，子类必须重写
 * - 命令对象应捕获足够的上下文（store 引用、行列号、旧值/新值），
 *   以确保 undo() 能完整恢复状态
 */
export class Command {
    /** 执行/重做操作，子类必须重写 */
    redo() {}

    /** 撤销操作，子类必须重写 */
    undo() {}
}
