import { BaseMovePlugin } from "./BaseMovePlugin.js";
import { ColumnMoveStrategy } from "../editor/strategies/ColumnMoveStrategy.js";

/**
 * 列拖拽移动插件 (Column Move Plugin)
 *
 * ## 功能概述
 * 为 Canvas 表格提供列的拖拽重新排序功能。
 * 允许用户通过拖拽列头来改变列的顺序，提升数据组织的灵活性。
 *
 * ## API 设计
 * 参考 Handsontable ManualColumnMove API 设计：
 * - 用户拖拽列头即可移动整列数据
 * - 支持 beforeColumnMove / afterColumnMove 钩子（通过 HOOKS 系统）
 * - 可通过 pluginOptions.columnMove.enabled = false 禁用功能
 *
 * ## 使用示例
 * ```js
 * // 创建工作簿时启用插件
 * const wb = new Workbook(document.getElementById('wrap'), {
 *     plugins: ['columnMove'],
 *     pluginOptions: { columnMove: { enabled: true } }
 * });
 *
 * // 动态禁用/启用
 * wb.plugins.columnMove.disable();
 * wb.plugins.columnMove.enable();
 * ```
 *
 * ## 技术架构
 * 本插件采用 **策略模式** 将交互逻辑委托给 `ColumnMoveStrategy`：
 *
 * ```
 * ColumnMovePlugin (本类)
 *   └── BaseMovePlugin (基类，管理生命周期)
 *       └── ColumnMoveStrategy (策略实例，处理拖拽交互)
 *           ├── 事件监听（mousedown/mousemove/mouseup）
 *           ├── 拖拽状态管理
 *           ├── 视觉反馈（幽灵列、插入指示器）
 *           └── 数据更新（调用 sheet.moveColumn()）
 * ```
 *
 * ## 与其他插件的协作关系
 *
 * | 插件 | 关系 | 说明 |
 * |------|------|------|
 * | RowMovePlugin | 互斥 | 同时只能移动行或列 |
 * | ResizePlugin | 冲突检测 | 拖拽时需避开调整手柄区域 |
 * | SelectionPlugin | 联动 | 移动后自动调整选区范围 |
 * | HiddenColumnsPlugin | 过滤 | 隐藏列不参与移动 |
 *
 * ## 事件钩子（Hooks）
 * 插件在执行列移动时会触发以下钩子：
 * - `HOOKS.BEFORE_COLUMN_MOVE`: 移动前拦截（返回 false 可阻止操作）
 * - `HOOKS.AFTER_COLUMN_MOVE`: 移动后通知（用于同步 UI 或日志记录）
 *
 * ## 配置选项
 * ```js
 * {
 *     enabled: true,          // 是否启用（默认启用）
 *     // 未来可扩展：dragThreshold, animationDuration 等
 * }
 * ```
 *
 * @extends BaseMovePlugin
 *
 * @see BaseMovePlugin - 基类，提供生命周期管理和策略注册
 * @see ColumnMoveStrategy - 列移动策略，处理具体的拖拽交互逻辑
 * @see RowMovePlugin - 行移动插件（类似实现，互斥关系）
 */
export class ColumnMovePlugin extends BaseMovePlugin {
    /**
     * 插件名称标识符
     *
     * 用于：
     * - 在 PluginManager 中注册和查找此插件
     * - 作为策略注册的 key（addStrategy 时使用）
     * - 在配置对象 pluginOptions 中访问配置
     *
     * @static
     * @returns {string} "columnMove"
     */
    static get PLUGIN_NAME() {
        return "columnMove";
    }

    /**
     * 创建列移动策略实例（模板方法实现）
     *
     * 此方法是 `BaseMovePlugin` 模板方法模式的核心，
     * 子类必须覆盖以返回对应维度的策略实例。
     *
     * 实现细节：
     * - 使用 `this.eventHandler`（从 BasePlugin 继承）作为策略的事件处理器
     * - ColumnMoveStrategy 将自动接收所有鼠标事件并处理拖拽逻辑
     * - 策略创建后会由基类的 init() 方法自动注册到 EventHandler
     *
     * @override
     * @protected
     * @returns {ColumnMoveStrategy} 列移动策略实例
     *
     * @example
     * // 内部调用链（BaseMovePlugin.init() 中触发）
     * const strategy = this._createStrategy();
     * this.addStrategy(this.constructor.PLUGIN_NAME, strategy);
     */
    _createStrategy() {
        return new ColumnMoveStrategy(this.eventHandler);
    }
}
