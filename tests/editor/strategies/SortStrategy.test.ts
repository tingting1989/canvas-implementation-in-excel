import { describe, it, expect, vi, beforeEach } from "vitest";
import { SortStrategy } from "@/editor/strategies/SortStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";
import { DELEGATE_KEYS } from "@/constants/eventNames.js";
import { HIT_TYPE } from "@/constants/hitType.js";

describe("SortStrategy", () => {
    let mockHandler: any;
    let mockPlugin: any;

    beforeEach(() => {
        mockPlugin = {
            isColumnSortable: vi.fn(() => true),
            sort: vi.fn(),
            getSortState: vi.fn(() => null),
        };

        mockHandler = {
            sheet: {
                rowColManager: { rowCount: 100, realColCount: 26 },
            },
            viewport: {
                hitTest: vi.fn(() => null),
            },
            render: vi.fn(),
            runHooks: vi.fn(),
        };
    });

    describe("构造函数和属性", () => {
        it("SS-01: 应正确设置优先级", () => {
            const strategy = new SortStrategy(mockHandler, mockPlugin);
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.DATA_SORT);
        });

        it("SS-02: 应正确设置名称", () => {
            const strategy = new SortStrategy(mockHandler, mockPlugin);
            expect(strategy.name).toBe("sort");
        });

        it("SS-03: 默认启用", () => {
            const strategy = new SortStrategy(mockHandler, mockPlugin);
            expect(strategy.enabled).toBe(true);
        });

        it("SS-04: 应保存 handler 引用", () => {
            const strategy = new SortStrategy(mockHandler, mockPlugin);
            expect(strategy.handler).toBe(mockHandler);
        });
    });

    describe("getEventHandlers()", () => {
        it("SS-05: 应声明 canvas:mousedown 事件", () => {
            const strategy = new SortStrategy(mockHandler, mockPlugin);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_MOUSEDOWN]).toBeTypeOf("function");
        });

        it("SS-06: 应只声明1个事件", () => {
            const strategy = new SortStrategy(mockHandler, mockPlugin);
            const handlers = strategy.getEventHandlers();
            expect(Object.keys(handlers)).toHaveLength(1);
        });
    });

    describe("init() / destroy()", () => {
        it("SS-07: init 不抛异常", () => {
            const strategy = new SortStrategy(mockHandler, mockPlugin);
            expect(() => strategy.init()).not.toThrow();
        });

        it("SS-08: destroy 不抛异常", () => {
            const strategy = new SortStrategy(mockHandler, mockPlugin);
            expect(() => strategy.destroy()).not.toThrow();
        });
    });

    describe("enable() / disable()", () => {
        it("SS-09: 禁用后 enabled 为 false", () => {
            const strategy = new SortStrategy(mockHandler, mockPlugin);
            strategy.disable();
            expect(strategy.enabled).toBe(false);
        });

        it("SS-10: 禁用后重新启用", () => {
            const strategy = new SortStrategy(mockHandler, mockPlugin);
            strategy.disable();
            strategy.enable();
            expect(strategy.enabled).toBe(true);
        });
    });

    describe("双击排序交互", () => {
        it("SS-11: 单击列头不触发排序", () => {
            mockHandler.viewport.hitTest = vi.fn(() => ({
                type: HIT_TYPE.COL_HEADER,
                index: 0,
            }));

            const strategy = new SortStrategy(mockHandler, mockPlugin);
            const handlers = strategy.getEventHandlers();
            const mouseEvent = new MouseEvent("mousedown", { clientX: 50, clientY: 10 });

            handlers[DELEGATE_KEYS.CANVAS_MOUSEDOWN](mouseEvent);

            expect(mockPlugin.sort).not.toHaveBeenCalled();
        });
    });
});