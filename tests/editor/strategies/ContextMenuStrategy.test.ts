import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContextMenuStrategy } from "@/editor/strategies/ContextMenuStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";
import { DELEGATE_KEYS } from "@/constants/eventNames.js";

describe("ContextMenuStrategy", () => {
    let mockHandler: any;

    beforeEach(() => {
        mockHandler = {
            sheet: {
                rowColManager: { rowCount: 100, colCount: 26 },
                selection: {
                    getRange: vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 })),
                    contains: vi.fn(() => true),
                    setActive: vi.fn(),
                    setRange: vi.fn(),
                },
                getMerge: vi.fn(() => null),
                readOnly: false,
            },
            viewport: {
                hitTest: vi.fn(() => null),
            },
            render: vi.fn(),
            runHooks: vi.fn(),
        };
    });

    afterEach(() => {
        const menuEl = document.querySelector(".ctx-menu");
        if (menuEl) menuEl.remove();
    });

    describe("构造函数和属性", () => {
        it("CM-01: 应正确设置优先级", () => {
            const strategy = new ContextMenuStrategy(mockHandler);
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.POPUP_UI);
        });

        it("CM-02: 默认启用", () => {
            const strategy = new ContextMenuStrategy(mockHandler);
            expect(strategy.enabled).toBe(true);
        });

        it("CM-03: 应保存 handler 引用", () => {
            const strategy = new ContextMenuStrategy(mockHandler);
            expect(strategy.handler).toBe(mockHandler);
        });
    });

    describe("getEventHandlers()", () => {
        it("CM-04: 应声明 canvas:contextmenu 事件", () => {
            const strategy = new ContextMenuStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_CONTEXTMENU]).toBeTypeOf("function");
        });

        it("CM-05: 应声明 document:mousedown 事件（点击外部关闭）", () => {
            const strategy = new ContextMenuStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_MOUSEDOWN]).toBeTypeOf("function");
        });

        it("CM-06: 应只声明2个事件", () => {
            const strategy = new ContextMenuStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(Object.keys(handlers)).toHaveLength(2);
        });
    });

    describe("init() / destroy()", () => {
        it("CM-07: init 创建菜单 DOM", () => {
            const strategy = new ContextMenuStrategy(mockHandler);
            strategy.init();
            expect(document.querySelectorAll(".ctx-menu").length).toBe(1);
        });

        it("CM-08: destroy 移除菜单 DOM", () => {
            const strategy = new ContextMenuStrategy(mockHandler);
            strategy.init();
            strategy.destroy();
            expect(document.querySelectorAll(".ctx-menu").length).toBe(0);
        });

        it("CM-09: destroy 幂等安全", () => {
            const strategy = new ContextMenuStrategy(mockHandler);
            strategy.init();
            expect(() => {
                strategy.destroy();
                strategy.destroy();
            }).not.toThrow();
        });

        it("CM-10: 未初始化时 destroy 安全", () => {
            const strategy = new ContextMenuStrategy(mockHandler);
            expect(() => strategy.destroy()).not.toThrow();
        });
    });

    describe("enable() / disable()", () => {
        it("CM-11: 禁用后 enabled 为 false", () => {
            const strategy = new ContextMenuStrategy(mockHandler);
            strategy.disable();
            expect(strategy.enabled).toBe(false);
        });
    });
});