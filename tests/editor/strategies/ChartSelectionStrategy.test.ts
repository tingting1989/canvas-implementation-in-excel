import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChartSelectionStrategy } from "@/plugins/chart/ChartSelectionStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";
import { DELEGATE_KEYS } from "@/constants/eventNames.js";

describe("ChartSelectionStrategy", () => {
    let mockHandler: any;

    beforeEach(() => {
        mockHandler = {
            sheet: {
                chartManager: {
                    getChart: vi.fn(() => null),
                    getCharts: vi.fn(() => []),
                },
            },
            viewport: {
                hitTest: vi.fn(() => null),
                chartLayer: { selectedChartId: null },
                invalidateAll: vi.fn(),
            },
            render: vi.fn(),
            runHooks: vi.fn(),
            canvasContext: { canvas: { getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })), style: {} } },
        };
    });

    describe("构造函数和属性", () => {
        it("CS-01: 应正确设置优先级", () => {
            const strategy = new ChartSelectionStrategy(mockHandler);
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.CHART_INTERACTION);
        });

        it("CS-02: 默认启用", () => {
            const strategy = new ChartSelectionStrategy(mockHandler);
            expect(strategy.enabled).toBe(true);
        });

        it("CS-03: 应保存 handler 引用", () => {
            const strategy = new ChartSelectionStrategy(mockHandler);
            expect(strategy.handler).toBe(mockHandler);
        });
    });

    describe("getEventHandlers()", () => {
        it("CS-04: 应声明 canvas:mousedown 事件", () => {
            const strategy = new ChartSelectionStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_MOUSEDOWN]).toBeTypeOf("function");
        });

        it("CS-05: 应声明 canvas:mousemove 事件", () => {
            const strategy = new ChartSelectionStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_MOUSEMOVE]).toBeTypeOf("function");
        });

        it("CS-06: 应声明 document:mousemove 事件", () => {
            const strategy = new ChartSelectionStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]).toBeTypeOf("function");
        });

        it("CS-07: 应声明 document:mouseup 事件", () => {
            const strategy = new ChartSelectionStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_MOUSEUP]).toBeTypeOf("function");
        });

        it("CS-08: 应声明 document:keydown 事件", () => {
            const strategy = new ChartSelectionStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_KEYDOWN]).toBeTypeOf("function");
        });

        it("CS-09: 应只声明5个事件", () => {
            const strategy = new ChartSelectionStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(Object.keys(handlers)).toHaveLength(5);
        });
    });

    describe("init() / destroy()", () => {
        it("CS-10: init 不抛异常", () => {
            const strategy = new ChartSelectionStrategy(mockHandler);
            expect(() => strategy.init()).not.toThrow();
        });

        it("CS-11: destroy 不抛异常", () => {
            const strategy = new ChartSelectionStrategy(mockHandler);
            expect(() => strategy.destroy()).not.toThrow();
        });

        it("CS-12: destroy 幂等安全", () => {
            const strategy = new ChartSelectionStrategy(mockHandler);
            expect(() => {
                strategy.destroy();
                strategy.destroy();
            }).not.toThrow();
        });
    });

    describe("enable() / disable()", () => {
        it("CS-13: 禁用后 enabled 为 false", () => {
            const strategy = new ChartSelectionStrategy(mockHandler);
            strategy.disable();
            expect(strategy.enabled).toBe(false);
        });
    });
});