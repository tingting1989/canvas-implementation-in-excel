import { BasePlugin } from "./BasePlugin.js";
import {AutoFillStrategy} from "../editor/strategies/AutoFillStrategy.js";


/**
 * 自动填充插件 (Auto Fill Plugin)
 *
 * 将Excel风格的拖拽自动填充功能封装为可插拔组件。
 * 通过组合 {@link AutoFillStrategy} 实现核心交互逻辑，
 * 遵循BasePlugin的生命周期管理规范。
 *
 * ## 核心功能特性
 *
 * **1. 智能序列识别**：
 * ┌────────────────────┬───────────────────────────────────────┐
 * │ 源数据模式         │ 填充结果示例                          │
 * ├────────────────────┼───────────────────────────────────────┤
 * │ 等差数列           │ 1,2,3 → 4,5,6,7,...                │
 * │ 等比数列           │ 2,4,8 → 16,32,64,...               │
 * │ 日期序列           │ 1月,2月 → 3月,4月,5月,...          │
 * │ 星期序列           │ 周一,周二 → 周三,周四,周五,...      │
 * │ 文本+数字          │ Item1,Item2 → Item3,Item4,...       │
 * │ 纯文本复制         │ "文本" → "文本","文本",...          │
 * │ 自定义列表         │ 根据配置的自定义序列循环             │
 * └────────────────────┴───────────────────────────────────────┘
 *
 * **2. 多方向填充支持**：
 * - 向下填充（最常用）：扩展行数
 * - 向上填充：反向扩展
 * - 向右填充：扩展列数
 * - 向左填充：反向扩展
 *
 * **3. 视觉反馈系统**：
 * - 填充手柄：选区右下角的绿色小方块（8x8像素）
 * - 悬停提示：光标变为十字形（crosshair）
 * - 拖拽预览：半透明区域显示即将填充的范围
 * - 实时更新：跟随鼠标动态调整预览范围
 *
 * ## 架构设计
 *
 * ```
 * ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
 * │  AutoFillPlugin   │ →  │ AutoFillStrategy │ →  │ EventHandler     │
 * │  (生命周期管理)   │    │  (交互逻辑)     │    │  (事件分发)     │
 * └─────────────────┘    └──────────────────┘    └─────────────────┘
 *         ↓                       ↓                      ↓
 *    BasePlugin              优先级:90            canvas/document
 *    (标准接口)            MouseStrategy(50)      DOM事件监听
 *                           ResizeStrategy(100)
 * ```
 *
 * **设计原则**：
 * ✅ **单一职责**：插件只负责生命周期，策略负责业务逻辑
 * ✅ **开闭原则**：可通过配置扩展填充规则，无需修改源码
 * ✅ **依赖倒置**：依赖EventHandler抽象，不直接操作DOM
 * ✅ **组合优于继承**：通过组合Strategy实现功能复用
 *
 * ## 生命周期管理
 *
 * ```
 * 加载阶段:
 *   loadPlugin() → init() → 创建Strategy → 注册到EventHandler
 *
 * 运行阶段:
 *   enable() → Strategy.enable() → 开始响应事件
 *   disable() → Strategy.disable() → 停止响应事件
 *
 * 卸载阶段:
 *   unloadPlugin() → destroy() → 移除Strategy → 清理资源
 * ```
 *
 * ## 配置选项
 *
 * ```js
 * {
 *   enabled: true,              // 是否默认启用（默认true）
 *   // 未来可扩展：
 *   customPatterns: [...],      // 自定义填充模式
 *   maxFillSize: 10000,         // 最大填充数量限制
 *   animationDuration: 200,     // 动画时长(ms)
 * }
 * ```
 *
 * ## 使用场景示例
 *
 * ### 场景1：基础使用（自动注册）
 * ```js
 * // 1. 全局注册插件类型
 * import { PluginManager } from './core/PluginManager';
 * import { AutoFillPlugin } from './plugins/AutoFillPlugin';
 * PluginManager.register('autoFill', AutoFillPlugin);
 *
 * // 2. 在工作簿中加载
 * const workbook = new Workbook({ container: '#app' });
 * workbook.loadPlugin('autoFill');
 *
 * // 3. 用户即可使用拖拽填充功能
 * ```
 *
 * ### 场景2：条件性加载
 * ```js
 * // 仅在需要时加载
 * if (userHasPermission('autoFill')) {
 *   workbook.loadPluginClass(AutoFillPlugin);
 * }
 *
 * // 动态禁用/启用
 * workbook.getPlugin('autoFill').disable();  // 临时禁用
 * workbook.getPlugin('autoFill').enable();   // 重新启用
 * ```
 *
 * ### 场景3：自定义配置
 * ```js
 * workbook.loadPluginClass(AutoFillPlugin, {
 *   enabled: false,  // 初始禁用，用户手动开启
 * });
 *
 * // 后续通过UI开启
 * document.getElementById('toggleAutoFill').onclick = () => {
 *   const plugin = workbook.getPlugin('autoFill');
 *   plugin.toggle();  // 切换启用状态
 * };
 * ```
 *
 * ## 性能优化策略
 *
 * - **事件优先级**：90（高于MouseStrategy的50），确保及时响应
 * - **批量操作**：大范围填充使用CellStore批量API
 * - **渲染优化**：拖拽过程中使用requestAnimationFrame节流
 * - **内存管理**：及时清理临时数据引用
 * - **撤销支持**：填充操作记录到UndoManager
 *
 * ## 与其他插件的协作关系
 *
 * | 插件名称 | 协作方式 | 说明 |
 * |---------|---------|------|
 * | CopyPastePlugin | 无冲突 | 处理不同用户操作 |
 * | ValidationPlugin | 可联动 | 填充后触发数据验证 |
 * | UndoManagerPlugin | 自动集成 | 记录填充操作以支持撤销 |
 * | SelectionPlugin | 协同工作 | 操作前后的选区管理 |
 *
 * @class AutoFillPlugin
 * @extends BasePlugin
 *
 * @see BasePlugin - 插件基类，定义标准生命周期接口
 * @see AutoFillStrategy - 核心交互策略，处理拖拽逻辑
 * @see EventHandler - 事件处理器，统一管理DOM事件
 *
 * @example
 * // 完整初始化流程
 * const workbook = new Workbook({
 *   container: '#spreadsheet',
 *   plugins: ['autoFill']  // 或 plugins: [AutoFillPlugin]
 * });
 *
 * // 工作簿创建后自动初始化插件
 * // 用户可直接使用拖拽填充功能
 */
