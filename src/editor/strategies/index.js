/**
 * 编辑器策略模块 (Editor Strategies Module)
 *
 * 提供多种交互策略实现，用于处理Canvas表格中的不同用户交互场景。
 * 采用策略模式（Strategy Pattern）将不同的交互逻辑解耦，便于维护和扩展。
 *
 * 策略分类及职责：
 *
 * 【基础事件策略】
 * ┌──────────────────────┬─────────────────────────────────────────┐
 * │ 策略                  │ 职责                                    │
 * ├──────────────────────┼─────────────────────────────────────────┤
 * │ EventStrategy         │ 事件分发与协调的核心策略               │
 * │ MouseStrategy         │ 鼠标点击、拖拽、选择等交互处理          │
 * │ KeyboardStrategy      │ 键盘快捷键、导航、编辑等操作处理        │
 * └──────────────────────┴─────────────────────────────────────────┘
 *
 * 【功能增强策略】
 * ┌──────────────────────┬─────────────────────────────────────────┐
 * │ 策略                  │ 职责                                    │
 * ├──────────────────────┼─────────────────────────────────────────┤
 * │ ResizeStrategy        │ 行高/列宽调整拖拽处理                   │
 * │ ContextMenuStrategy   │ 右键菜单的显示与命令执行                │
 * │ AutoFillStrategy      │ 自动填充（拖拽填充柄）功能              │
 * │ SortStrategy          │ 数据排序功能的UI交互                    │
 * │ ChartSelectionStrategy│ 图表选区的特殊交互处理                  │
 * │ CopyPasteStrategy     │ 复制/粘贴操作的完整流程                 │
 * │ ColumnMoveStrategy    │ 列拖拽移动交互                          │
 * │ RowMoveStrategy       │ 行拖拽移动交互                          │
 * │ ValidationStrategy    │ 数据验证反馈与错误提示                  │
 * └──────────────────────┴─────────────────────────────────────────┘
 *
 * 架构设计：
 * - 所有策略都遵循统一的接口规范
 * - 通过组合模式灵活配置所需策略
 * - 策略间相互独立，降低耦合度
 * - 便于单独测试和维护
 *
 * 使用示例：
 * ```js
 * import {
 *   MouseStrategy,
 *   KeyboardStrategy,
 *   ResizeStrategy,
 *   ContextMenuStrategy
 * } from './strategies';
 *
 * class SheetEditor {
 *   constructor() {
 *     this.strategies = [
 *       new MouseStrategy(this),
 *       new KeyboardStrategy(this),
 *       new ResizeStrategy(this),
 *       new ContextMenuStrategy(this)
 *     ];
 *   }
 * }
 * ```
 *
 * @module strategies
 * @see EventStrategy - 核心事件策略基类
 */

/** 基础事件策略 */
export { EventStrategy } from "./EventStrategy.js";

/** 鼠标交互策略 */
export { MouseStrategy } from "./MouseStrategy.js";

/** 键盘交互策略 */
export { KeyboardStrategy } from "./KeyboardStrategy.js";

/** 尺寸调整策略（行高/列宽） */
export { ResizeStrategy } from "./ResizeStrategy.js";

/** 右键上下文菜单策略 */
export { ContextMenuStrategy } from "./ContextMenuStrategy.js";

/** 自动填充策略（拖拽填充） */
export { AutoFillStrategy } from "./AutoFillStrategy.js";

/** 数据排序策略 */
export { SortStrategy } from "./SortStrategy.js";

/** 图表选区策略 */
export { ChartSelectionStrategy } from "./ChartSelectionStrategy.js";
