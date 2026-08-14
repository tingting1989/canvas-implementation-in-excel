import { InteractionStrategy } from "../editor/strategies/InteractionStrategy.js";
import { Hooks } from "./Hooks.js";
import { HOOKS } from "../constants/hookNames.js";
import { SHEET_EVENTS } from "../constants/sheetEvents.js";
import { RenderEngineViewportService } from "../render/RenderEngineViewportService.js";
import { RenderEngineCanvasContext } from "../render/RenderEngineCanvasContext.js";
import { MouseStrategy } from "../editor/strategies/MouseStrategy.js";
import { KeyboardStrategy } from "../editor/strategies/KeyboardStrategy.js";
import { ResizeStrategy } from "../editor/strategies/ResizeStrategy.js";
import type { Disposable } from "./Disposable.js";

/**
 * 策略条目 - 事件委托映射中的单个条目
 *
 * @property {string} name - 策略名称（如 "mouse", "keyboard"）
 * @property {Function} handler - 事件处理函数
 * @property {number} priority - 优先级（数值越大越先执行）
 */
interface StrategyEntry {
    name: string;
    handler: (...args: any[]) => unknown;
    priority: number;
}

/**
 * 事件策略类型（待具体策略接口定义后替换 any）
 *
 * 策略必须实现以下方法：
 * - init(): 初始化
 * - destroy(): 销毁
 * - enable(): 启用
 * - disable(): 禁用
 * - getEventHandlers(): 返回事件处理函数映射
 * - enabled: 是否启用（getter）
 * - priority: 优先级（可选）
 */
type EventStrategy = any;

/**
 * EventHandler — 事件处理器（策略模式 + 委托模式的核心调度器）
 *
 * 统一管理所有用户交互事件（鼠标、键盘、调整大小等），
 * 通过策略模式将不同类型的事件分发到对应的策略处理器，
 * 通过委托模式实现事件处理的优先级排序和短路控制。
 *
 * 核心能力：
 * - 策略管理：addStrategy/removeStrategy/enableStrategy/disableStrategy
 * - 钩子代理：addHook/removeHook/runHooks/runHooksUntil（委托给 Hooks 实例）
 * - 事件订阅：自动订阅编辑器生命周期事件（通过 EventBus）
 * - 事件委托：按优先级分发 DOM 事件到各策略处理器
 * - 渲染触发：事件处理后可触发重渲染
 *
 * 事件委托机制：
 * - 策略通过 getEventHandlers() 声明需要监听的事件（格式: "target:eventType"）
 * - EventHandler 统一注册 DOM 事件监听器
 * - 事件触发时按优先级顺序调用策略处理器
 * - 处理器返回 false 可中断后续策略执行（短路模式）
 *
 * @example
 * const handler = new EventHandler(sheet, renderEngine, editor);
 * handler.addStrategy("custom", new CustomStrategy(handler));
 * handler.addHook(HOOKS.BEFORE_SET_VALUE_AT, (row, col, value) => { ... });
 */
export class EventHandler {
    /**
     * @private 私有字段 - 事件委托映射表
     *
     * 键为事件标识（格式: "target:eventType"，如 "canvas:click"），
     * 值为按优先级排序的策略条目数组。
     */
    #delegateMap = new Map<string, StrategyEntry[]>();

    /**
     * @private 私有字段 - 已绑定的 DOM 事件监听器映射
     *
     * 键为事件标识，值为绑定了 this 上下文的事件监听函数。
     * 用于在销毁时精确移除对应的事件监听器。
     */
    #boundListeners = new Map<string, (e: Event) => void>();

    /**
     * @private 私有字段 - 钩子执行时的 this 上下文
     *
     * 通过 setHookContext() 设置，runHooks/runHooksUntil 时
     * 钩子回调的 this 将绑定到此上下文。
     */
    #hookContext: unknown = null;

