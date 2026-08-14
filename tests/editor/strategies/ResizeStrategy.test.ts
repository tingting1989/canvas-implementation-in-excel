import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResizeStrategy } from "@/editor/strategies/ResizeStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";
import { DELEGATE_KEYS } from "@/constants/eventNames.js";

describe("ResizeStrategy", () => {
    let mockHandler: any;

    beforeEach(() => {
        mockHandler = {
            sheet: {
                rowColManager: { rowCount: 100, realColCount: 26, getColWidth: vi.fn(() => 80), getRowHeight: vi.fn(() => 28) },
                selection: { setActive: vi.fn(), setRange: vi.fn() },
            },
            viewport: {
                hitTest: vi.fn(() => null),
                headerHitTest: vi.fn(() => null),
                clearResizeLine: vi.fn(),
            },
            render: vi.fn(),
            runHooks: vi.fn(),
            canvasContext: { canvas: { getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })), style: {} } },
            renderEngine: { selectionLayer: { setResizeLine: vi.fn(), clearResizeLine: vi.fn() } },
        };
    });

    describe("构造函数和属性", () => {
        it("RS-01: 应正确设置优先级", () => {
            const strategy = new ResizeStrategy(mockHandler);
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.RESIZE_LAYOUT);
        });

        it("RS-02: 默认启用", () => {
            const strategy = new ResizeStrategy(mockHandler);
            expect(strategy.enabled).toBe(true);
        });

        it("RS-03: 应保存 handler 引用", () => {
            const strategy = new ResizeStrategy(mockHandler);
            expect(strategy.handler).toBe(mockHandler);
        });
    });

    describe("getEventHandlers()", () => {
        it("RS-04: 应声明 canvas:mousedown 事件", () => {
            const strategy = new ResizeStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_MOUSEDOWN]).toBeTypeOf("function");
        });

        it("RS-05: 应声明 document:mousemove 事件", () => {
            const strategy = new ResizeStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]).toBeTypeOf("function");
        });

        it("RS-06: 应声明 document:mouseup 事件", () => {
            const strategy = new ResizeStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_MOUSEUP]).toBeTypeOf("function");
        });

        it("RS-07: 应只声明3个事件", () => {
            const strategy = new ResizeStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(Object.keys(handlers)).toHaveLength(3);
        });
    });

    describe("init() / destroy()", () => {
        it("RS-08: init 不抛异常", () => {
            const strategy = new ResizeStrategy(mockHandler);
            expect(() => strategy.init()).not.toThrow();
        });

        it("RS-09: destroy 不抛异常", () => {
            const strategy = new ResizeStrategy(mockHandler);
            expect(() => strategy.destroy()).not.toThrow();
        });

        it("RS-10: destroy 幂等安全", () => {
            const strategy = new ResizeStrategy(mockHandler);
            expect(() => {
                strategy.destroy();
                strategy.destroy();
            }).not.toThrow();
        });
    });

    describe("enable() / disable()", () => {
        it("RS-11: 禁用后 enabled 为 false", () => {
            const strategy = new ResizeStrategy(mockHandler);
            strategy.disable();
            expect(strategy.enabled).toBe(false);
        });
    });
});