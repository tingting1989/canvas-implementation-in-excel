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
});