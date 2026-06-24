import { MouseStrategy, KeyboardStrategy, ResizeStrategy } from "../editor/strategies";
import { Hooks } from "../editor/Hooks.js";
import { RenderEngineViewportService } from "../render/RenderEngineViewportService.js";

/**
 * 事件处理器
 * 统一管理所有交互策略以及钩子系统（Hooks）
 *
 * 事件委托机制：
 * - 每个 target+eventType 只绑定一个 DOM 监听器
 * - 策略通过 getEventHandlers() 声明需要监听的事件
 * - 策略通过 priority 属性声明优先级（数值越大越先处理）
 * - EventHandler 按优先级排序分发，处理器返回 false 可阻止后续策略接收
 *
 * 可选功能（右键菜单、自动填充）通过插件系统加载：
 * - AutoFillPlugin → 注册 autoFill 策略
 * - ContextMenuPlugin → 注册 contextMenu 策略
 */
export class EventHandler {
    /** 事件委托映射表 target:eventType → [{name, handler, priority}] */
    #delegateMap = new Map();

    /** 已绑定的 DOM 监听器 target:eventType → boundListener */
    #boundListeners = new Map();

    /**
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {import("../render/RenderEngine.js").RenderEngine} renderEngine - 渲染引擎
     * @param {import("../editor/EditorManager.js").EditorManager} editor - 编辑器管理器
     * @param {import("../editor/ClipboardManager.js").ClipboardManager} [clipboard] - 剪贴板管理器（可选，由 CopyPastePlugin 注入）
     */
    constructor(sheet, renderEngine, editor, clipboard) {
        this.sheet = sheet;
        this.renderEngine = renderEngine;
        this.editor = editor;
        this.clipboard = clipboard || null;
        this.canvas = renderEngine.canvas;
        this.wrap = renderEngine.canvas.parentElement;

        this.viewport = new RenderEngineViewportService(renderEngine);

        this.hooks = new Hooks();
        this.hooks.init();

        this.strategies = new Map();

        this.#initStrategies();
    }

    /**
     * 初始化核心交互策略
     * 注册顺序不影响优先级，优先级由策略的 priority 属性决定
     *
     * 可选策略（autoFill、contextMenu）由对应插件通过 addStrategy 注册
     */
    #initStrategies() {
        this.addStrategy("resize", new ResizeStrategy(this));
        this.addStrategy("mouse", new MouseStrategy(this));
        this.addStrategy("keyboard", new KeyboardStrategy(this));
    }

    /**
     * 注册一个策略并初始化
     * 自动收集策略声明的事件处理器，按优先级插入统一委托
     *
     * @param {string} name - 策略名称
     * @param {import("../editor/strategies/EventStrategy.js").EventStrategy} strategy - 策略实例
     */
    addStrategy(name, strategy) {
        this.strategies.set(name, strategy);
        strategy.init();
        this.#registerStrategyHandlers(name, strategy);
    }

    /**
     * 获取已注册的策略
     *
     * @param {string} name - 策略名称
     * @returns {import("../editor/strategies/EventStrategy.js").EventStrategy | null}
     */
    getStrategy(name) {
        return this.strategies.get(name) || null;
    }

    /**
     * 移除并销毁策略
     * 自动清理该策略注册的事件处理器
     *
     * @param {string} name - 策略名称
     */
    removeStrategy(name) {
        const strategy = this.strategies.get(name);
        if (strategy) {
            this.#unregisterStrategyHandlers(name);
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

    /**
     * 注册策略的事件处理器到统一委托
     * 收集策略声明的所有事件，按 target:eventType 分组
     * 同一组内按优先级降序排列（priority 越大越先处理）
     *
     * @param {string} name - 策略名称
     * @param {import("../editor/strategies/EventStrategy.js").EventStrategy} strategy - 策略实例
     */
    #registerStrategyHandlers(name, strategy) {
        const handlers = strategy.getEventHandlers();
        const priority = strategy.priority || 0;

        for (const [key, handler] of Object.entries(handlers)) {
            if (!this.#delegateMap.has(key)) {
                this.#delegateMap.set(key, []);

                const [targetName, eventType] = key.split(":");
                const target = this.#resolveTarget(targetName);
                if (!target) continue;

                const boundListener = (e) => {
                    const entries = this.#delegateMap.get(key);
                    if (!entries) return;

                    // 先拷贝快照，防止迭代过程中 entries 被修改（如某个 handler 触发了 removeStrategy）
                    const snapshot = [...entries];
                    for (const { name: strategyName, handler: h } of snapshot) {
                        // 检查策略是否仍然存在且处于启用状态
                        const strategy = this.strategies.get(strategyName);
                        if (!strategy || !strategy.enabled) continue;
                        const result = h(e);
                        if (result === false) break;
                    }
                };

                this.#boundListeners.set(key, boundListener);
                target.addEventListener(eventType, boundListener);
            }

            const entries = this.#delegateMap.get(key);
            const entry = { name, handler, priority };

            let insertIdx = entries.length;
            for (let i = 0; i < entries.length; i++) {
                if (priority > entries[i].priority) {
                    insertIdx = i;
                    break;
                }
            }
            entries.splice(insertIdx, 0, entry);
        }
    }

    /**
     * 从统一委托中移除策略的事件处理器
     * 如果某个 target:eventType 下已无处理器，自动解绑 DOM 监听
     *
     * @param {string} name - 策略名称
     */
    #unregisterStrategyHandlers(name) {
        const strategy = this.strategies.get(name);
        if (!strategy) return;

        const handlers = strategy.getEventHandlers();
        for (const [key] of Object.entries(handlers)) {
            const entries = this.#delegateMap.get(key);
            if (!entries) continue;

            const idx = entries.findIndex((e) => e.name === name);
            if (idx !== -1) entries.splice(idx, 1);

            if (entries.length === 0) {
                const [targetName, eventType] = key.split(":");
                const target = this.#resolveTarget(targetName);
                const boundListener = this.#boundListeners.get(key);
                if (target && boundListener) {
                    target.removeEventListener(eventType, boundListener);
                }
                this.#delegateMap.delete(key);
                this.#boundListeners.delete(key);
            }
        }
    }

    /**
     * 根据名称解析事件目标
     *
     * @param {string} name - 目标名称（canvas / document / window / wrap）
     * @returns {EventTarget|null}
     */
    #resolveTarget(name) {
        switch (name) {
            case "canvas":
                return this.canvas;
            case "document":
                return document;
            case "window":
                return window;
            case "wrap":
                return this.wrap;
            default:
                return null;
        }
    }

    /** 销毁事件处理器，释放所有资源 */
    destroy() {
        for (const [key, boundListener] of this.#boundListeners) {
            const [targetName, eventType] = key.split(":");
            const target = this.#resolveTarget(targetName);
            if (target) {
                target.removeEventListener(eventType, boundListener);
            }
        }
        this.#delegateMap.clear();
        this.#boundListeners.clear();

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
