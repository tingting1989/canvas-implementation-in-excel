import { describe, it, expect, vi } from "vitest";
import { EventStrategy } from "@/editor/strategies/EventStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";

describe("EventStrategy", () => {
    function createMockHandler() {
        return {
            sheet: {},
            viewport: {},
            render: vi.fn(),
            runHooks: vi.fn(),
        };
    }

    describe("构造函数和基础属性", () => {
        it("ES-01: 应正确保存 handler 引用", () => {
            const handler = createMockHandler();
            const strategy = new EventStrategy(handler);
            expect(strategy.handler).toBe(handler);
        });

        it("ES-02: 默认启用状态为 true", () => {
            const strategy = new EventStrategy(createMockHandler());
            expect(strategy.enabled).toBe(true);
        });

        it("ES-03: 默认优先级为 0", () => {
            const strategy = new EventStrategy(createMockHandler());
            expect(strategy.priority).toBe(0);
        });
    });

    describe("enable() / disable()", () => {
        it("ES-04: disable() 应将 enabled 设为 false", () => {
            const strategy = new EventStrategy(createMockHandler());
            strategy.disable();
            expect(strategy.enabled).toBe(false);
        });

        it("ES-05: enable() 应将 enabled 设为 true", () => {
            const strategy = new EventStrategy(createMockHandler());
            strategy.disable();
            strategy.enable();
            expect(strategy.enabled).toBe(true);
        });

        it("ES-06: enable/disable 可多次切换", () => {
            const strategy = new EventStrategy(createMockHandler());
            strategy.disable();
            strategy.enable();
            strategy.disable();
            expect(strategy.enabled).toBe(false);
            strategy.enable();
            expect(strategy.enabled).toBe(true);
        });
    });

    describe("getEventHandlers()", () => {
        it("ES-07: 基类返回空对象", () => {
            const strategy = new EventStrategy(createMockHandler());
            expect(strategy.getEventHandlers()).toEqual({});
        });
    });

    describe("init() / destroy()", () => {
        it("ES-08: 基类 init 不抛异常", () => {
            const strategy = new EventStrategy(createMockHandler());
            expect(() => strategy.init()).not.toThrow();
        });

        it("ES-09: 基类 destroy 不抛异常", () => {
            const strategy = new EventStrategy(createMockHandler());
            expect(() => strategy.destroy()).not.toThrow();
        });
    });

    describe("子类继承", () => {
        it("ES-10: 子类可覆盖 priority", () => {
            class TestStrategy extends EventStrategy {
                priority = STRATEGY_PRIORITY.MOUSE_DEFAULT;
            }
            const strategy = new TestStrategy(createMockHandler());
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.MOUSE_DEFAULT);
        });

        it("ES-11: 子类可覆盖 getEventHandlers", () => {
            const handler = vi.fn();
            class TestStrategy extends EventStrategy {
                getEventHandlers() {
                    return { "canvas:click": handler };
                }
            }
            const strategy = new TestStrategy(createMockHandler());
            const handlers = strategy.getEventHandlers();
            expect(handlers["canvas:click"]).toBe(handler);
        });

        it("ES-12: 子类可覆盖 init/destroy", () => {
            const initFn = vi.fn();
            const destroyFn = vi.fn();
            class TestStrategy extends EventStrategy {
                init() { initFn(); }
                destroy() { destroyFn(); }
            }
            const strategy = new TestStrategy(createMockHandler());
            strategy.init();
            strategy.destroy();
            expect(initFn).toHaveBeenCalledTimes(1);
            expect(destroyFn).toHaveBeenCalledTimes(1);
        });
    });
});