    /**
     * 工作表实例引用
     *
     * 提供对 Sheet 数据模型和事件总线的访问。
     */
    sheet: any;

    /**
     * 渲染引擎实例引用
     *
     * 用于触发重渲染操作。
     */
    renderEngine: any;

    /**
     * 编辑器实例引用
     *
     * 提供单元格编辑能力（进入/退出编辑模式等）。
     */
    editor: any;

    /**
     * 剪贴板实例引用（可选）
     *
     * 提供复制/粘贴/剪切能力。
     */
    clipboard: any;

    /**
     * 主画布元素引用
     *
     * 用户交互的主要事件目标。
     */
    canvas: HTMLCanvasElement;

    /**
     * 画布容器元素引用（可为 null）
     *
     * 用于监听容器级别的事件（如 resize）。
     */
    wrap: HTMLElement | null;

    /**
     * 视口服务实例
     *
     * 提供坐标转换和视口信息查询能力。
     */
    viewport: any;

    /**
     * 画布上下文服务实例
     *
     * 提供画布绘制上下文的访问和操作能力。
     */
    canvasContext: any;

    /**
     * 钩子系统实例
     *
     * 代理所有钩子操作（addHook, runHooks 等），
     * 支持自定义 this 上下文绑定。
     */
    hooks: Hooks;

    /**
     * 已注册的策略映射表
     *
     * 键为策略名称，值为策略实例。
     * 内置策略：resize, mouse, keyboard, interaction。
     */
    strategies = new Map<string, EventStrategy>();

    /**
     * 创建 EventHandler 实例
     *
     * 初始化流程：
     * 1. 保存核心依赖引用（sheet, renderEngine, editor, clipboard）
     * 2. 创建视口和画布上下文服务
     * 3. 初始化钩子系统
     * 4. 注册内置策略（resize, mouse, keyboard, interaction）
     * 5. 订阅编辑器生命周期事件
     *
     * @param {any} sheet - 工作表实例
     * @param {any} renderEngine - 渲染引擎实例
     * @param {any} editor - 编辑器实例
     * @param {any} [clipboard] - 剪贴板实例（可选）
     */
    constructor(sheet: any, renderEngine: any, editor: any, clipboard?: any) {
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

        this.#initStrategies();

        this.#subscribeEditorEvents();
    }

    /**
     * @private 私有方法 - 订阅编辑器生命周期事件
     *
     * 通过 EventBus 监听编辑器的开始/完成编辑、单元格变更等事件，
     * 并触发对应的钩子回调。支持短路返回（返回 false 阻止操作）。
     *
     * @returns {void}
     */
    #subscribeEditorEvents(): void {
        const bus = this.sheet.bus;
        if (!bus) return;

        bus.on(SHEET_EVENTS.EDITOR_BEFORE_BEGIN, (envelope: any) => {
            const [row, col] = envelope.payload;
            return this.runHooksUntil(HOOKS.BEFORE_BEGIN_EDITING, row, col);
        });

        bus.on(SHEET_EVENTS.EDITOR_AFTER_BEGIN, (envelope: any) => {
            const [row, col] = envelope.payload;
            this.runHooks(HOOKS.AFTER_BEGIN_EDITING, row, col);
        });

        bus.on(SHEET_EVENTS.EDITOR_BEFORE_FINISH, (envelope: any) => {
            const [row, col] = envelope.payload;
            return this.runHooksUntil(HOOKS.BEFORE_FINISH_EDITING, row, col);
        });

        bus.on(SHEET_EVENTS.EDITOR_AFTER_FINISH, (envelope: any) => {
            const [row, col, oldValue, newValue] = envelope.payload;
            this.runHooks(HOOKS.AFTER_FINISH_EDITING, row, col, oldValue, newValue);
        });

