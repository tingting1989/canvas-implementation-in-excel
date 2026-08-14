import { describe, it, expect, vi, beforeEach } from "vitest";
import { MouseStrategy } from "@/editor/strategies/MouseStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";
import { DELEGATE_KEYS } from "@/constants/eventNames.js";

describe("MouseStrategy", () => {
    let mockHandler: any;

    beforeEach(() => {
        mockHandler = {
            sheet: {
                selection: {
                    setActive: vi.fn(),
                    setRange: vi.fn(),
                    getRange: vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 })),
                    contains: vi.fn(() => true),
                },
                getMerge: vi.fn(() => null),
                rowColManager: { rowCount: 100, realColCount: 26 },
                bus: { emit: vi.fn() },
            },
            viewport: {
                hitTest: vi.fn(() => null),
            },
            editor: { startEdit: vi.fn() },
            render: vi.fn(),
            runHooks: vi.fn(),
            canvasContext: { canvas: { getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })) } },
        };
    });

    describe("构造函数和属性", () => {
        it("MS-01: 应正确设置优先级", () => {
            const strategy = new MouseStrategy(mockHandler);
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.MOUSE_DEFAULT);
        });

        it("MS-02: 默认启用", () => {
            const strategy = new MouseStrategy(mockHandler);
            expect(strategy.enabled).toBe(true);
        });

        it("MS-03: 应保存 handler 引用", () => {
            const strategy = new MouseStrategy(mockHandler);
            expect(strategy.handler).toBe(mockHandler);
        });
    });

    describe("getEventHandlers()", () => {
        it("MS-04: 应声明 canvas:mousedown 事件", () => {
            const strategy = new MouseStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_MOUSEDOWN]).toBeTypeOf("function");
        });

        it("MS-05: 应声明 canvas:dblclick 事件", () => {
            const strategy = new MouseStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_DBLCLICK]).toBeTypeOf("function");
        });

        it("MS-06: 应声明 document:mousemove 事件", () => {
            const strategy = new MouseStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]).toBeTypeOf("function");
        });

        it("MS-07: 应声明 document:mouseup 事件", () => {
            const strategy = new MouseStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_MOUSEUP]).toBeTypeOf("function");
        });

        it("MS-08: 应只声明4个事件", () => {
            const strategy = new MouseStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(Object.keys(handlers)).toHaveLength(4);
        });
    });

    describe("init() / destroy()", () => {
        it("MS-09: init 不抛异常", () => {
            const strategy = new MouseStrategy(mockHandler);
            expect(() => strategy.init()).not.toThrow();
        });

        it("MS-10: destroy 不抛异常", () => {
            const strategy = new MouseStrategy(mockHandler);
            expect(() => strategy.destroy()).not.toThrow();
        });

        it("MS-11: destroy 幂等安全", () => {
            const strategy = new MouseStrategy(mockHandler);
            expect(() => {
                strategy.destroy();
                strategy.destroy();
            }).not.toThrow();
        });
    });

    describe("enable() / disable()", () => {
        it("MS-12: 禁用后 enabled 为 false", () => {
            const strategy = new MouseStrategy(mockHandler);
            strategy.disable();
            expect(strategy.enabled).toBe(false);
        });

        it("MS-13: 禁用后重新启用", () => {
            const strategy = new MouseStrategy(mockHandler);
            strategy.disable();
            strategy.enable();
            expect(strategy.enabled).toBe(true);
        });
    });
});