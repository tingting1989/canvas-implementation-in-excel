import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReactiveStore } from "@/state/ReactiveStore";
import { Scheduler } from "@/state/Scheduler";

describe("ReactiveStore", () => {
    describe("构造函数和基础属性", () => {
        it("RS-01: 应正确创建实例", () => {
            const store = new ReactiveStore({ count: 0 });
            expect(store).toBeInstanceOf(ReactiveStore);
        });

        it("RS-02: state 应为代理对象", () => {
            const store = new ReactiveStore({ count: 0 });
            expect(store.state.count).toBe(0);
        });

        it("RS-03: 可接受自定义调度器", () => {
            const scheduler = new Scheduler();
            const store = new ReactiveStore({ count: 0 }, { scheduler });
            expect(store._scheduler).toBe(scheduler);
        });
    });

    describe("响应式 set/get", () => {
        it("RS-04: 修改值应生效", () => {
            const store = new ReactiveStore({ count: 0 });
            store.state.count = 10;
            expect(store.state.count).toBe(10);
        });

        it("RS-05: 相同值赋值不触发 watcher", () => {
            const store = new ReactiveStore({ count: 0 });
            const fn = vi.fn();
            store.watch("count", fn);
            store.state.count = 0;
            store.flush();
            expect(fn).not.toHaveBeenCalled();
        });

        it("RS-06: 嵌套对象应递归代理", () => {
            const store = new ReactiveStore({ user: { name: "Alice" } });
            expect(store.state.user.name).toBe("Alice");
            store.state.user.name = "Bob";
            expect(store.state.user.name).toBe("Bob");
        });
    });

    describe("watch()", () => {
        it("RS-07: 值变化时应触发 watcher", () => {
            const store = new ReactiveStore({ count: 0 });
            const fn = vi.fn();
            store.watch("count", fn);
            store.state.count = 1;
            store.flush();
            expect(fn).toHaveBeenCalled();
        });

        it("RS-08: 返回的函数应取消监听", () => {
            const store = new ReactiveStore({ count: 0 });
            const fn = vi.fn();
            const unwatch = store.watch("count", fn);
            unwatch();
            store.state.count = 1;
            store.flush();
            expect(fn).not.toHaveBeenCalled();
        });

        it("RS-09: 多个 watcher 应都触发", () => {
            const store = new ReactiveStore({ count: 0 });
            const fn1 = vi.fn();
            const fn2 = vi.fn();
            store.watch("count", fn1);
            store.watch("count", fn2);
            store.state.count = 1;
            store.flush();
            expect(fn1).toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();
        });
    });

    describe("_pathsMatch()", () => {
        it("RS-10: 完全相同路径应匹配", () => {
            const store = new ReactiveStore({ a: 0 });
            expect(store._pathsMatch("a.b.c", "a.b.c")).toBe(true);
        });

        it("RS-11: 子路径应匹配父路径", () => {
            const store = new ReactiveStore({ a: 0 });
            expect(store._pathsMatch("a.b.c", "a")).toBe(true);
        });

        it("RS-12: 父路径应匹配子路径", () => {
            const store = new ReactiveStore({ a: 0 });
            expect(store._pathsMatch("a", "a.b.c")).toBe(true);
        });

        it("RS-13: 无关路径不匹配", () => {
            const store = new ReactiveStore({ a: 0 });
            expect(store._pathsMatch("a.b", "c.d")).toBe(false);
        });
    });

    describe("computed()", () => {
        it("RS-14: 应返回计算值", () => {
            const store = new ReactiveStore({ count: 2 } as any);
            store.computed("doubled", (state) => state.count * 2);
            expect(store.state.doubled).toBe(4);
        });

        it("RS-15: 依赖变化时应标记 dirty", () => {
            const store = new ReactiveStore({ count: 2 } as any);
            store.computed("doubled", (state) => state.count * 2);
            store.state.count = 5;
            expect(store.state.doubled).toBe(10);
        });

        it("RS-16: 返回的函数应取消注册", () => {
            const store = new ReactiveStore({ count: 2 } as any);
            const dispose = store.computed("doubled", (state) => state.count * 2);
            dispose();
            expect(store._computeds.has("doubled")).toBe(false);
        });
    });

    describe("batch()", () => {
        it("RS-17: 批量更新应只触发一次", () => {
            const store = new ReactiveStore({ a: 0, b: 0 });
            const fn = vi.fn();
            store.watch("a", fn);
            store.batch(() => {
                store.state.a = 1;
                store.state.a = 2;
            });
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it("RS-18: 嵌套 batch 应正确处理", () => {
            const store = new ReactiveStore({ a: 0, b: 0 });
            const fn = vi.fn();
            store.watch("a", fn);
            store.batch(() => {
                store.state.a = 1;
                store.batch(() => {
                    store.state.b = 2;
                });
            });
            expect(fn).toHaveBeenCalled();
        });

        it("RS-19: batch 中异常不应影响 batchDepth", () => {
            const store = new ReactiveStore({ a: 0 });
            expect(store._batchDepth).toBe(0);
            try {
                store.batch(() => {
                    throw new Error("test");
                });
            } catch {}
            expect(store._batchDepth).toBe(0);
        });
    });

    describe("flush()", () => {
        it("RS-20: 应执行调度器队列", () => {
            const store = new ReactiveStore({ count: 0 });
            const fn = vi.fn();
            store.watch("count", fn);
            store.state.count = 1;
            store.flush();
            expect(fn).toHaveBeenCalled();
        });
    });

    describe("_getValueByPath() / _setValueByPath()", () => {
        it("RS-21: 应按路径取值", () => {
            const store = new ReactiveStore({ a: { b: { c: 42 } } });
            expect(store._getValueByPath(store.state, "a.b.c")).toBe(42);
        });

        it("RS-22: 路径不存在返回 undefined", () => {
            const store = new ReactiveStore({ a: 1 });
            expect(store._getValueByPath(store.state, "x.y.z")).toBeUndefined();
        });

        it("RS-23: 应按路径写入值", () => {
            const obj: any = { a: { b: 0 } };
            const store = new ReactiveStore({ a: 1 });
            store._setValueByPath(obj, "a.b", 99);
            expect(obj.a.b).toBe(99);
        });
    });

    describe("getStateSnapshot()", () => {
        it("RS-24: 应返回深拷贝", () => {
            const store = new ReactiveStore({ a: { b: 1 } });
            const snap = store.getStateSnapshot();
            expect(snap).toEqual({ a: { b: 1 } });
            (snap as any).a.b = 999;
            expect(store.state.a.b).toBe(1);
        });

        it("RS-25: 应刷新 dirty 的 computed", () => {
            const store = new ReactiveStore({ count: 2 } as any);
            store.computed("doubled", (state) => state.count * 2);
            store.state.count = 5;
            const snap = store.getStateSnapshot();
            expect((snap as any).doubled).toBe(10);
        });
    });

    describe("destroy()", () => {
        it("RS-26: 销毁后 watcher 为空", () => {
            const store = new ReactiveStore({ count: 0 });
            store.watch("count", vi.fn());
            store.destroy();
            expect(store._watchers.size).toBe(0);
        });

        it("RS-27: 销毁后 computeds 为空", () => {
            const store = new ReactiveStore({ count: 0 } as any);
            store.computed("doubled", (state) => state.count * 2);
            store.destroy();
            expect(store._computeds.size).toBe(0);
        });

        it("RS-28: 多次 destroy 不抛异常", () => {
            const store = new ReactiveStore({ count: 0 });
            expect(() => { store.destroy(); store.destroy(); }).not.toThrow();
        });
    });
});