        bus.on(SHEET_EVENTS.BEFORE_CHANGE, (envelope: any) => {
            const [changes] = envelope.payload;

            for (const change of changes) {
                const { row, col, newValue } = change;

                const validationStrategy = this.strategies.get("validation");
                if (validationStrategy) {
                    const canProceed = validationStrategy.interceptBeforeSetValue(row, col, newValue);
                    if (!canProceed) return false;
                }

                const canSet = this.runHooksUntil(HOOKS.BEFORE_SET_VALUE_AT, row, col, newValue);
                if (canSet === false) {
                    return false;
                }
            }

            return this.runHooksUntil(HOOKS.BEFORE_CHANGE, changes);
        });

        bus.on(SHEET_EVENTS.AFTER_CHANGE, (envelope: any) => {
            const [changes] = envelope.payload;

            const validationStrategy = this.strategies.get("validation");
            if (validationStrategy) {
                for (const change of changes) {
                    validationStrategy.handleAfterSetValue(change.row, change.col, change.newValue);
                }
            }

            const filterStrategy = this.strategies.get("filterClick");
            if (filterStrategy && typeof filterStrategy.handleAfterSetCellData === "function") {
                for (const change of changes) {
                    const oldValue = this.sheet?.cellStore?.get(change.row, change.col)?.value;
                    filterStrategy.handleAfterSetCellData(change.row, change.col, oldValue, change.newValue);
                }
            }

            this.runHooks(HOOKS.AFTER_CHANGE, changes);
        });

        bus.on(SHEET_EVENTS.CELL_MOUSE_OVER, (envelope: any) => {
            const [row, col, event] = envelope.payload;
            this.runHooks(HOOKS.ON_CELL_MOUSE_OVER, row, col, event);
        });

        bus.on(SHEET_EVENTS.CELL_MOUSE_OUT, (envelope: any) => {
            const [row, col, event] = envelope.payload;
            this.runHooks(HOOKS.ON_CELL_MOUSE_OUT, row, col, event);
        });

        bus.on(SHEET_EVENTS.WORKBOOK_INIT, (envelope: any) => {
            const [workbook] = envelope.payload;
            this.runHooks(HOOKS.INIT, workbook);
        });

