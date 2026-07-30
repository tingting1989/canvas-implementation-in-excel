/**
 * 事件策略基类 (Event Strategy Base Class)
 *
 * 所有交互策略的抽象基类，提供统一接口规范和基础功能实现。
 * 是Canvas表格编辑器策略模式的核心组件。
 *
 * 设计模式：策略模式 + 观察者模式
 *
 * 核心职责：
 * 1. **统一接口规范**：定义所有策略必须遵循的契约
 * 2. **生命周期管理**：提供 init/destroy/enable/disable 钩子
 * 3. **事件声明机制**：通过 getEventHandlers() 声明感兴趣的事件
 * 4. **优先级控制**：支持策略间的执行顺序控制
 *
 * 事件委托架构：
 * ┌─────────────┐    ┌────────────────┐    ┌──────────────────┐
 * │ DOM Events   │ →  │ EventHandler   │ →  │ EventStrategy[]   │
 * │ (mousedown等)│    │ (统一分发)     │    │ (按优先级处理)    │
 * └─────────────┘    └────────────────┘    └──────────────────┘
 *
 * 工作流程：
 * 1. 子类通过 getEventHandlers() 返回事件映射表
 * 2. EventHandler 收集所有策略的事件声明
 * 3. 统一绑定到对应的DOM元素上
 * 4. 事件触发时，按 priority 降序调用各策略的处理器
 * 5. 如果某策略返回 false，阻止后续策略处理该事件
 *
 * 事件键格式规范：
 * - "canvas:mousedown" - Canvas元素的mousedown事件
 * - "document:mousemove" - document的mousemove事件
 * - "window:resize" - window的resize事件
 * - 格式："目标元素:事件类型"
 *
 * 子类列表：
 * - {@link MouseStrategy} - 鼠标交互策略
 * - {@link KeyboardStrategy} - 键盘交互策略
 * - {@link ResizeStrategy} - 尺寸调整策略
 * - {@link ContextMenuStrategy} - 右键菜单策略
 * - {@link AutoFillStrategy} - 自动填充策略
 * - {@link SortStrategy} - 排序策略
 * - {@link ChartSelectionStrategy} - 图表选区策略
 * - {@link CopyPasteStrategy} - 复制粘贴策略
 * - {@link ColumnMoveStrategy} - 列移动策略
 * - {@link RowMoveStrategy} - 行移动策略
 * - {@link ValidationStrategy} - 数据验证策略
 *
 * @class EventStrategy
 * @abstract
 *
 * @example
 * ```js
 * // 自定义策略示例
 * class MyCustomStrategy extends EventStrategy {
 *   // 设置较高优先级
 *   priority = 100;
 *
 *   // 初始化时创建资源
 *   init() {
 *     this.data = new Map();
 *   }
 *
 *   // 声明监听的事件
 *   getEventHandlers() {
 *     return {
 *       'canvas:click': this.handleClick.bind(this),
 *       'document:keydown': this.handleKey.bind(this)
 *     };
 *   }
 *
 *   // 事件处理器
 *   handleClick(e) {
 *     console.log('Canvas clicked!', e);
 *     // 返回 false 可阻止其他策略处理此事件
 *     return true;
 *   }
 *
 *   // 清理资源
 *   destroy() {
 *     this.data.clear();
 *   }
 * }
 *
 * // 注册到编辑器
 * editor.addStrategy(new MyCustomStrategy(handler));
 * ```
 */
export class EventStrategy {
    /**
     * 策略优先级（数值越大越先处理事件）
     *
     * 控制多个策略对同一事件的执行顺序。
     * EventHandler 会按照 priority 从高到低的顺序调用策略。
     *
     * 优先级建议值：
     * - 0-10: 低优先级（如日志、统计）
     * - 11-50: 中优先级（如普通交互）
     * - 51-100: 高优先级（如核心功能）
     * - 101+: 最高优先级（如系统级拦截）
     *
     * @type {number}
     * @default 0
     */
    priority = 0;

