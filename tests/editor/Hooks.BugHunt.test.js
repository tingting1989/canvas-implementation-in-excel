import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hooks } from "../../src/editor/Hooks.js";

describe("Hooks - Bug Hunting", () => {
    let hooks;

    beforeEach(() => {
        hooks = new Hooks();
        hooks.init();
    });

    describe("addHookOnce - 一次性钩子边界", () => {
        it("BUG: addHookOnce应只触发一次", () => {
            const cb = vi.fn();
            hooks.addHookOnce("test", cb);

            hooks.runHooks("test", 1);
            hooks.runHooks("test", 2);
            hooks.runHooks("test", 3);

            expect(cb).toHaveBeenCalledOnce();
            expect(cb).toHaveBeenCalledWith(1);
        });

        it("BUG: addHookOnce触发后应从监听器列表移除", () => {
            const cb = vi.fn();
            hooks.addHookOnce("test", cb);

            hooks.runHooks("test");

            const listeners = hooks.getHooks("test");
            expect(listeners).not.toContain(cb);
        });

        it("BUG: 多个addHookOnce应各自只触发一次", () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();

            hooks.addHookOnce("test", cb1);
            hooks.addHookOnce("test", cb2);

            hooks.runHooks("test");
            hooks.runHooks("test");

            expect(cb1).toHaveBeenCalledOnce();
            expect(cb2).toHaveBeenCalledOnce();
        });

        it("BUG: addHookOnce与addHook混合使用应正确工作", () => {
            const onceCb = vi.fn();
            const normalCb = vi.fn();

            hooks.addHookOnce("test", onceCb);
            hooks.addHook("test", normalCb);

            hooks.runHooks("test");
            hooks.runHooks("test");

            expect(onceCb).toHaveBeenCalledOnce();
            expect(normalCb).toHaveBeenCalledTimes(2);
        });
    });

    describe("removeHook - 边界条件", () => {
        it("BUG: 移除不存在的回调不应报错", () => {
            expect(() => hooks.removeHook("test", () => {})).not.toThrow();
        });

        it("BUG: 移除已注册的回调后不应再被触发", () => {
            const cb = vi.fn();
            hooks.addHook("test", cb);
            hooks.removeHook("test", cb);

            hooks.runHooks("test");

            expect(cb).not.toHaveBeenCalled();
        });

        it("BUG: 移除同一回调多次不应影响其他回调", () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            hooks.addHook("test", cb1);
            hooks.addHook("test", cb2);

            hooks.removeHook("test", cb1);
            hooks.removeHook("test", cb1);

            hooks.runHooks("test");

            expect(cb1).not.toHaveBeenCalled();
            expect(cb2).toHaveBeenCalled();
        });
    });

    describe("runHooks - 执行顺序与返回值", () => {
        it("BUG: 回调应按注册顺序执行", () => {
            const order = [];
            hooks.addHook("test", () => order.push(1));
            hooks.addHook("test", () => order.push(2));
            hooks.addHook("test", () => order.push(3));

            hooks.runHooks("test");

            expect(order).toEqual([1, 2, 3]);
        });

        it("BUG: runHooks应返回最后一个回调的返回值", () => {
            hooks.addHook("test", () => "first");
            hooks.addHook("test", () => "second");
            hooks.addHook("test", () => "third");

            const result = hooks.runHooks("test");

            expect(result).toBe("third");
        });

        it("BUG: 无回调时应返回undefined", () => {
            const result = hooks.runHooks("nonexistent");
            expect(result).toBeUndefined();
        });

        it("BUG: 回调抛异常不应阻止后续回调执行", () => {
            const cb = vi.fn();
            hooks.addHook("test", () => { throw new Error("boom"); });
            hooks.addHook("test", cb);

            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            hooks.runHooks("test");
            consoleSpy.mockRestore();

            expect(cb).toHaveBeenCalled();
        });
    });

    describe("runHooksUntil - 拦截机制", () => {
        it("BUG: 应返回第一个非undefined的返回值", () => {
            hooks.addHook("test", () => undefined);
            hooks.addHook("test", () => "intercepted");
            hooks.addHook("test", () => "should not reach");

            const result = hooks.runHooksUntil("test");

            expect(result).toBe("intercepted");
        });

        it("BUG: 所有回调返回undefined时应返回undefined", () => {
            hooks.addHook("test", () => undefined);
            hooks.addHook("test", () => undefined);

            const result = hooks.runHooksUntil("test");
            expect(result).toBeUndefined();
        });

        it("BUG: 第一个回调拦截后不应执行后续回调", () => {
            const cb2 = vi.fn();
            hooks.addHook("test", () => "stop");
            hooks.addHook("test", cb2);

            hooks.runHooksUntil("test");

            expect(cb2).not.toHaveBeenCalled();
        });
    });

    describe("clearHook / clearAllHooks", () => {
        it("BUG: clearHook后指定钩子应无监听器", () => {
            const cb = vi.fn();
            hooks.addHook("test", cb);

            hooks.clearHook("test");
            hooks.runHooks("test");

            expect(cb).not.toHaveBeenCalled();
        });

        it("BUG: clearAllHooks后所有钩子应无监听器", () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            hooks.addHook("test1", cb1);
            hooks.addHook("test2", cb2);

            hooks.clearAllHooks();
            hooks.runHooks("test1");
            hooks.runHooks("test2");

            expect(cb1).not.toHaveBeenCalled();
            expect(cb2).not.toHaveBeenCalled();
        });

        it("BUG: clearHook不应影响其他钩子", () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            hooks.addHook("test1", cb1);
            hooks.addHook("test2", cb2);

            hooks.clearHook("test1");
            hooks.runHooks("test2");

            expect(cb1).not.toHaveBeenCalled();
            expect(cb2).toHaveBeenCalled();
        });
    });

    describe("hasHook", () => {
        it("BUG: 无监听器时应返回false", () => {
            expect(hooks.hasHook("test")).toBe(false);
        });

        it("BUG: 有监听器时应返回true", () => {
            hooks.addHook("test", () => {});
            expect(hooks.hasHook("test")).toBe(true);
        });

        it("BUG: 所有监听器被移除后应返回false", () => {
            const cb = () => {};
            hooks.addHook("test", cb);
            hooks.removeHook("test", cb);
            expect(hooks.hasHook("test")).toBe(false);
        });
    });
});