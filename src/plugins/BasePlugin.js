/**
 * 插件基类
 * 参考 Handsontable BasePlugin 设计
 * https://handsontable.com/docs/javascript-data-grid/api/base-plugin/
 *
 * 所有自定义插件必须继承此类，并实现以下生命周期方法：
 * - constructor(workbook)  → 构造函数，接收 Workbook 实例
 * - init(options?)        → 初始化插件，注册钩子、策略等
 * - destroy()             → 销毁插件，清理所有注册的资源
 * - enable()              → 启用插件（可选覆盖）
 * - disable()             → 禁用插件（可选覆盖）
 *
 * 使用示例：
 * ```js
 * class MyPlugin extends BasePlugin {
 *     static get PLUGIN_NAME() { return 'myPlugin'; }
 *
 *     init(options = {}) {
 *         this.addHook('onCellClick', (row, col) => {
 *             console.log(`点击了 (${row}, ${col})`);
 *         });
 *     }
 *
 *     destroy() {
 *         this.clearOwnHooks();
 *     }
 * }
 * ```
 */
export class BasePlugin {
    /** @type {import("../workbook/Workbook.js").Workbook} */
    #workbook = null;
    /** 插件是否已初始化 */
    #initialized = false;
    /** 插件是否已启用 */
    #enabled = true;
    /** 插件自定义配置 */
    #options = {};
    /** 本插件注册的钩子引用（用于 destroy 时自动清理） */
    #registeredHooks = [];
    /** 本插件注册的策略名称列表（用于 destroy 时自动清理） */
    #registeredStrategies = [];
    /** 本插件注册的 DOM 事件引用（用于 destroy 时自动清理） */
    #registeredDOMEvents = [];

    /**
     * @param {import("../workbook/Workbook.js").Workbook} workbook - Workbook 实例
     */
    constructor(workbook) {
        this.#workbook = workbook;
    }

    /**
     * 插件名称（子类必须覆盖）
     * @returns {string}
     */
    static get PLUGIN_NAME() {
        throw new Error("PLUGIN_NAME must be overridden in subclass");
    }

    /** 获取 Workbook 实例 */
    get workbook() {
        return this.#workbook;
    }

    /** 获取当前活动工作表 */
    get sheet() {
        return this.#workbook?.activeSheet;
    }

    /** 获取渲染引擎 */
    get renderEngine() {
        return this.#workbook?.renderEngine;
    }

    /** 获取事件处理器 */
    get eventHandler() {
        return this.#workbook?.eventHandler;
    }

    /** 获取编辑器管理器 */
    get editor() {
        return this.#workbook?.editor;
    }

    /** 获取钩子系统 */
    get hooks() {
        return this.#workbook?.eventHandler?.hooks;
    }

    /** 获取剪贴板管理器 */
    get clipboard() {
        return this.#workbook?.clipboard;
    }

    /** 获取插件配置 */
    get options() {
        return this.#options;
    }

    /** 插件是否已初始化 */
    get initialized() {
        return this.#initialized;
    }

    /** 插件是否已启用 */
    get enabled() {
        return this.#enabled;
    }

    /**
     * 初始化插件
     * 子类应覆盖此方法，注册钩子、策略等
     *
     * @param {object} options - 插件配置
     */
    init(options = {}) {
        this.#options = options;
        this.#initialized = true;
    }

    /**
     * 销毁插件
     * 子类应覆盖此方法，清理所有注册的资源
     * 基类会自动清理通过 addHook / addStrategy / addDOMEvent 注册的资源
     */
    destroy() {
        this.clearOwnHooks();
        this.removeOwnStrategies();
        this.removeOwnDOMEvents();
        this.#initialized = false;
        this.#enabled = false;
    }

    /**
     * 启用插件
     * 子类可覆盖以添加自定义逻辑
     */
    enable() {
        this.#enabled = true;
    }

    /**
     * 禁用插件
     * 子类可覆盖以添加自定义逻辑
     */
    disable() {
        this.#enabled = false;
    }

    /**
     * 注册钩子回调（自动跟踪，destroy 时自动清理）
     *
     * 回调执行前会自动检查插件的 enabled 状态，
     * 禁用插件的钩子回调会被跳过。
     *
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 回调函数
     */
    addHook(hookName, callback) {
        const guardedCallback = (...args) => {
            if (!this.#enabled) return;
            callback(...args);
        };
        this.hooks?.addHook(hookName, guardedCallback);
        this.#registeredHooks.push({ hookName, callback: guardedCallback });
    }

    /**
     * 注册一次性钩子回调（触发一次后自动移除）
     *
     * 回调执行前会自动检查插件的 enabled 状态。
     *
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 回调函数
     */
    addHookOnce(hookName, callback) {
        const onceCallback = (...args) => {
            if (!this.#enabled) return;
            callback(...args);
            this.#registeredHooks = this.#registeredHooks.filter((h) => h.hookName !== hookName || h.callback !== onceCallback);
        };
        this.hooks?.addHook(hookName, onceCallback);
        this.#registeredHooks.push({ hookName, callback: onceCallback });
    }

    /**
     * 清理本插件注册的所有钩子
     */
    clearOwnHooks() {
        for (const { hookName, callback } of this.#registeredHooks) {
            this.hooks?.removeHook(hookName, callback);
        }
        this.#registeredHooks = [];
    }

    /**
     * 注册事件策略（自动跟踪，destroy 时自动清理）
     *
     * @param {string} name - 策略名称
     * @param {import("../editor/strategies/EventStrategy.js").EventStrategy} strategy - 策略实例
     */
    addStrategy(name, strategy) {
        this.eventHandler?.addStrategy(name, strategy);
        this.#registeredStrategies.push(name);
    }

    /**
     * 移除本插件注册的所有策略
     */
    removeOwnStrategies() {
        for (const name of this.#registeredStrategies) {
            this.eventHandler?.removeStrategy(name);
        }
        this.#registeredStrategies = [];
    }

    /**
     * 注册 DOM 事件监听（自动跟踪，destroy 时自动清理）
     *
     * @param {EventTarget} target - 事件目标（如 canvas、document）
     * @param {string} eventType - 事件类型（如 'click'、'keydown'）
     * @param {Function} handler - 事件处理函数
     * @param {object} [options] - addEventListener 选项
     */
    addDOMEvent(target, eventType, handler, options) {
        target.addEventListener(eventType, handler, options);
        this.#registeredDOMEvents.push({ target, eventType, handler, options });
    }

    /**
     * 移除本插件注册的所有 DOM 事件
     */
    removeOwnDOMEvents() {
        for (const { target, eventType, handler, options } of this.#registeredDOMEvents) {
            target.removeEventListener(eventType, handler, options);
        }
        this.#registeredDOMEvents = [];
    }

    /**
     * 触发重新渲染
     */
    render() {
        this.#workbook?.render();
    }

    /**
     * 获取其他已加载的插件实例
     *
     * @param {string} pluginName - 插件名称
     * @returns {BasePlugin|null}
     */
    getPlugin(pluginName) {
        return this.#workbook?.getPlugin(pluginName);
    }
}