    /**
     * 创建事件策略实例
     *
     * 初始化策略的基本状态：
     * - 保存 EventHandler 引用（用于访问工作簿、工作表等）
     * - 默认启用状态为 true
     *
     * @param {import("../../core/EventHandler.js").EventHandler} handler - 事件处理器实例
     *        提供对工作簿、工作表、渲染引擎等的访问
     */
    constructor(handler) {
        /**
         * 事件处理器引用
         * @type {import("../../core/EventHandler.js").EventHandler}
         */
        this.handler = handler;

        /**
         * 策略是否启用
         * @type {boolean}
         */
        this.enabled = true;
    }

    /**
     * 初始化策略（生命周期钩子）
     *
     * 在策略注册后、首次使用前调用。
     * 用于执行非事件绑定的初始化操作，如：
     * - 创建内部数据结构
     * - 初始化配置参数
     * - 预加载资源
     * - 订阅非DOM事件（如自定义事件总线）
     *
     * 注意：不要在此方法中绑定DOM事件，
     * DOM事件应通过 getEventHandlers() 声明。
     *
     * @virtual
     */
    init() {}

    /**
     * 销毁策略（生命周期钩子）
     *
     * 在策略从编辑器移除时调用。
     * 用于清理所有资源，防止内存泄漏：
     * - 清空内部数据结构
     * - 取消定时器/动画帧
     * - 取消事件订阅
     * - 释放外部资源引用
     *
     * 注意：DOM事件由 EventHandler 自动解绑，
     * 无需在此方法中手动移除。
     *
     * @virtual
     */
    destroy() {}

    /**
     * 启用策略
     *
     * 将 enabled 标记设为 true。
     * 启用后，策略的事件处理器会被正常调用。
     *
     * 可以在运行时动态切换策略的启用状态，
     * 实现条件性功能开关。
     */
    enable() {
        this.enabled = true;
    }

    /**
     * 禁用策略
     *
     * 将 enabled 标记设为 false。
     * 禁用后，策略的事件处理器不会被调用。
     *
     * 适用场景：
     * - 特定模式下临时禁用某些交互
     * - 权限控制（根据用户角色启用/禁用）
     * - 性能优化（暂时不需要时禁用）
     * - 调试时排除某个策略的影响
     */
    disable() {
        this.enabled = false;
    }

    /**
     * 声明此策略需要监听的事件处理器
     *
     * 这是策略模式的核心方法。子类通过重写此方法
     * 声明自己感兴趣的事件及其处理函数。
     *
     * 返回格式：
     * ```js
     * {
     *   'target:eventType': handlerFunction,
     *   ...
     * }
     * ```
     *
     * 支持的目标元素：
     * - canvas: Canvas画布元素
     * - document: document对象
     * - window: window对象
     * - 自定义: 其他已注册的DOM元素
     *
     * 处理函数签名：
     * ```js
     * function handler(event): boolean|void
     * ```
     * - 参数: 原生Event对象
     * - 返回值:
     *   - undefined/true: 允许后续策略继续处理
     *   - false: 阻止后续策略处理此事件（事件消费）
     *
     * @returns {Object<string, Function>} 事件处理器映射表
     *          键格式: "目标元素:事件类型"
     *          值: 事件处理函数
     *
     * @example
     * ```js
     * getEventHandlers() {
     *   return {
     *     // Canvas上的鼠标按下事件
     *     'canvas:mousedown': (e) => this.onMouseDown(e),
     *
     *     // 文档级别的鼠标移动（用于拖拽跟踪）
     *     'document:mousemove': (e) => this.onMouseMove(e),
     *
     *     // 窗口大小改变
     *     'window:resize': () => this.onResize()
     *   };
     * }
     * ```
     *
     * @virtual
     */
    getEventHandlers() {
        return {};
    }
}