        bus.on(SHEET_EVENTS.WORKBOOK_DESTROY, (envelope: any) => {
            const [workbook] = envelope.payload;
            this.runHooks(HOOKS.DESTROY, workbook);
        });
    }

    /**
     * @private 私有方法 - 初始化内置策略
     *
     * 注册四个核心策略：
     * - resize: 处理画布/容器尺寸变化
     * - mouse: 处理鼠标交互（点击、拖拽、选择等）
     * - keyboard: 处理键盘交互（输入、快捷键等）
     * - interaction: 处理复合交互逻辑
     *
     * @returns {void}
     */
    #initStrategies(): void {
        this.addStrategy("resize", new ResizeStrategy(this));
        this.addStrategy("mouse", new MouseStrategy(this));
        this.addStrategy("keyboard", new KeyboardStrategy(this));
        const interactionStrategy = new InteractionStrategy(this);
        this.addStrategy("interaction", interactionStrategy);
    }

    /**
     * 注册事件策略
     *
     * 将策略添加到策略映射表，初始化策略，并注册其声明的事件处理函数。
     *
     * @param {string} name - 策略名称（唯一标识）
     * @param {EventStrategy} strategy - 策略实例
     * @returns {void}
     */
    addStrategy(name: string, strategy: EventStrategy): void {
        this.strategies.set(name, strategy);
        strategy.init();
        this.#registerStrategyHandlers(name, strategy);
    }

    /**
     * 获取指定名称的策略实例
     *
     * @param {string} name - 策略名称
     * @returns {EventStrategy|null} 策略实例（不存在时返回 null）
     */
    getStrategy(name: string): EventStrategy | null {
        return this.strategies.get(name) || null;
    }

    /**
     * 移除并销毁指定策略
     *
     * 执行流程：注销事件处理函数 → 调用策略 destroy() → 从映射表删除
     *
     * @param {string} name - 策略名称
     * @returns {void}
     */
    removeStrategy(name: string): void {
        const strategy = this.strategies.get(name);
        if (strategy) {
            this.#unregisterStrategyHandlers(name);
            strategy.destroy();
            this.strategies.delete(name);
        }
    }

    /**
     * 启用指定策略（使其事件处理函数生效）
     *
     * @param {string} name - 策略名称
     * @returns {void}
     */
    enableStrategy(name: string): void {
        const strategy = this.strategies.get(name);
        if (strategy) {
            strategy.enable();
        }
    }

    /**
     * 禁用指定策略（使其事件处理函数被跳过）
     *
     * @param {string} name - 策略名称
     * @returns {void}
     */
    disableStrategy(name: string): void {
        const strategy = this.strategies.get(name);
        if (strategy) {
            strategy.disable();
        }
    }

    /**
     * 触发重渲染
     *
     * 将当前工作表数据传递给渲染引擎进行绘制。
     *
     * @returns {void}
     */
    render(): void {
        if (this.sheet && this.renderEngine) {
            this.renderEngine.render(this.sheet);
        }
    }

    /**
     * 注册持久钩子（代理到 Hooks 实例）
     *
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 钩子回调函数
     * @returns {void}
     */
    addHook(hookName: string, callback: (...args: unknown[]) => unknown): void {
        this.hooks.addHook(hookName, callback);
    }

    /**
     * 注册一次性钩子（代理到 Hooks 实例）
     *
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 钩子回调函数（仅执行一次）
     * @returns {void}
     */
    addHookOnce(hookName: string, callback: (...args: unknown[]) => unknown): void {
        this.hooks.addHookOnce(hookName, callback);
    }

    /**
     * 移除钩子（代理到 Hooks 实例）
     *
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 要移除的回调函数引用
     * @returns {void}
     */
    removeHook(hookName: string, callback: (...args: unknown[]) => unknown): void {
        this.hooks.removeHook(hookName, callback);
    }

    /**
     * 清空指定钩子的所有回调（代理到 Hooks 实例）
     *
     * @param {string} hookName - 钩子名称
     * @returns {void}
     */
    clearHook(hookName: string): void {
        this.hooks.clearHook(hookName);
    }

    /**
     * 清空所有钩子的回调（代理到 Hooks 实例）
     *
     * @returns {void}
     */
    clearAllHooks(): void {
        this.hooks.clearAllHooks();
    }

    /**
     * 设置钩子执行时的 this 上下文
     *
     * 通过 runHooks/runHooksUntil 执行钩子回调时，
     * callback.call(context, ...args) 中的 context 即为此值。
     *
     * @param {unknown} context - this 上下文对象
     * @returns {void}
     */
    setHookContext(context: unknown): void {
        this.#hookContext = context;
    }

    /**
     * 执行指定钩子的所有回调（带自定义 this 上下文）
     *
     * 委托给 Hooks.runHooksWithCallback，使用 callback.call(#hookContext, ...args) 执行。
     *
     * @param {string} hookName - 钩子名称
     * @param {unknown[]} args - 传递给回调的参数
     * @returns {unknown} 最后一个回调的返回值
     */
    runHooks(hookName: string, ...args: unknown[]): unknown {
        return this.hooks.runHooksWithCallback(hookName, (callback) => callback.call(this.#hookContext, ...args));
    }

    /**
     * 执行钩子回调直到返回非 undefined 值（带自定义 this 上下文）
     *
     * 委托给 Hooks.runHooksUntilWithCallback，使用 callback.call(#hookContext, ...args) 执行。
     *
     * @param {string} hookName - 钩子名称
     * @param {unknown[]} args - 传递给回调的参数
     * @returns {unknown} 第一个非 undefined 的回调返回值
     */
    runHooksUntil(hookName: string, ...args: unknown[]): unknown {
        return this.hooks.runHooksUntilWithCallback(hookName, (callback) => callback.call(this.#hookContext, ...args));
    }

    /**
     * 获取所有已注册的钩子名称列表（代理到 Hooks 实例）
     *
     * @returns {string[]} 钩子名称数组
     */
    getHookNames(): string[] {
        return this.hooks.getHookNames();
    }

    /**
     * 检查指定钩子是否有注册的回调（代理到 Hooks 实例）
     *
     * @param {string} hookName - 钩子名称
     * @returns {boolean} true 表示有至少一个回调
     */
    hasHook(hookName: string): boolean {
        return this.hooks.hasHook(hookName);
    }

    /**
     * @private 私有方法 - 注册策略的事件处理函数到委托映射表
     *
     * 执行流程：
     * 1. 获取策略声明的事件处理函数映射（getEventHandlers）
     * 2. 对每个事件标识（格式: "target:eventType"）：
     *    a. 如果是首次注册，创建委托监听器并绑定到 DOM 目标
     *    b. 按优先级插入到委托映射表的对应位置
     *
     * 委托监听器逻辑：
     * - 事件触发时，按优先级顺序调用策略处理函数
     * - 跳过已禁用的策略（strategy.enabled === false）
     * - 处理函数返回 false 时中断后续策略执行
     *
     * @param {string} name - 策略名称
     * @param {EventStrategy} strategy - 策略实例
     * @returns {void}
     */
    #registerStrategyHandlers(name: string, strategy: EventStrategy): void {
        const handlers = strategy.getEventHandlers();
        const priority = strategy.priority || 0;

        for (const [key, handler] of Object.entries(handlers) as [string, (...args: any[]) => unknown][]) {
            if (!this.#delegateMap.has(key)) {
                this.#delegateMap.set(key, []);

                const [targetName, eventType] = key.split(":");
                const target = this.#resolveTarget(targetName);
                if (!target) continue;

                const boundListener = (e: Event) => {
                    const entries = this.#delegateMap.get(key);
                    if (!entries) return;

                    const snapshot = [...entries];
                    for (const { name: strategyName, handler: h } of snapshot) {
                        const strategy = this.strategies.get(strategyName);
                        if (!strategy || !strategy.enabled) continue;
                        const result = h(e);
                        if (result === false) break;
                    }
                };

                this.#boundListeners.set(key, boundListener);
                target.addEventListener(eventType, boundListener);
            }

            const entries = this.#delegateMap.get(key)!;
            const entry: StrategyEntry = { name, handler, priority };

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
     * @private 私有方法 - 注销策略的事件处理函数
     *
     * 执行流程：
     * 1. 从委托映射表中移除该策略的所有条目
     * 2. 如果某事件标识已无任何策略监听，移除对应的 DOM 事件监听器
     * 3. 清理映射表中的空条目
     *
     * @param {string} name - 策略名称
     * @returns {void}
     */
    #unregisterStrategyHandlers(name: string): void {
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
     * @private 私有方法 - 根据目标名称解析 DOM 事件目标
     *
     * 支持的目标名称：
     * - "canvas": 主画布元素
     * - "document": document 对象
     * - "window": window 对象
     * - "wrap": 画布容器元素
     *
     * @param {string} name - 目标名称
     * @returns {EventTarget|null} 对应的事件目标（未知名称返回 null）
     */
    #resolveTarget(name: string): EventTarget | null {
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

    /**
     * 销毁事件处理器（释放所有资源）
     *
     * 执行流程：
     * 1. 移除所有 DOM 事件监听器
     * 2. 清空委托映射表和绑定监听器映射
     * 3. 销毁所有策略实例
     * 4. 清空钩子系统
     * 5. 置空所有引用（防止内存泄漏）
     *
     * @returns {void}
     */
    destroy(): void {
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
        this.canvas = null as any;
        this.wrap = null;
    }
}
