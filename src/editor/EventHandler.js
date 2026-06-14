import { MouseStrategy, KeyboardStrategy, ResizeStrategy, ContextMenuStrategy, AutoFillStrategy } from "./strategies/index.js";
import { Hooks } from "./Hooks.js";

/**
 * 事件处理器
 * 统一管理所有交互策略（鼠标、键盘、拖拽调整、右键菜单、自动填充）
 * 以及钩子系统（Hooks）
 */
export class EventHandler {
    /**
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {import("../render/RenderEngine.js").RenderEngine} renderEngine - 渲染引擎
     * @param {import("./EditorManager.js").EditorManager} editor - 编辑器管理器
     */
    constructor(sheet, renderEngine, editor) {
        this.sheet = sheet;
        this.renderEngine = renderEngine;
        this.editor = editor;
        this.canvas = renderEngine.canvas;
        this.wrap = renderEngine.canvas.parentElement;

        this.hooks = new Hooks();
        this.hooks.init();

        this.strategies = new Map();
        this.#initStrategies();
    }

    /**
     * 初始化所有交互策略
     * 注册顺序决定了事件处理的优先级
     */
    #initStrategies() {
        this.addStrategy("mouse", new MouseStrategy(this));
        this.addStrategy("keyboard", new KeyboardStrategy(this));
        this.addStrategy("resize", new ResizeStrategy(this));
        this.addStrategy("autoFill", new AutoFillStrategy(this));
        this.addStrategy("contextMenu", new ContextMenuStrategy(this));
    }

    /**
     * 注册一个策略并初始化
     *
     * @param {string} name - 策略名称
     * @param {import("./strategies/EventStrategy.js").EventStrategy} strategy - 策略实例
     */
    addStrategy(name, strategy) {
        this.strategies.set(name, strategy);
        strategy.init();
    }

    /**
     * 获取已注册的策略
     *
     * @param {string} name - 策略名称
     * @returns {import("./strategies/EventStrategy.js").EventStrategy | null}
     */
    getStrategy(name) {
        return this.strategies.get(name) || null;
    }

    /**
     * 移除并销毁策略
     *
     * @param {string} name - 策略名称
     */
    removeStrategy(name) {
        const strategy = this.strategies.get(name);
        if (strategy) {
            strategy.destroy();
            this.strategies.delete(name);
        }
    }

    /** 启用指定策略 */
    enableStrategy(name) {
        const strategy = this.strategies.get(name);
        if (strategy) {
            strategy.enable();
        }
    }

    /** 禁用指定策略 */
    disableStrategy(name) {
        const strategy = this.strategies.get(name);
        if (strategy) {
            strategy.disable();
        }
    }

    /** 触发重新渲染 */
    render() {
        if (this.sheet && this.renderEngine) {
            this.renderEngine.render(this.sheet);
        }
    }

    /** 注册钩子回调 */
    addHook(hookName, callback) {
        this.hooks.addHook(hookName, callback);
    }

    /** 注册一次性钩子回调（触发一次后自动移除） */
    addHookOnce(hookName, callback) {
        this.hooks.addHookOnce(hookName, callback);
    }

    /** 移除指定钩子回调 */
    removeHook(hookName, callback) {
        this.hooks.removeHook(hookName, callback);
    }

    /** 清空指定钩子的所有回调 */
    clearHook(hookName) {
        this.hooks.clearHook(hookName);
    }

    /** 清空所有钩子 */
    clearAllHooks() {
        this.hooks.clearAllHooks();
    }

    /** 执行指定钩子的所有回调 */
    runHooks(hookName, ...args) {
        return this.hooks.runHooks(hookName, ...args);
    }

    /** 执行钩子直到有回调返回非 undefined 值 */
    runHooksUntil(hookName, ...args) {
        return this.hooks.runHooksUntil(hookName, ...args);
    }

    /** 获取所有已注册的钩子名称 */
    getHookNames() {
        return this.hooks.getHookNames();
    }

    /** 检查指定钩子是否有回调 */
    hasHook(hookName) {
        return this.hooks.hasHook(hookName);
    }

    /** 销毁事件处理器，释放所有资源 */
    destroy() {
        for (const [, strategy] of this.strategies) {
            strategy.destroy();
        }
        this.strategies.clear();
        this.hooks.clearAllHooks();
        this.sheet = null;
        this.renderEngine = null;
        this.editor = null;
        this.canvas = null;
        this.wrap = null;
    }
}