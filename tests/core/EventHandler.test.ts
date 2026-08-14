import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventHandler } from "@/core/EventHandler";
import { HOOKS } from "@/constants/hookNames";
import { Hooks } from "@/core/Hooks";

function createMockStrategy(name: string, options: {
    priority?: number;
    eventHandlers?: Record<string, (...args: any[]) => any>;
    enabled?: boolean;
} = {}) {
    const { priority = 0, eventHandlers = {}, enabled = true } = options;
    return {
        name,
        priority,
        _enabled: enabled,
        init: vi.fn(),
        destroy: vi.fn(),
        enable: vi.fn(function (this: any) { this._enabled = true; }),
        disable: vi.fn(function (this: any) { this._enabled = false; }),
        get enabled() { return this._enabled; },
        set enabled(v: boolean) { this._enabled = v; },
        getEventHandlers: vi.fn(() => eventHandlers),
    };
}

function createFullMockRenderEngine() {
    const canvas = document.createElement("canvas");
    const wrap = document.createElement("div");
    wrap.appendChild(canvas);
    document.body.appendChild(wrap);
    return {
        canvas,
        _wrap: wrap,
        render: vi.fn(),
        hitTest: vi.fn(() => ({ row: 0, col: 0, region: "cell" })),
        headerHitTest: vi.fn(() => null),
        fillHandleHitTest: vi.fn(() => null),
        getCellRect: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 30 })),
        scrollToCell: vi.fn(),
        setResizeLine: vi.fn(),
        clearResizeLine: vi.fn(),
        invalidateAll: vi.fn(),
        currentSheet: null,
        scrollX: 0,
        scrollY: 0,
        viewW: 800,
        viewH: 600,
        maxScrollX: 0,
        maxScrollY: 0,
        chartLayer: null,
        selectionLayer: {
            setRowMoveState: vi.fn(),
            setColumnMoveState: vi.fn(),
        },
        getCellBounds: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 30 })),
        getScrollOffset: vi.fn(() => ({ x: 0, y: 0 })),
        getVisibleRange: vi.fn(() => ({ startRow: 0, endRow: 50, startCol: 0, endCol: 26 })),
        getCanvasRect: vi.fn(() => ({ left: 0, top: 0, width: 800, height: 600 })),
        getRowHeaderWidth: vi.fn(() => 50),
        getColHeaderHeight: vi.fn(() => 25),
        getFreeze: vi.fn(() => ({ fixedRowsTop: 0, fixedColumnsStart: 0 })),
        getStyle: vi.fn(() => ({})),
        requestRender: vi.fn(),
    };
}

function createFullMockSheet() {
    const hooks = new Hooks();
    hooks.init();
    return {
        hooks,
        bus: {
            on: vi.fn(),
            off: vi.fn(),
            emit: vi.fn(),
        },
        cellStore: {
            get: vi.fn(() => ({ value: "" })),
            set: vi.fn(),
        },
        getCellValue: vi.fn(() => ""),
        setCellValue: vi.fn(),
        getRowCount: vi.fn(() => 100),
        getColCount: vi.fn(() => 26),
        getRowHeight: vi.fn(() => 30),
        getColWidth: vi.fn(() => 100),
        getMergeCells: vi.fn(() => []),
        getSelection: vi.fn(() => ({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 })),
        setSelection: vi.fn(),
        getActiveCell: vi.fn(() => ({ row: 0, col: 0 })),
        setActiveCell: vi.fn(),
    };
}

function createFullMockEditor() {
    return {
        beginEdit: vi.fn(),
        finishEdit: vi.fn(),
        cancelEdit: vi.fn(),
        isEditing: vi.fn(() => false),
        getEditorValue: vi.fn(() => ""),
        setEditorValue: vi.fn(),
    };
}