export class AutoFillPlugin extends BasePlugin {
    /**
     * 获取插件标识符（静态属性）
     *
     * 用于在PluginManager中唯一标识此插件。
     * 插件名称遵循kebab-case命名规范。
     *
     * @static
     * @readonly
     * @returns {string} 插件名称："autoFill"
     */
    static get PLUGIN_NAME() {
        return "autoFill";
    }

    /**
     * @private 私有字段 - 自动填充策略实例
     *
     * 持有AutoFillStrategy的引用，用于：
     * - 控制策略的启用/禁用状态
     * - 在销毁时正确清理资源
     * - 提供对外部访问策略的能力（如需调试）
     *
     * @type {AutoFillStrategy|null}
     * @private
     */
    #strategy = null;

    /**
     * 初始化自动填充插件（生命周期钩子）
     *
     * 在插件被加载到工作簿后由框架自动调用。
     * 执行以下初始化步骤：
     *
     * 1. **调用基类初始化**
     *    - 设置enabled状态
     *    - 保存options配置
     *    - 触发beforeInit钩子
     *
     * 2. **创建策略实例**
     *    - new AutoFillStrategy(eventHandler)
     *    - 传入当前工作表的事件处理器
     *    - 策略会自动声明需要监听的事件
     *
     * 3. **注册策略到事件处理器**
     *    - addStrategy("autoFill", strategy)
     *    - EventHandler收集事件声明并绑定
     *    - 设置优先级为90（STRATEGY_PRIORITY.AUTO_FILL）
     *
     * 4. **根据配置决定初始状态**
     *    - options.enabled === false → 调用this.disable()
     *    - 否则保持默认启用状态
     *
     * @param {Object} options - 插件配置选项
     * @param {boolean} [options.enabled=true] - 是否默认启用自动填充功能
     *        设为false可在后续手动调用enable()启用
     *
     * @override
     * @see BasePlugin.init - 基类初始化方法
     *
     * @example
     * // 内部调用示例（通常由框架自动调用）
     * plugin.init({
     *   enabled: true,
     *   // 其他自定义配置...
     * });
     */
    init(options = {}) {
        super.init(options);

        this.#strategy = new AutoFillStrategy(this.eventHandler);
        this.addStrategy("autoFill", this.#strategy);

        if (options.enabled === false) {
            this.disable();
        }
    }

    /**
     * 销毁插件（生命周期钩子）
     *
     * 在插件从工作簿卸载时由框架自动调用。
     * 执行资源清理操作：
     *
     * 清理顺序：
     * 1. **释放策略引用**
     *    - 设置 #strategy = null
     *    - 允许GC回收策略对象
     *
     * 2. **调用基类销毁方法**
     *    - removeOwnStrategies(): 从EventHandler移除策略
     *    - 策略的destroy()方法会被调用（清理内部状态）
     *    - 触发afterDestroy钩子
     *    - 清理其他基类资源
     *
     * 注意事项：
     * - 销毁后插件不可再使用，需重新加载
     * - 正在进行的拖拽操作会被中断
     * - 已产生的填充结果不会回滚（由UndoManager处理）
     *
     * @override
     * @see BasePlugin.destroy - 基类销毁方法
     * @see AutoFillStrategy.destroy - 策略销毁方法
     */
    destroy() {
        this.#strategy = null;
        super.destroy();
    }

    /**
     * 启用自动填充功能
     *
     * 激活插件及其关联的策略。
     * 启用后用户可以正常使用拖拽填充功能。
     *
     * 执行流程：
     * 1. 调用基类的enable()方法
     *    - 设置this.enabled = true
     *    - 触发onEnable钩子
     *
     * 2. 启用关联的AutoFillStrategy
     *    - strategy?.enable()
     *    - 设置strategy.enabled = true
     *    - 策略开始响应鼠标事件
     *
     * 适用场景：
     * - 从禁用状态恢复
     * - 条件性功能开关
     * - 权限控制（获得权限后启用）
     *
     * @override
     * @see BasePlugin.enable - 基类启用方法
     * @see AutoFillStrategy.enable - 策略启用方法
     *
     * @example
     * // 手动启用
     * const plugin = workbook.getPlugin('autoFill');
     * plugin.enable();
     * console.log(plugin.isEnabled);  // true
     */
    enable() {
        super.enable();
        this.#strategy?.enable();
    }

    /**
     * 禁用自动填充功能
     *
     * 停用插件及其关联的策略。
     * 禁用后拖拽填充手柄不会响应，但选区仍正常显示。
     *
     * 执行流程：
     * 1. 调用基类的disable()方法
     *    - 设置this.enabled = false
     *    - 触发onDisable钩子
     *
     * 2. 禁用关联的AutoFillStrategy
     *    - strategy?.disable()
     *    - 设置strategy.enabled = false
     *    - 策略停止响应所有鼠标事件
     *    - 已开始的拖拽操作会立即中断
     *
     * 禁用效果：
     * - 填充手柄仍然可见（由SelectionPlugin绘制）
     * - 但悬停时光标不会变化
     * - 点击手柄不会启动拖拽
     * - 不影响其他鼠标操作（选择、编辑等）
     *
     * 适用场景：
     * - 只读模式下禁止修改数据
     * - 特定操作期间临时禁用
     * - 权限不足时限制功能
     * - 调试时排除干扰因素
     *
     * @override
     * @see BasePlugin.disable - 基类禁用方法
     * @see AutoFillStrategy.disable - 策略禁用方法
     *
     * @example
     * // 临时禁用（如进入只读模式）
     * const plugin = workbook.getPlugin('autoFill');
     * plugin.disable();
     * console.log(plugin.isEnabled);  // false
     *
     * // 后续重新启用
     * setTimeout(() => plugin.enable(), 5000);
     */
    disable() {
        super.disable();
        this.#strategy?.disable();
    }
}
