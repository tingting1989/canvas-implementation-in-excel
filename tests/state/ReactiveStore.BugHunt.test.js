import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReactiveStore, Scheduler } from "../../src/state/ReactiveStore.js";

describe("ReactiveStore - Bug Hunting", () => {
    describe("Scheduler - 竞态与边界条件", () => {
        it("BUG: flush期间新加入的job不应在当前flush中执行", () => {
            const scheduler = new Scheduler();
            const order = [];

            scheduler.queueJob({
                id: 1,
                run: () => {
                    order.push("job1");
                    scheduler.queueJob({ id: 2, run: () => order.push("job2") });
                },
            });

            scheduler.flush();

            expect(order).toEqual(["job1"]);
            scheduler.flush();
            expect(order).toEqual(["job1", "job2"]);
        });

        it("BUG: cancel后queueJob不应执行已取消的job", () => {
            const scheduler = new Scheduler();
            const fn = vi.fn();

            scheduler.queueJob({ id: 1, run: fn });
            scheduler.cancel();
            scheduler.flush();

            expect(fn).not.toHaveBeenCalled();
        });

        it("BUG: 重复id的job不应重复执行", () => {
            const scheduler = new Scheduler();
            const fn = vi.fn();

            scheduler.queueJob({ id: "dup", run: fn });
            scheduler.queueJob({ id: "dup", run: fn });
            scheduler.queueJob({ id: "dup", run: fn });

            scheduler.flush();
            expect(fn).toHaveBeenCalledOnce();
        });

        it("BUG: job执行出错不应阻止后续job执行", () => {
            const scheduler = new Scheduler();
            const fn1 = vi.fn(() => { throw new Error("boom"); });
            const fn2 = vi.fn();
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

            scheduler.queueJob({ id: 1, run: fn1 });
            scheduler.queueJob({ id: 2, run: fn2 });

            scheduler.flush();

            expect(fn1).toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe("ReactiveStore - watch/unwatch 内存泄漏", () => {
        it("BUG: unwatch后watcher不应再被触发", () => {
            const store = new ReactiveStore({ count: 0 });
            const cb = vi.fn();
            const unwatch = store.watch("count", cb);

            unwatch();
            store.state.count = 5;
            store.flush();

            expect(cb).not.toHaveBeenCalled();
        });

        it("BUG: 多次unwatch不应报错", () => {
            const store = new ReactiveStore({ count: 0 });
            const unwatch = store.watch("count", vi.fn());

            unwatch();
            expect(() => unwatch()).not.toThrow();
        });

        it("BUG: destroy后所有watcher应失效", () => {
            const store = new ReactiveStore({ count: 0 });
            const cb = vi.fn();
            store.watch("count", cb);

            store.destroy();
            store.state.count = 5;
            store.flush();

            expect(cb).not.toHaveBeenCalled();
        });

        it("BUG: watch嵌套路径时子属性变化应触发", () => {
            const store = new ReactiveStore({ config: { theme: { color: "blue" } } });
            const cb = vi.fn();
            store.watch("config", cb);

            store.state.config.theme.color = "red";
            store.flush();

            expect(cb).toHaveBeenCalled();
        });
    });

    describe("ReactiveStore - batch一致性", () => {
        it("BUG: batch中多次修改同一属性应只触发一次watcher", () => {
            const store = new ReactiveStore({ count: 0 });
            const cb = vi.fn();
            store.watch("count", cb);

            store.batch(() => {
                store.state.count = 1;
                store.state.count = 2;
                store.state.count = 3;
            });
            store.flush();

            expect(cb).toHaveBeenCalledOnce();
        });

        it("BUG: batch中修改多个属性应分别触发对应watcher", () => {
            const store = new ReactiveStore({ a: 0, b: 0 });
            const cbA = vi.fn();
            const cbB = vi.fn();
            store.watch("a", cbA);
            store.watch("b", cbB);

            store.batch(() => {
                store.state.a = 1;
                store.state.b = 2;
            });
            store.flush();

            expect(cbA).toHaveBeenCalledOnce();
            expect(cbB).toHaveBeenCalledOnce();
        });

        it("BUG: 嵌套batch应在外层完成时才触发watcher", () => {
            const store = new ReactiveStore({ a: 0 });
            const cb = vi.fn();
            store.watch("a", cb);

            store.batch(() => {
                store.state.a = 1;
                store.batch(() => {
                    store.state.a = 2;
                });
                expect(cb).not.toHaveBeenCalled();
            });
            store.flush();

            expect(cb).toHaveBeenCalled();
        });

        it("BUG: batch中异常不应导致watcher永久不触发", () => {
            const store = new ReactiveStore({ a: 0 });
            const cb = vi.fn();
            store.watch("a", cb);

            try {
                store.batch(() => {
                    store.state.a = 1;
                    throw new Error("boom");
                });
            } catch (e) {}

            store.state.a = 2;
            store.flush();

            expect(cb).toHaveBeenCalled();
        });
    });

    describe("ReactiveStore - computed缓存一致性", () => {
        it("BUG: computed依赖变化后应重新计算", () => {
            const store = new ReactiveStore({ a: 1, b: 2 });
            store.computed("sum", (s) => s.a + s.b);

            expect(store.state.sum).toBe(3);
            store.state.a = 10;
            store.flush();
            expect(store.state.sum).toBe(12);
        });

        it("BUG: computed依赖链应正确传播", () => {
            const store = new ReactiveStore({ x: 1 });
            store.computed("doubled", (s) => s.x * 2);
            store.computed("quadrupled", (s) => s.doubled * 2);

            expect(store.state.quadrupled).toBe(4);
            store.state.x = 3;
            store.flush();
            expect(store.state.quadrupled).toBe(12);
        });

        it("BUG: uncompute后computed不应再更新", () => {
            const store = new ReactiveStore({ a: 1 });
            const uncompute = store.computed("doubled", (s) => s.a * 2);

            expect(store.state.doubled).toBe(2);
            uncompute();

            store.state.a = 5;
            store.flush();

            expect(store._computeds.has("doubled")).toBe(false);
        });

        it("BUG: computed值在snapshot中应正确反映", () => {
            const store = new ReactiveStore({ a: 1, b: 2 });
            store.computed("sum", (s) => s.a + s.b);

            store.state.a = 10;
            store.flush();

            const snapshot = store.getStateSnapshot();
            expect(snapshot.sum).toBe(12);
        });
    });

    describe("ReactiveStore - Proxy陷阱", () => {
        it("BUG: 设置相同值不应触发watcher", () => {
            const store = new ReactiveStore({ count: 5 });
            const cb = vi.fn();
            store.watch("count", cb);

            store.state.count = 5;
            store.flush();

            expect(cb).not.toHaveBeenCalled();
        });

        it("BUG: 设置NaN值不应无限触发watcher", () => {
            const store = new ReactiveStore({ val: 0 });
            const cb = vi.fn();
            store.watch("val", cb);

            store.state.val = NaN;
            store.flush();

            expect(cb).toHaveBeenCalled();
        });

        it("BUG: 对象引用替换应触发watcher", () => {
            const store = new ReactiveStore({ config: { color: "blue" } });
            const cb = vi.fn();
            store.watch("config", cb);

            store.state.config = { color: "red" };
            store.flush();

            expect(cb).toHaveBeenCalled();
        });

        it("BUG: 数组push应触发watcher", () => {
            const store = new ReactiveStore({ items: [1, 2] });
            const cb = vi.fn();
            store.watch("items", cb);

            store.state.items.push(3);
            store.flush();

            expect(cb).toHaveBeenCalled();
        });

        it("BUG: 深层嵌套属性修改应触发父路径watcher", () => {
            const store = new ReactiveStore({
                level1: { level2: { level3: "deep" } },
            });
            const cb = vi.fn();
            store.watch("level1", cb);

            store.state.level1.level2.level3 = "changed";
            store.flush();

            expect(cb).toHaveBeenCalled();
        });
    });

    describe("ReactiveStore - _pathsMatch边界", () => {
        it("BUG: 相似前缀路径不应误匹配", () => {
            const store = new ReactiveStore({ abc: 1, ab: 2 });
            expect(store._pathsMatch("abc", "ab")).toBe(false);
        });

        it("BUG: 空路径不应匹配", () => {
            const store = new ReactiveStore({ a: 1 });
            expect(store._pathsMatch("", "a")).toBe(false);
        });

        it("BUG: 数字路径不应误匹配", () => {
            const store = new ReactiveStore({ items: [1, 2, 3] });
            expect(store._pathsMatch("items.0", "items.10")).toBe(false);
        });
    });
});