describe("EventHandler - 策略管理", () => {
    let handler: EventHandler;
    let mockSheet: ReturnType<typeof createFullMockSheet>;
    let mockRenderEngine: ReturnType<typeof createFullMockRenderEngine>;
    let mockEditor: ReturnType<typeof createFullMockEditor>;

    beforeEach(() => {
        mockSheet = createFullMockSheet();
        mockRenderEngine = createFullMockRenderEngine();
        mockEditor = createFullMockEditor();
        handler = new EventHandler(mockSheet, mockRenderEngine, mockEditor);
    });

    afterEach(() => {
        handler.destroy();
        const wrap = mockRenderEngine._wrap;
        if (wrap && wrap.parentNode) {
            wrap.parentNode.removeChild(wrap);
        }
    });

    it("构造时应注册内置策略", () => {
        expect(handler.strategies.has("resize")).toBe(true);
        expect(handler.strategies.has("mouse")).toBe(true);
        expect(handler.strategies.has("keyboard")).toBe(true);
        expect(handler.strategies.has("interaction")).toBe(true);
    });

    it("addStrategy 应注册策略并调用 init", () => {
        const strategy = createMockStrategy("custom");
        handler.addStrategy("custom", strategy);
        expect(handler.strategies.has("custom")).toBe(true);
        expect(strategy.init).toHaveBeenCalledOnce();
    });

    it("getStrategy 应返回已注册的策略", () => {
        const strategy = createMockStrategy("test");
        handler.addStrategy("test", strategy);
        expect(handler.getStrategy("test")).toBe(strategy);
    });

    it("getStrategy 未注册时返回 null", () => {
        expect(handler.getStrategy("nonexistent")).toBeNull();
    });

    it("removeStrategy 应注销事件、销毁策略并从映射表删除", () => {
        const strategy = createMockStrategy("removable", {
            eventHandlers: { "canvas:click": vi.fn() },
        });
        handler.addStrategy("removable", strategy);
        expect(handler.strategies.has("removable")).toBe(true);

        handler.removeStrategy("removable");
        expect(handler.strategies.has("removable")).toBe(false);
        expect(strategy.destroy).toHaveBeenCalledOnce();
    });

    it("removeStrategy 不存在的策略不应报错", () => {
        expect(() => handler.removeStrategy("nonexistent")).not.toThrow();
    });

    it("enableStrategy 应调用策略的 enable", () => {
        const strategy = createMockStrategy("test", { enabled: false });
        handler.addStrategy("test", strategy);
        handler.enableStrategy("test");
        expect(strategy.enable).toHaveBeenCalledOnce();
    });

    it("disableStrategy 应调用策略的 disable", () => {
        const strategy = createMockStrategy("test");
        handler.addStrategy("test", strategy);
        handler.disableStrategy("test");
        expect(strategy.disable).toHaveBeenCalledOnce();
    });

    it("enableStrategy/disableStrategy 对不存在的策略不应报错", () => {
        expect(() => handler.enableStrategy("nonexistent")).not.toThrow();
        expect(() => handler.disableStrategy("nonexistent")).not.toThrow();
    });
});

