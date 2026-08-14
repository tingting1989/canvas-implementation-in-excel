/**
 * 事件策略模块统一导出
 *
 * 导出所有交互策略类，供 EventHandler 注册和管理。
 * 每个策略负责处理特定类型的用户交互事件。
 *
 * 策略列表：
 * - EventStrategy: 基类，定义策略接口规范
 * - MouseStrategy: 鼠标交互（选择、拖拽、双击编辑）
 * - KeyboardStrategy: 键盘交互（导航、快捷键、直接输入）
 * - ResizeStrategy: 行列尺寸调整
 * - ContextMenuStrategy: 右键上下文菜单
 * - AutoFillStrategy: 拖拽自动填充
 * - SortStrategy: 列排序
 * - ValidationStrategy: 数据验证
 * - ChartSelectionStrategy: 图表选中/移动/调整大小
 * - CopyPasteStrategy: 复制/粘贴/剪切
 * - ColumnMoveStrategy: 列拖拽移动
 * - RowMoveStrategy: 行拖拽移动
 * - InteractionStrategy: 交互类型单元格（按钮/链接等）
 */
export { AutoFillStrategy } from "./AutoFillStrategy.js";
export { ChartSelectionStrategy } from "./ChartSelectionStrategy.js";
export { ColumnMoveStrategy } from "./ColumnMoveStrategy.js";
export { ContextMenuStrategy } from "./ContextMenuStrategy.js";
export { CopyPasteStrategy } from "./CopyPasteStrategy.js";
export { EventStrategy } from "./EventStrategy.js";
export { InteractionStrategy } from "./InteractionStrategy.js";
export { KeyboardStrategy } from "./KeyboardStrategy.js";
export { MouseStrategy } from "./MouseStrategy.js";
export { ResizeStrategy } from "./ResizeStrategy.js";
export { RowMoveStrategy } from "./RowMoveStrategy.js";
export { SortStrategy } from "./SortStrategy.js";
export { ValidationStrategy } from "./ValidationStrategy.js";
