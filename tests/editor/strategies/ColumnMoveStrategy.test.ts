import { describe, it, expect, vi, beforeEach } from "vitest";
import { ColumnMoveStrategy } from "@/editor/strategies/ColumnMoveStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";
import { DELEGATE_KEYS } from "@/constants/eventNames.js";

describe("ColumnMoveStrategy", () => {
    let mockHandler: any;

    beforeEach(() => {
        mockHandler = {
            sheet: {
                rowColManager: { rowCount: 100, realColCount: 26, moveColumn: vi.fn() },
                selection: { setActive: vi.fn(), setRange: vi.fn() },
            },
            viewport: {
                hitTest: vi.fn(() => null),
                headerHitTest: vi.fn(() => null),
            },
            render: vi.fn(),
            runHooks: vi.fn(),
            canvasContext: { canvas: { getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })), style: {} } },
            renderEngine: { selectionLayer: { setColumnMoveState: vi.fn(), clearColumnMoveState: vi.fn() } },
        };
    });

    describe("构造函数和属性", () => {
        it("CM-01: 应正确设置优先级", () => {
            const strategy = new ColumnMoveStrategy(mockHandler);
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.ROW_COLUMN_MOVE);
        });

        it("CM-02: 默认启用", () => {
            const strategy = new ColumnMoveStrategy(mockHandler);
            expect(strategy.enabled).toBe(true);
        });

        it("CM-03: 应保存 handler 引用", () => {
            const strategy = new ColumnMoveStrategy(mockHandler);
            expect(strategy.handler).toBe(mockHandler);
        });
    });

    describe("getEventHandlers()", () => {
        it("CM-04: 应声明 canvas:mousedown 事件", () => {
            const strategy = new ColumnMoveStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_MOUSEDOWN]).toBeTypeOf("function");
        });

        it("CM-05: 应声明 canvas:mousemove 事件", () => {
            const strategy = new ColumnMoveStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_MOUSEMOVE]).toBeTypeOf("function");
        });

        it("CM-06: 应声明 document:mousemove 事件", () => {
            const strategy = new ColumnMoveStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]).toBeTypeOf("function");
        });

        it("CM-07: 应声明 document:mouseup 事件", () => {
            const strategy = new ColumnMoveStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_MOUSEUP]).toBeTypeOf("function");
        });

        it("CM-08: 应只声明4个事件", () => {
            const strategy = new ColumnMoveStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(Object.keys(handlers)).toHaveLength(4);
        });
    });

    describe("init() / destroy()", () => {
        it("CM-09: init 不抛异常", () => {
            const strategy = new ColumnMoveStrategy(mockHandler);
            expect(() => strategy.init()).not.toThrow();
        });

        it("CM-10: destroy 不抛异常", () => {
            const strategy = new ColumnMoveStrategy(mockHandler);
            expect(() => strategy.destroy()).not.toThrow();
        });

        it("CM-11: destroy 幂等安全", () => {
            const strategy = new ColumnMoveStrategy(mockHandler);
            expect(() => {
                strategy.destroy();
                strategy.destroy();
            }).not.toThrow();
        });
    });

    describe("enable() / disable()", () => {
        it("CM-12: 禁用后 enabled 为 false", () => {
            const strategy = new ColumnMoveStrategy(mockHandler);
            strategy.disable();
            expect(strategy.enabled).toBe(false);
        });
    });
});