describe("EventHandler - 钩子代理", () => {
    let handler: EventHandler;
    let mockSheet: ReturnType<typeof createFullMockSheet>;
    let mockRenderEngine: ReturnType<typeof createFullMockRenderEngine>;
    let mockEditor: ReturnType<typeof createFullMockEditor>;

    beforeEach(() => {
        mockSheet = createFullMockSheet();
        mockRenderEngine = createFullMockRenderEngine();
        mockEditor = createFullMockEditor();
        handler = new EventHandler(mockSheet, mockRenderEngine, mockEditor);
    });

    afterEach(() => {
        handler.destroy();
        const wrap = mockRenderEngine._wrap;
        if (wrap && wrap.parentNode) {
            wrap.parentNode.removeChild(wrap);
        }
    });

    it("addHook 应代理到 hooks 实例", () => {
        const callback = vi.fn();
        handler.addHook(HOOKS.ON_CELL_CLICK, callback);
        expect(handler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);
    });

    it("removeHook 应代理到 hooks 实例", () => {
        const callback = vi.fn();
        handler.addHook(HOOKS.ON_CELL_CLICK, callback);
        handler.removeHook(HOOKS.ON_CELL_CLICK, callback);
        expect(handler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(false);
    });

    it("addHookOnce 应注册一次性钩子", () => {
        const callback = vi.fn();
        handler.addHookOnce(HOOKS.ON_CELL_CLICK, callback);
        expect(handler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);
        handler.runHooks(HOOKS.ON_CELL_CLICK, 1, 2);
        expect(callback).toHaveBeenCalledOnce();
        expect(handler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(false);
    });

    it("clearHook 应清除指定钩子的所有回调", () => {
        handler.addHook(HOOKS.ON_CELL_CLICK, vi.fn());
        handler.addHook(HOOKS.ON_CELL_CLICK, vi.fn());
        handler.clearHook(HOOKS.ON_CELL_CLICK);
        expect(handler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(false);
    });

    it("clearAllHooks 应清除所有钩子", () => {
        handler.addHook(HOOKS.ON_CELL_CLICK, vi.fn());
        handler.addHook(HOOKS.AFTER_CHANGE, vi.fn());
        handler.clearAllHooks();
        expect(handler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(false);
        expect(handler.hooks.hasHook(HOOKS.AFTER_CHANGE)).toBe(false);
    });

    it("hasHook 应代理到 hooks 实例", () => {
        expect(handler.hasHook(HOOKS.ON_CELL_CLICK)).toBe(false);
        handler.addHook(HOOKS.ON_CELL_CLICK, vi.fn());
        expect(handler.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);
    });

    it("getHookNames 应代理到 hooks 实例", () => {
        handler.addHook("customHook", vi.fn());
        const names = handler.getHookNames();
        expect(names).toContain("customHook");
    });
});

describe("EventHandler - runHooks 上下文绑定", () => {
    let handler: EventHandler;
    let mockSheet: ReturnType<typeof createFullMockSheet>;
    let mockRenderEngine: ReturnType<typeof createFullMockRenderEngine>;
    let mockEditor: ReturnType<typeof createFullMockEditor>;

    beforeEach(() => {
        mockSheet = createFullMockSheet();
        mockRenderEngine = createFullMockRenderEngine();
        mockEditor = createFullMockEditor();
        handler = new EventHandler(mockSheet, mockRenderEngine, mockEditor);
    });

    afterEach(() => {
        handler.destroy();
        const wrap = mockRenderEngine._wrap;
        if (wrap && wrap.parentNode) {
            wrap.parentNode.removeChild(wrap);
        }
    });

    it("runHooks 应使用 setHookContext 设置的 this 上下文", () => {
        const context = { name: "testContext" };
        let receivedThis: any = null;

        handler.setHookContext(context);
        handler.addHook(HOOKS.ON_CELL_CLICK, function (this: any) {
            receivedThis = this;
        });
        handler.runHooks(HOOKS.ON_CELL_CLICK);

        expect(receivedThis).toBe(context);
    });

    it("runHooksUntil 应使用 setHookContext 设置的 this 上下文", () => {
        const context = { name: "testContext" };
        let receivedThis: any = null;

        handler.setHookContext(context);
        handler.addHook(HOOKS.BEFORE_CHANGE, function (this: any) {
            receivedThis = this;
            return false;
        });
        handler.runHooksUntil(HOOKS.BEFORE_CHANGE);

        expect(receivedThis).toBe(context);
    });

    it("runHooks 应正确传递参数", () => {
        const callback = vi.fn();
        handler.addHook(HOOKS.ON_CELL_CLICK, callback);
        handler.runHooks(HOOKS.ON_CELL_CLICK, 10, 20);
        expect(callback).toHaveBeenCalledWith(10, 20);
    });

    it("runHooksUntil 应返回第一个非 undefined 的值", () => {
        handler.addHook(HOOKS.BEFORE_CHANGE, () => undefined);
        handler.addHook(HOOKS.BEFORE_CHANGE, () => false);
        handler.addHook(HOOKS.BEFORE_CHANGE, () => true);

        const result = handler.runHooksUntil(HOOKS.BEFORE_CHANGE);
        expect(result).toBe(false);
    });

    it("runHooksUntil 全部返回 undefined 时应返回 undefined", () => {
        handler.addHook(HOOKS.BEFORE_CHANGE, () => undefined);
        handler.addHook(HOOKS.BEFORE_CHANGE, () => undefined);

        const result = handler.runHooksUntil(HOOKS.BEFORE_CHANGE);
        expect(result).toBeUndefined();
    });
});

describe("EventHandler - 事件委托分发", () => {
    let handler: EventHandler;
    let mockSheet: ReturnType<typeof createFullMockSheet>;
    let mockRenderEngine: ReturnType<typeof createFullMockRenderEngine>;
    let mockEditor: ReturnType<typeof createFullMockEditor>;

    beforeEach(() => {
        mockSheet = createFullMockSheet();
        mockRenderEngine = createFullMockRenderEngine();
        mockEditor = createFullMockEditor();
        handler = new EventHandler(mockSheet, mockRenderEngine, mockEditor);
    });

    afterEach(() => {
        handler.destroy();
        const wrap = mockRenderEngine._wrap;
        if (wrap && wrap.parentNode) {
            wrap.parentNode.removeChild(wrap);
        }
    });

    it("自定义策略事件处理函数应注册到 DOM 目标", () => {
        const clickHandler = vi.fn();
        const strategy = createMockStrategy("clickStrategy", {
            eventHandlers: { "canvas:customclick": clickHandler },
        });
        handler.addStrategy("clickStrategy", strategy);

        const canvas = mockRenderEngine.canvas;
        canvas.dispatchEvent(new CustomEvent("customclick"));
        expect(clickHandler).toHaveBeenCalled();
    });

    it("事件触发时应按优先级顺序调用策略处理函数", () => {
        const order: string[] = [];
        const strategyHigh = createMockStrategy("high", {
            priority: 10,
            eventHandlers: {
                "canvas:customdown": () => order.push("high"),
            },
        });
        const strategyLow = createMockStrategy("low", {
            priority: 1,
            eventHandlers: {
                "canvas:customdown": () => order.push("low"),
            },
        });

        handler.addStrategy("low", strategyLow);
        handler.addStrategy("high", strategyHigh);

        const canvas = mockRenderEngine.canvas;
        canvas.dispatchEvent(new CustomEvent("customdown"));

        expect(order).toEqual(["high", "low"]);
    });

    it("处理函数返回 false 应中断后续策略执行（短路模式）", () => {
        const fnAfter = vi.fn();
        const strategyBlock = createMockStrategy("block", {
            priority: 10,
            eventHandlers: {
                "canvas:customup": () => false,
            },
        });
        const strategyAfter = createMockStrategy("after", {
            priority: 1,
            eventHandlers: {
                "canvas:customup": fnAfter,
            },
        });

        handler.addStrategy("block", strategyBlock);
        handler.addStrategy("after", strategyAfter);

        const canvas = mockRenderEngine.canvas;
        canvas.dispatchEvent(new CustomEvent("customup"));

        expect(fnAfter).not.toHaveBeenCalled();
    });

    it("禁用的策略应被跳过", () => {
        const fnDisabled = vi.fn();
        const strategyDisabled = createMockStrategy("disabled", {
            priority: 10,
            eventHandlers: {
                "canvas:customdbl": fnDisabled,
            },
        });

        handler.addStrategy("disabled", strategyDisabled);
        handler.disableStrategy("disabled");

        const canvas = mockRenderEngine.canvas;
        canvas.dispatchEvent(new CustomEvent("customdbl"));

        expect(fnDisabled).not.toHaveBeenCalled();
    });

    it("removeStrategy 后事件监听器应被移除", () => {
        const fn = vi.fn();
        const strategy = createMockStrategy("temp", {
            eventHandlers: { "canvas:customwheel": fn },
        });

        handler.addStrategy("temp", strategy);
        handler.removeStrategy("temp");

        const canvas = mockRenderEngine.canvas;
        canvas.dispatchEvent(new CustomEvent("customwheel"));

        expect(fn).not.toHaveBeenCalled();
    });

    it("document 目标事件应正确注册", () => {
        const fn = vi.fn();
        const strategy = createMockStrategy("docStrategy", {
            eventHandlers: { "document:customdoc": fn },
        });
        handler.addStrategy("docStrategy", strategy);

        document.dispatchEvent(new CustomEvent("customdoc"));
        expect(fn).toHaveBeenCalled();
    });

    it("window 目标事件应正确注册", () => {
        const fn = vi.fn();
        const strategy = createMockStrategy("winStrategy", {
            eventHandlers: { "window:customwin": fn },
        });
        handler.addStrategy("winStrategy", strategy);

        window.dispatchEvent(new CustomEvent("customwin"));
        expect(fn).toHaveBeenCalled();
    });
});

describe("EventHandler - 生命周期管理", () => {
    let handler: EventHandler;
    let mockSheet: ReturnType<typeof createFullMockSheet>;
    let mockRenderEngine: ReturnType<typeof createFullMockRenderEngine>;
    let mockEditor: ReturnType<typeof createFullMockEditor>;

    beforeEach(() => {
        mockSheet = createFullMockSheet();
        mockRenderEngine = createFullMockRenderEngine();
        mockEditor = createFullMockEditor();
        handler = new EventHandler(mockSheet, mockRenderEngine, mockEditor);
    });

    afterEach(() => {
        const wrap = mockRenderEngine._wrap;
        if (wrap && wrap.parentNode) {
            wrap.parentNode.removeChild(wrap);
        }
    });

    it("destroy 应销毁所有策略", () => {
        const strategy = createMockStrategy("custom", {
            eventHandlers: { "canvas:customclick": vi.fn() },
        });
        handler.addStrategy("custom", strategy);
        handler.destroy();
        expect(strategy.destroy).toHaveBeenCalled();
    });

    it("destroy 应清空策略映射表", () => {
        handler.destroy();
        expect(handler.strategies.size).toBe(0);
    });

    it("destroy 应清空钩子系统", () => {
        handler.addHook(HOOKS.ON_CELL_CLICK, vi.fn());
        handler.destroy();
        expect(handler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(false);
    });

    it("destroy 应置空核心引用", () => {
        handler.destroy();
        expect(handler.sheet).toBeNull();
        expect(handler.renderEngine).toBeNull();
        expect(handler.editor).toBeNull();
        expect(handler.canvas).toBeNull();
        expect(handler.wrap).toBeNull();
    });

    it("destroy 后 DOM 事件监听器应被移除", () => {
        const fn = vi.fn();
        const strategy = createMockStrategy("events", {
            eventHandlers: { "canvas:customev": fn },
        });
        handler.addStrategy("events", strategy);
        handler.destroy();

        const canvas = mockRenderEngine.canvas;
        canvas.dispatchEvent(new CustomEvent("customev"));
        expect(fn).not.toHaveBeenCalled();
    });

    it("destroy 幂等 — 多次调用不报错", () => {
        handler.destroy();
        expect(() => handler.destroy()).not.toThrow();
    });
});

describe("EventHandler - render 方法", () => {
    let handler: EventHandler;
    let mockSheet: ReturnType<typeof createFullMockSheet>;
    let mockRenderEngine: ReturnType<typeof createFullMockRenderEngine>;
    let mockEditor: ReturnType<typeof createFullMockEditor>;

    beforeEach(() => {
        mockSheet = createFullMockSheet();
        mockRenderEngine = createFullMockRenderEngine();
        mockEditor = createFullMockEditor();
        handler = new EventHandler(mockSheet, mockRenderEngine, mockEditor);
    });

    afterEach(() => {
        handler.destroy();
        const wrap = mockRenderEngine._wrap;
        if (wrap && wrap.parentNode) {
            wrap.parentNode.removeChild(wrap);
        }
    });

    it("render 应调用 renderEngine.render", () => {
        handler.render();
        expect(mockRenderEngine.render).toHaveBeenCalledWith(mockSheet);
    });

    it("destroy 后 render 不应报错", () => {
        handler.destroy();
        expect(() => handler.render()).not.toThrow();
    });
});

describe("EventHandler - 编辑器事件订阅", () => {
    let handler: EventHandler;
    let mockSheet: ReturnType<typeof createFullMockSheet>;
    let mockRenderEngine: ReturnType<typeof createFullMockRenderEngine>;
    let mockEditor: ReturnType<typeof createFullMockEditor>;

    beforeEach(() => {
        mockSheet = createFullMockSheet();
        mockRenderEngine = createFullMockRenderEngine();
        mockEditor = createFullMockEditor();
        handler = new EventHandler(mockSheet, mockRenderEngine, mockEditor);
    });

    afterEach(() => {
        handler.destroy();
        const wrap = mockRenderEngine._wrap;
        if (wrap && wrap.parentNode) {
            wrap.parentNode.removeChild(wrap);
        }
    });

    it("构造时应通过 EventBus 订阅编辑器事件", () => {
        expect(mockSheet.bus.on).toHaveBeenCalled();
    });

    it("sheet.bus 为 null 时不应报错", () => {
        const sheetNoBus = { ...createFullMockSheet(), bus: null };
        expect(() => {
            const h = new EventHandler(sheetNoBus, mockRenderEngine, mockEditor);
            h.destroy();
        }).not.toThrow();
    });
});