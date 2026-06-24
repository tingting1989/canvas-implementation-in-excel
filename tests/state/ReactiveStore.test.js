import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReactiveStore, Scheduler } from "../../src/state/ReactiveStore.js";

describe("Scheduler", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it("should queue and flush jobs", () => {
        const scheduler = new Scheduler();
        const fn = vi.fn();
        scheduler.queueJob({ id: 1, run: fn });
        expect(scheduler.pending).toBe(1);
        vi.runAllTimers();
        expect(fn).toHaveBeenCalledOnce();
        expect(scheduler.pending).toBe(0);
    });

    it("should deduplicate jobs by id", () => {
        const scheduler = new Scheduler();
        const fn = vi.fn();
        scheduler.queueJob({ id: "a", run: fn });
        scheduler.queueJob({ id: "a", run: fn });
        expect(scheduler.pending).toBe(1);
    });

    it("should allow different ids", () => {
        const scheduler = new Scheduler();
        const fn = vi.fn();
        scheduler.queueJob({ id: "a", run: fn });
        scheduler.queueJob({ id: "b", run: fn });
        expect(scheduler.pending).toBe(2);
    });

    it("should cancel all pending jobs", () => {
        const scheduler = new Scheduler();
        scheduler.queueJob({ id: 1, run: vi.fn() });
        scheduler._queue.length = 0;
        scheduler._pendingRaf = false;
        expect(scheduler._queue.length).toBe(0);
    });
});

describe("ReactiveStore", () => {
    it("should create with initial state", () => {
        const store = new ReactiveStore({ count: 0, name: "test" });
        expect(store.state.count).toBe(0);
        expect(store.state.name).toBe("test");
    });

    it("should read nested state", () => {
        const store = new ReactiveStore({
            scroll: { x: 10, y: 20 },
        });
        expect(store.state.scroll.x).toBe(10);
        expect(store.state.scroll.y).toBe(20);
    });

    it("should trigger watcher on state change", () => {
        const store = new ReactiveStore({ count: 0 });
        const cb = vi.fn();
        store.watch("count", cb);
        store.state.count = 5;
        store.flush();
        expect(cb).toHaveBeenCalled();
    });

    it("should not trigger watcher when value unchanged", () => {
        const store = new ReactiveStore({ count: 0 });
        const cb = vi.fn();
        store.watch("count", cb);
        store.state.count = 0;
        store.flush();
        expect(cb).not.toHaveBeenCalled();
    });

    it("should support batch updates", () => {
        const store = new ReactiveStore({ a: 1, b: 2 });
        const cbA = vi.fn();
        const cbB = vi.fn();
        store.watch("a", cbA);
        store.watch("b", cbB);

        store.batch(() => {
            store.state.a = 10;
            store.state.b = 20;
        });
        store.flush();

        expect(store.state.a).toBe(10);
        expect(store.state.b).toBe(20);
        expect(cbA).toHaveBeenCalled();
        expect(cbB).toHaveBeenCalled();
    });

    it("should support unwatch", () => {
        const store = new ReactiveStore({ count: 0 });
        const cb = vi.fn();
        const unwatch = store.watch("count", cb);
        unwatch();
        store.state.count = 5;
        store.flush();
        expect(cb).not.toHaveBeenCalled();
    });

    it("should watch nested path changes", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
        });
        const cb = vi.fn();
        store.watch("scroll", cb);
        store.state.scroll.x = 100;
        store.flush();
        expect(cb).toHaveBeenCalled();
    });

    it("should support computed properties", () => {
        const store = new ReactiveStore({ a: 1, b: 2 });
        store.computed("sum", (state) => state.a + state.b);
        expect(store.state.sum).toBe(3);
    });

    it("should update computed when dependencies change", () => {
        const store = new ReactiveStore({ a: 1, b: 2 });
        store.computed("sum", (state) => state.a + state.b);
        expect(store.state.sum).toBe(3);
        store.state.a = 10;
        store.flush();
        expect(store.state.sum).toBe(12);
    });

    it("should return state snapshot", () => {
        const store = new ReactiveStore({ x: 1, nested: { y: 2 } });
        const snapshot = store.getStateSnapshot();
        expect(snapshot.x).toBe(1);
        expect(snapshot.nested.y).toBe(2);
        snapshot.x = 999;
        expect(store.state.x).toBe(1);
    });

    it("should destroy and clean up", () => {
        const store = new ReactiveStore({ count: 0 });
        const cb = vi.fn();
        store.watch("count", cb);
        store.destroy();
        store.state.count = 5;
        store.flush();
        expect(cb).not.toHaveBeenCalled();
    });

    it("should pass new and old value to watcher", () => {
        const store = new ReactiveStore({ count: 0 });
        const cb = vi.fn();
        store.watch("count", cb);
        store.state.count = 42;
        store.flush();
        expect(cb).toHaveBeenCalledWith(42, 0);
    });

    it("should support multiple watchers on same path", () => {
        const store = new ReactiveStore({ count: 0 });
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        store.watch("count", cb1);
        store.watch("count", cb2);
        store.state.count = 10;
        store.flush();
        expect(cb1).toHaveBeenCalledWith(10, 0);
        expect(cb2).toHaveBeenCalledWith(10, 0);
    });

    it("should unwatch only the specific watcher", () => {
        const store = new ReactiveStore({ count: 0 });
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        const unwatch1 = store.watch("count", cb1);
        store.watch("count", cb2);
        unwatch1();
        store.state.count = 10;
        store.flush();
        expect(cb1).not.toHaveBeenCalled();
        expect(cb2).toHaveBeenCalledWith(10, 0);
    });
});

