import { BasePlugin } from "./BasePlugin.js";

/**
 * 行/列拖拽移动插件基类
 *
 * ## 设计目的
 * 消除 `RowMovePlugin` 与 `ColumnMovePlugin` 之间的代码重复。
 * 两者的唯一区别在于创建的策略实例不同（`RowMoveStrategy` vs `ColumnMoveStrategy`），
 * 插件本身的初始化、启用/禁用、销毁逻辑完全一致。
 *
 * ## 模板方法模式
 * 子类只需覆盖两个成员：
 * - `static PLUGIN_NAME` — 插件名称标识
 * - `_createStrategy()` — 工厂方法，返回对应的移动策略实例
 *
 * ## 策略模式集成
 * 基类在 `init()` 中调用 `_createStrategy()` 获取策略实例，
 * 并通过 `addStrategy()` 将其注册到 EventHandler。
 * 注册后策略将自动参与事件分发，无需手动管理。
 *
 * ## 资源管理
 * - `init()` → 创建策略并注册（`addStrategy` 自动追踪，`destroy` 时自动清理）
 * - `enable()/disable()` → 同步策略的启用/禁用状态
 * - `destroy()` → 清空策略引用，调用 `super.destroy()` 清理所有注册资源
 *
 * @extends BasePlugin
 *
 * @example
 * // 子类实现示例
 * class RowMovePlugin extends BaseMovePlugin {
 *     static get PLUGIN_NAME() { return "rowMove"; }
 *     _createStrategy() { return new RowMoveStrategy(this.eventHandler); }
 * }
 */
export class BaseMovePlugin extends BasePlugin {
    // ═══════════════════════════════════════════════════════════════
    // 私有实例字段
    // ═══════════════════════════════════════════════════════════════

    /**
     * 移动交互策略实例
     * 由 `_createStrategy()` 创建，通过 `addStrategy()` 注册到 EventHandler。
     * @type {import("../editor/strategies/EventStrategy.js").EventStrategy | null}
     * @private
     */
    #strategy = null;

    // ═══════════════════════════════════════════════════════════════
    // 模板方法（子类必须覆盖）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 创建对应的移动策略实例（模板方法，子类必须覆盖）
     *
     * 子类根据维度返回不同的策略：
     * - `RowMovePlugin` → `new RowMoveStrategy(this.eventHandler)`
     * - `ColumnMovePlugin` → `new ColumnMoveStrategy(this.eventHandler)`
     *
     * @returns {import("../editor/strategies/EventStrategy.js").EventStrategy}
     * @throws {Error} 子类未覆盖时抛出
     * @protected
     */
    _createStrategy() {
        throw new Error("_createStrategy() must be overridden in subclass");
    }

    // ═══════════════════════════════════════════════════════════════
    // 生命周期
    // ═══════════════════════════════════════════════════════════════

    /**
     * 初始化插件
     *
     * 执行步骤：
     * 1. 调用 `super.init(options)` 保存配置
     * 2. 调用 `_createStrategy()` 创建策略实例
     * 3. 通过 `addStrategy()` 注册策略（自动追踪，destroy 时自动清理）
     * 4. 若 `options.enabled === false`，立即禁用
     *
     * @param {object} [options={}] - 插件配置
     * @param {boolean} [options.enabled=true] - 是否初始启用
     */
    init(options = {}) {
        super.init(options);

        // 创建并注册策略实例
        this.#strategy = this._createStrategy();
        this.addStrategy(this.constructor.PLUGIN_NAME, this.#strategy);

        // 支持通过配置初始禁用
        if (options.enabled === false) {
            this.disable();
        }
    }

    /**
     * 销毁插件
     *
     * 清空策略引用，然后调用 `super.destroy()` 自动清理：
     * - 通过 `addStrategy()` 注册的策略
     * - 通过 `addHook()` 注册的钩子
     * - 通过 `addDOMEvent()` 注册的 DOM 事件
     */
    destroy() {
        this.#strategy = null;
        super.destroy();
    }

    /**
     * 启用插件
     *
     * 恢复插件激活状态，并同步启用策略实例。
     * 策略启用后，相关事件（如 mousedown on header）将被正常处理。
     */
    enable() {
        super.enable();
        this.#strategy?.enable();
    }

    /**
     * 禁用插件
     *
     * 设置插件为非激活状态，并同步禁用策略实例。
     * 策略禁用后，相关事件将被忽略，用户无法拖拽移动行/列。
     */
    disable() {
        super.disable();
        this.#strategy?.disable();
    }
}
