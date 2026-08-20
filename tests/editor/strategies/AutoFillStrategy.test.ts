import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoFillStrategy } from "@/plugins/autoFill/AutoFillStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";
import { DELEGATE_KEYS } from "@/constants/eventNames.js";

describe("AutoFillStrategy", () => {
    let mockHandler: any;

    beforeEach(() => {
        mockHandler = {
            sheet: {
                selection: {
                    getRange: vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 })),
                    setActive: vi.fn(),
                    setRange: vi.fn(),
                },
                rowColManager: { rowCount: 100, realColCount: 26 },
                getCellTypeInstance: vi.fn(() => null),
                cellStore: { get: vi.fn(() => null) },
                setCell: vi.fn(),
                beginBatch: vi.fn(),
                endBatch: vi.fn(),
            },
            viewport: {
                hitTest: vi.fn(() => null),
            },
            render: vi.fn(),
            runHooks: vi.fn(),
            canvasContext: { canvas: { getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })), style: {} } },
            renderEngine: { selectionLayer: { setAutoFillState: vi.fn(), clearAutoFillState: vi.fn() } },
        };
    });

    describe("构造函数和属性", () => {
        it("AF-01: 应正确设置优先级", () => {
            const strategy = new AutoFillStrategy(mockHandler);
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.AUTO_FILL);
        });

        it("AF-02: 默认启用", () => {
            const strategy = new AutoFillStrategy(mockHandler);
            expect(strategy.enabled).toBe(true);
        });

        it("AF-03: 应保存 handler 引用", () => {
            const strategy = new AutoFillStrategy(mockHandler);
            expect(strategy.handler).toBe(mockHandler);
        });
    });

    describe("getEventHandlers()", () => {
        it("AF-04: 应声明 canvas:mousedown 事件", () => {
            const strategy = new AutoFillStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_MOUSEDOWN]).toBeTypeOf("function");
        });

        it("AF-05: 应声明 canvas:mousemove 事件", () => {
            const strategy = new AutoFillStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.CANVAS_MOUSEMOVE]).toBeTypeOf("function");
        });

        it("AF-06: 应声明 document:mousemove 事件", () => {
            const strategy = new AutoFillStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]).toBeTypeOf("function");
        });

        it("AF-07: 应声明 document:mouseup 事件", () => {
            const strategy = new AutoFillStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_MOUSEUP]).toBeTypeOf("function");
        });

        it("AF-08: 应只声明4个事件", () => {
            const strategy = new AutoFillStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(Object.keys(handlers)).toHaveLength(4);
        });
    });

    describe("init() / destroy()", () => {
        it("AF-09: init 不抛异常", () => {
            const strategy = new AutoFillStrategy(mockHandler);
            expect(() => strategy.init()).not.toThrow();
        });

        it("AF-10: destroy 不抛异常", () => {
            const strategy = new AutoFillStrategy(mockHandler);
            expect(() => strategy.destroy()).not.toThrow();
        });

        it("AF-11: destroy 幂等安全", () => {
            const strategy = new AutoFillStrategy(mockHandler);
            expect(() => {
                strategy.destroy();
                strategy.destroy();
            }).not.toThrow();
        });
    });

    describe("enable() / disable()", () => {
        it("AF-12: 禁用后 enabled 为 false", () => {
            const strategy = new AutoFillStrategy(mockHandler);
            strategy.disable();
            expect(strategy.enabled).toBe(false);
        });
    });
});