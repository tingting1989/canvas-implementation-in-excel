import { describe, it, expect, vi, beforeEach } from "vitest";
import { InteractionStrategy } from "@/editor/strategies/InteractionStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";
import { DELEGATE_KEYS } from "@/constants/eventNames.js";

describe("InteractionStrategy", () => {
    let mockHandler: any;

    beforeEach(() => {
        mockHandler = {
            sheet: {
                selection: {
                    getRange: vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 })),
                    setActive: vi.fn(),
                    setRange: vi.fn(),
                },
                getCellTypeInstance: vi.fn(() => null),
                cellStore: { get: vi.fn(() => null) },
            },
            viewport: {
                hitTest: vi.fn(() => null),
            },
            render: vi.fn(),
            runHooks: vi.fn(),
            canvasContext: { canvas: { getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })) } },
        };
    });

    describe("构造函数和属性", () => {
        it("IS-01: 应正确设置优先级", () => {
            const strategy = new InteractionStrategy(mockHandler);
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.CELL_TYPE_INTERACTION);
        });

        it("IS-02: 默认启用", () => {
            const strategy = new InteractionStrategy(mockHandler);
            expect(strategy.enabled).toBe(true);
        });

        it("IS-03: 应保存 handler 引用", () => {
            const strategy = new InteractionStrategy(mockHandler);
            expect(strategy.handler).toBe(mockHandler);
        });
    });

    describe("getEventHandlers()", () => {
        it("IS-04: 应声明 canvas:mousemove 事件", () => {
            const strategy = new InteractionStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_MOUSEMOVE]).toBeTypeOf("function");
        });

        it("IS-05: 应声明 canvas:click 事件", () => {
            const strategy = new InteractionStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_CLICK]).toBeTypeOf("function");
        });

        it("IS-06: 应声明 canvas:dblclick 事件", () => {
            const strategy = new InteractionStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_DBLCLICK]).toBeTypeOf("function");
        });

        it("IS-07: 应声明 canvas:mouseleave 事件", () => {
            const strategy = new InteractionStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_MOUSELEAVE]).toBeTypeOf("function");
        });

        it("IS-08: 应只声明4个事件", () => {
            const strategy = new InteractionStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(Object.keys(handlers)).toHaveLength(4);
        });
    });

    describe("init() / destroy()", () => {
        it("IS-09: init 不抛异常", () => {
            const strategy = new InteractionStrategy(mockHandler);
            expect(() => strategy.init()).not.toThrow();
        });

        it("IS-10: destroy 不抛异常", () => {
            const strategy = new InteractionStrategy(mockHandler);
            expect(() => strategy.destroy()).not.toThrow();
        });

        it("IS-11: destroy 幂等安全", () => {
            const strategy = new InteractionStrategy(mockHandler);
            expect(() => {
                strategy.destroy();
                strategy.destroy();
            }).not.toThrow();
        });
    });

    describe("enable() / disable()", () => {
        it("IS-12: 禁用后 enabled 为 false", () => {
            const strategy = new InteractionStrategy(mockHandler);
            strategy.disable();
            expect(strategy.enabled).toBe(false);
        });

        it("IS-13: 禁用后重新启用", () => {
            const strategy = new InteractionStrategy(mockHandler);
            strategy.disable();
            strategy.enable();
            expect(strategy.enabled).toBe(true);
        });
    });
});