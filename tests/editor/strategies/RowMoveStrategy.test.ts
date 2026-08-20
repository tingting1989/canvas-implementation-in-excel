import { describe, it, expect, vi, beforeEach } from "vitest";
import { RowMoveStrategy } from "@/plugins/rowMove/RowMoveStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";
import { DELEGATE_KEYS } from "@/constants/eventNames.js";

describe("RowMoveStrategy", () => {
    let mockHandler: any;

    beforeEach(() => {
        mockHandler = {
            sheet: {
                rowColManager: { rowCount: 100, realColCount: 26, moveRow: vi.fn() },
                selection: { setActive: vi.fn(), setRange: vi.fn() },
            },
            viewport: {
                hitTest: vi.fn(() => null),
                headerHitTest: vi.fn(() => null),
            },
            render: vi.fn(),
            runHooks: vi.fn(),
            canvasContext: { canvas: { getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })), style: {} } },
            renderEngine: { selectionLayer: { setRowMoveState: vi.fn(), clearRowMoveState: vi.fn() } },
        };
    });

    describe("构造函数和属性", () => {
        it("RM-01: 应正确设置优先级", () => {
            const strategy = new RowMoveStrategy(mockHandler);
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.ROW_COLUMN_MOVE);
        });

        it("RM-02: 默认启用", () => {
            const strategy = new RowMoveStrategy(mockHandler);
            expect(strategy.enabled).toBe(true);
        });

        it("RM-03: 应保存 handler 引用", () => {
            const strategy = new RowMoveStrategy(mockHandler);
            expect(strategy.handler).toBe(mockHandler);
        });
    });

    describe("getEventHandlers()", () => {
        it("RM-04: 应声明 canvas:mousedown 事件", () => {
            const strategy = new RowMoveStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_MOUSEDOWN]).toBeTypeOf("function");
        });

        it("RM-05: 应声明 canvas:mousemove 事件", () => {
            const strategy = new RowMoveStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_MOUSEMOVE]).toBeTypeOf("function");
        });

        it("RM-06: 应声明 document:mousemove 事件", () => {
            const strategy = new RowMoveStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]).toBeTypeOf("function");
        });

        it("RM-07: 应声明 document:mouseup 事件", () => {
            const strategy = new RowMoveStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_MOUSEUP]).toBeTypeOf("function");
        });

        it("RM-08: 应只声明4个事件", () => {
            const strategy = new RowMoveStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(Object.keys(handlers)).toHaveLength(4);
        });
    });

    describe("init() / destroy()", () => {
        it("RM-09: init 不抛异常", () => {
            const strategy = new RowMoveStrategy(mockHandler);
            expect(() => strategy.init()).not.toThrow();
        });

        it("RM-10: destroy 不抛异常", () => {
            const strategy = new RowMoveStrategy(mockHandler);
            expect(() => strategy.destroy()).not.toThrow();
        });

        it("RM-11: destroy 幂等安全", () => {
            const strategy = new RowMoveStrategy(mockHandler);
            expect(() => {
                strategy.destroy();
                strategy.destroy();
            }).not.toThrow();
        });
    });

    describe("enable() / disable()", () => {
        it("RM-12: 禁用后 enabled 为 false", () => {
            const strategy = new RowMoveStrategy(mockHandler);
            strategy.disable();
            expect(strategy.enabled).toBe(false);
        });
    });
});