describe("ReactiveStore - _pathsMatch", () => {
    it("should match exact path", () => {
        const store = new ReactiveStore({ a: 1 });
        expect(store._pathsMatch("a", "a")).toBe(true);
    });

    it("should match child path when watching parent", () => {
        const store = new ReactiveStore({ scroll: { x: 0 } });
        expect(store._pathsMatch("scroll.x", "scroll")).toBe(true);
    });

    it("should match parent path when watching child", () => {
        const store = new ReactiveStore({ scroll: { x: 0 } });
        expect(store._pathsMatch("scroll", "scroll.x")).toBe(true);
    });

    it("should not match unrelated paths", () => {
        const store = new ReactiveStore({ a: 1, b: 2 });
        expect(store._pathsMatch("a", "b")).toBe(false);
    });

    it("should not match partial prefix without dot", () => {
        const store = new ReactiveStore({ abc: 1, ab: 2 });
        expect(store._pathsMatch("abc", "ab")).toBe(false);
    });
});

describe("ReactiveStore - sync vs async watchers", () => {
    it("should call sync watchers immediately before async", () => {
        const store = new ReactiveStore({ count: 0 });
        const order = [];

        store._watchers.set("count", new Set([
            { deps: new Set(), run: () => order.push("sync"), sync: true },
            { deps: new Set(), run: () => order.push("async"), sync: false },
        ]));

        store.state.count = 1;

        expect(order).toEqual(["sync"]);
        store.flush();
        expect(order).toEqual(["sync", "async"]);
    });

    it("should call async watchers via scheduler", () => {
        const store = new ReactiveStore({ count: 0 });
        const cb = vi.fn();
        store._watchers.set("count", new Set([
            { deps: new Set(), run: cb, sync: false },
        ]));

        store.state.count = 5;
        expect(cb).not.toHaveBeenCalled();
        store.flush();
        expect(cb).toHaveBeenCalled();
    });
});

describe("ReactiveStore - nested batch", () => {
    it("should support nested batch", () => {
        const store = new ReactiveStore({ a: 1, b: 2, c: 3 });
        const cbA = vi.fn();
        const cbB = vi.fn();
        const cbC = vi.fn();
        store.watch("a", cbA);
        store.watch("b", cbB);
        store.watch("c", cbC);

        store.batch(() => {
            store.state.a = 10;
            store.batch(() => {
                store.state.b = 20;
                store.state.c = 30;
            });
        });
        store.flush();

        expect(store.state.a).toBe(10);
        expect(store.state.b).toBe(20);
        expect(store.state.c).toBe(30);
        expect(cbA).toHaveBeenCalled();
        expect(cbB).toHaveBeenCalled();
        expect(cbC).toHaveBeenCalled();
    });

    it("should only trigger watchers after outermost batch completes", () => {
        const store = new ReactiveStore({ a: 1 });
        const cb = vi.fn();
        store.watch("a", cb);

        store.batch(() => {
            store.state.a = 10;
            expect(cb).not.toHaveBeenCalled();
            store.batch(() => {
                store.state.a = 20;
                expect(cb).not.toHaveBeenCalled();
            });
            expect(cb).not.toHaveBeenCalled();
        });
        store.flush();
        expect(cb).toHaveBeenCalled();
    });
});

describe("ReactiveStore - computed", () => {
    it("should unwatch computed dependencies", () => {
        const store = new ReactiveStore({ a: 1, b: 2 });
        const uncompute = store.computed("sum", (state) => state.a + state.b);

        uncompute();

        expect(store._computeds.has("sum")).toBe(false);
    });

    it("should handle computed depending on other computed", () => {
        const store = new ReactiveStore({ a: 1 });
        store.computed("doubled", (state) => state.a * 2);
        expect(store.state.doubled).toBe(2);
        store.state.a = 5;
        store.flush();
        expect(store.state.doubled).toBe(10);
    });

    it("should mark computed dirty when dependency changes", () => {
        const store = new ReactiveStore({ a: 1 });
        store.computed("doubled", (state) => state.a * 2);
        store.state.a = 5;
        const entry = store._computeds.get("doubled");
        expect(entry.dirty).toBe(true);
    });

    it("should include computed values in snapshot", () => {
        const store = new ReactiveStore({ a: 1, b: 2 });
        store.computed("sum", (state) => state.a + state.b);
        const snapshot = store.getStateSnapshot();
        expect(snapshot.sum).toBe(3);
    });
});

describe("ReactiveStore - Scheduler", () => {
    it("should cancel pending jobs and prevent execution", () => {
        const scheduler = new Scheduler();
        const fn = vi.fn();
        scheduler.queueJob({ id: 1, run: fn });
        expect(scheduler.pending).toBe(1);
        scheduler.cancel();
        expect(scheduler.pending).toBe(0);
        expect(scheduler._pendingRaf).toBe(false);
    });

    it("should handle nextTick when queue is empty", async () => {
        const scheduler = new Scheduler();
        const result = await scheduler.nextTick();
        expect(result).toBeUndefined();
    });

    it("should handle flush re-entrancy", () => {
        const scheduler = new Scheduler();
        let callCount = 0;
        scheduler.queueJob({
            id: 1,
            run: () => {
                callCount++;
                scheduler.flush();
            },
        });
        scheduler.flush();
        expect(callCount).toBe(1);
    });

    it("should handle job errors gracefully", () => {
        const scheduler = new Scheduler();
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        scheduler.queueJob({
            id: 1,
            run: () => {
                throw new Error("test error");
            },
        });
        scheduler.flush();
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});