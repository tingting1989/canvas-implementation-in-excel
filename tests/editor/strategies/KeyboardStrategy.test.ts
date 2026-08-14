import { describe, it, expect, vi, beforeEach } from "vitest";
import { KeyboardStrategy } from "@/editor/strategies/KeyboardStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";
import { DELEGATE_KEYS } from "@/constants/eventNames.js";

describe("KeyboardStrategy", () => {
    let mockHandler: any;

    beforeEach(() => {
        mockHandler = {
            sheet: {
                selection: {
                    activeRow: 0,
                    activeCol: 0,
                    setActive: vi.fn(),
                    setRange: vi.fn(),
                    getRange: vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 })),
                },
                rowColManager: { rowCount: 100, realColCount: 26 },
                getCellTypeInstance: vi.fn(() => null),
            },
            editor: { startEdit: vi.fn(), getActiveEditor: vi.fn(() => null) },
            render: vi.fn(),
            runHooks: vi.fn(),
        };
    });

    describe("构造函数和属性", () => {
        it("KS-01: 应正确设置优先级", () => {
            const strategy = new KeyboardStrategy(mockHandler);
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.KEYBOARD_BASE);
        });

        it("KS-02: 默认启用", () => {
            const strategy = new KeyboardStrategy(mockHandler);
            expect(strategy.enabled).toBe(true);
        });

        it("KS-03: 应保存 handler 引用", () => {
            const strategy = new KeyboardStrategy(mockHandler);
            expect(strategy.handler).toBe(mockHandler);
        });
    });

    describe("getEventHandlers()", () => {
        it("KS-04: 应声明 document:keydown 事件", () => {
            const strategy = new KeyboardStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_KEYDOWN]).toBeTypeOf("function");
        });

        it("KS-05: 应只声明1个事件", () => {
            const strategy = new KeyboardStrategy(mockHandler);
            const handlers = strategy.getEventHandlers();
            expect(Object.keys(handlers)).toHaveLength(1);
        });
    });

    describe("init() / destroy()", () => {
        it("KS-06: init 不抛异常", () => {
            const strategy = new KeyboardStrategy(mockHandler);
            expect(() => strategy.init()).not.toThrow();
        });

        it("KS-07: destroy 不抛异常", () => {
            const strategy = new KeyboardStrategy(mockHandler);
            expect(() => strategy.destroy()).not.toThrow();
        });
    });

    describe("enable() / disable()", () => {
        it("KS-08: 禁用后 enabled 为 false", () => {
            const strategy = new KeyboardStrategy(mockHandler);
            strategy.disable();
            expect(strategy.enabled).toBe(false);
        });

        it("KS-09: 禁用后重新启用", () => {
            const strategy = new KeyboardStrategy(mockHandler);
            strategy.disable();
            strategy.enable();
            expect(strategy.enabled).toBe(true);
        });
    });
});