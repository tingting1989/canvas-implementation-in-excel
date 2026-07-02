import { MouseStrategy, KeyboardStrategy, ResizeStrategy } from "../editor/strategies";
import { Hooks } from "./Hooks.js";
import { HOOKS } from "../constants/hookNames.js";
import { SHEET_EVENTS } from "../constants/sheetEvents.js";
import { RenderEngineViewportService } from "../render/RenderEngineViewportService.js";
import { RenderEngineCanvasContext } from "../render/RenderEngineCanvasContext.js";

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

    /** Hook 回调的 this 上下文（通常为 Workbook 实例） */
    #hookContext = null;

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
        this.canvasContext = new RenderEngineCanvasContext(renderEngine);

        this.hooks = sheet.hooks || new Hooks();
        if (!sheet.hooks) {
            this.hooks.init();
        }

        this.strategies = new Map();

        this.#initStrategies();

        // ✅ 订阅 EventBus 事件，桥接到 Hooks 系统
        this.#subscribeEditorEvents();
    }

    /**
     * 订阅编辑器生命周期事件并转换为 Hooks 调用
     *
     * 这是 EventBus 与 Hooks 之间的桥梁层：
     * - CellEditor/MouseStrategy/Workbook 通过 EventBus 发射事件
     * - EventHandler 订阅这些事件并触发对应的 hooks
     *
     * 好处：
     * 1. CellEditor 不需要知道 EventHandler 的存在（完全解耦）
     * 2. 可以灵活地决定哪些事件转换为 hooks，哪些不转换
     * 3. 易于测试和扩展
     */
    #subscribeEditorEvents() {
        const bus = this.sheet.bus;
        if (!bus) return;

        // ==================== 编辑器生命周期事件 ====================
        // 注意：EventBus.emit() 会将参数包装成 envelope 对象传给监听器
        // envelope = { source, sheetId, timestamp, type, payload }
        // 所以需要从 envelope.payload 中提取实际参数

        // 即将开始编辑 → BEFORE_BEGIN_EDITING hook
        bus.on(SHEET_EVENTS.EDITOR_BEFORE_BEGIN, (envelope) => {
            const [row, col] = envelope.payload;
            return this.runHooksUntil(HOOKS.BEFORE_BEGIN_EDITING, row, col);
        });

        // 已开始编辑 → AFTER_BEGIN_EDITING hook
        bus.on(SHEET_EVENTS.EDITOR_AFTER_BEGIN, (envelope) => {
            const [row, col] = envelope.payload;
            this.runHooks(HOOKS.AFTER_BEGIN_EDITING, row, col);
        });

        // 即将提交编辑 → BEFORE_FINISH_EDITING hook
        bus.on(SHEET_EVENTS.EDITOR_BEFORE_FINISH, (envelope) => {
            const [row, col] = envelope.payload;
            return this.runHooksUntil(HOOKS.BEFORE_FINISH_EDITING, row, col);
        });

        // 已完成编辑 → AFTER_FINISH_EDITING hook
        bus.on(SHEET_EVENTS.EDITOR_AFTER_FINISH, (envelope) => {
            const [row, col, oldValue, newValue] = envelope.payload;
            this.runHooks(HOOKS.AFTER_FINISH_EDITING, row, col, oldValue, newValue);
        });

        // ==================== 数据变更事件 ====================

        // 值变更前 → BEFORE_CHANGE hook + BEFORE_SET_VALUE_AT（逐单元格验证）
        bus.on(SHEET_EVENTS.BEFORE_CHANGE, (envelope) => {
            const [changes] = envelope.payload;

            console.log("[EH-DEBUG] BEFORE_CHANGE triggered, changes =", JSON.stringify(changes));

            for (const change of changes) {
                const { row, col, newValue } = change;
                console.log(`[EH-DEBUG] Checking BEFORE_SET_VALUE_AT for (${row},${col}) value=${newValue}`);
                const canSet = this.runHooksUntil(HOOKS.BEFORE_SET_VALUE_AT, row, col, newValue);
                console.log(`[EH-DEBUG] BEFORE_SET_VALUE_AT result =`, canSet, `(type=${typeof canSet})`);
                if (canSet === false) {
                    console.log("[EH-DEBUG] 🛑 BLOCKED by BEFORE_SET_VALUE_AT");
                    return false;
                }
            }

            return this.runHooksUntil(HOOKS.BEFORE_CHANGE, changes);
        });

        // 值变更后 → AFTER_CHANGE hook
        bus.on(SHEET_EVENTS.AFTER_CHANGE, (envelope) => {
            const [changes] = envelope.payload;
            this.runHooks(HOOKS.AFTER_CHANGE, changes);
        });

        // ==================== 鼠标交互事件 ====================

        // 鼠标进入单元格 → ON_CELL_MOUSE_OVER hook
        bus.on(SHEET_EVENTS.CELL_MOUSE_OVER, (envelope) => {
            const [row, col, event] = envelope.payload;
            this.runHooks(HOOKS.ON_CELL_MOUSE_OVER, row, col, event);
        });

        // 鼠标离开单元格 → ON_CELL_MOUSE_OUT hook
        bus.on(SHEET_EVENTS.CELL_MOUSE_OUT, (envelope) => {
            const [row, col, event] = envelope.payload;
            this.runHooks(HOOKS.ON_CELL_MOUSE_OUT, row, col, event);
        });

        // ==================== Workbook 生命周期事件 ====================

        // 工作簿初始化完成 → INIT hook
        bus.on(SHEET_EVENTS.WORKBOOK_INIT, (envelope) => {
            const [workbook] = envelope.payload;
            this.runHooks(HOOKS.INIT, workbook);
        });

        // 工作簿即将销毁 → DESTROY hook
        bus.on(SHEET_EVENTS.WORKBOOK_DESTROY, (envelope) => {
            const [workbook] = envelope.payload;
            this.runHooks(HOOKS.DESTROY, workbook);
        });
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

    /**
     * 设置 Hook 回调的 this 上下文
     * @param {*} context - 通常为 Workbook 实例
     */
    setHookContext(context) {
        this.#hookContext = context;
    }

    /** 执行指定钩子的所有回调 */
    runHooks(hookName, ...args) {
        return this.hooks.runHooksWithCallback(hookName, (callback) => callback.call(this.#hookContext, ...args));
    }

    /** 执行钩子直到有回调返回非 undefined 值 */
    runHooksUntil(hookName, ...args) {
        return this.hooks.runHooksUntilWithCallback(hookName, (callback) => callback.call(this.#hookContext, ...args));
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