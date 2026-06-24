import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseLayer } from "../../src/render/BaseLayer.js";
import { ReactiveStore } from "../../src/state/ReactiveStore.js";

describe("BaseLayer", () => {
    it("should throw if name is empty", () => {
        expect(() => new BaseLayer("", 1)).toThrow();
    });

    it("should throw if name is not a string", () => {
        expect(() => new BaseLayer(123, 1)).toThrow();
    });

    it("should throw if zIndex is not a number", () => {
        expect(() => new BaseLayer("test", "1")).toThrow();
    });

    it("should create layer with correct properties", () => {
        const layer = new BaseLayer("test", 5);
        expect(layer.name).toBe("test");
        expect(layer.zIndex).toBe(5);
        expect(layer.dirty).toBe(true);
        expect(layer.enabled).toBe(true);
    });

    it("should mark dirty", () => {
        const layer = new BaseLayer("test", 1);
        layer.clearDirty();
        expect(layer.dirty).toBe(false);
        layer.markDirty();
        expect(layer.dirty).toBe(true);
    });

    it("should enable and disable", () => {
        const layer = new BaseLayer("test", 1);
        layer.disable();
        expect(layer.enabled).toBe(false);
        layer.enable();
        expect(layer.enabled).toBe(true);
        expect(layer.dirty).toBe(true);
    });

    it("should throw on render if not overridden", () => {
        const layer = new BaseLayer("test", 1);
        expect(() => layer.render({}, {}, {})).toThrow();
    });

    it("should bind store and watch state", () => {
        const layer = new BaseLayer("test", 1);
        const store = new ReactiveStore({ scroll: { x: 0 } });
        layer.bindStore(store);

        const cb = vi.fn();
        layer.watch("scroll", cb);
        store.state.scroll.x = 100;
        store.flush();
        expect(cb).toHaveBeenCalled();
        expect(layer.dirty).toBe(true);
    });

    it("should warn when watching without store", () => {
        const layer = new BaseLayer("test", 1);
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const unwatch = layer.watch("scroll", () => {});
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it("should clear watchers", () => {
        const layer = new BaseLayer("test", 1);
        const store = new ReactiveStore({ count: 0 });
        layer.bindStore(store);
        layer.watch("count", () => {});
        layer.clearDirty();
        layer.clearWatchers();
        store.state.count = 5;
        store.flush();
        expect(layer.dirty).toBe(false);
    });

    it("should destroy and clean up", () => {
        const layer = new BaseLayer("test", 1);
        const store = new ReactiveStore({ count: 0 });
        layer.bindStore(store);
        layer.watch("count", () => {});
        layer.destroy();
        store.state.count = 5;
        store.flush();
        expect(layer._store).toBeNull();
    });

    it("should return debug info", () => {
        const layer = new BaseLayer("test", 3);
        const info = layer.getDebugInfo();
        expect(info.name).toBe("test");
        expect(info.zIndex).toBe(3);
        expect(info.enabled).toBe(true);
        expect(info.dirty).toBe(true);
        expect(info.hasStore).toBe(false);
    });

    it("should initialize canvas with initCanvas", () => {
        const layer = new BaseLayer("test", 1);
        layer.initCanvas(800, 600);
        expect(layer.canvas).toBeDefined();
        expect(layer.ctx).toBeDefined();
        expect(layer.canvas.width).toBeGreaterThan(0);
        expect(layer.canvas.height).toBeGreaterThan(0);
    });

    it("should mark dirty when canvas size changes", () => {
        const layer = new BaseLayer("test", 1);
        layer.initCanvas(800, 600);
        layer.clearDirty();
        layer.initCanvas(1024, 768);
        expect(layer.dirty).toBe(true);
    });

    it("should not mark dirty when canvas size unchanged", () => {
        const layer = new BaseLayer("test", 1);
        layer.initCanvas(800, 600);
        layer.clearDirty();
        layer.initCanvas(800, 600);
        expect(layer.dirty).toBe(false);
    });

    it("should reuse existing canvas on subsequent initCanvas", () => {
        const layer = new BaseLayer("test", 1);
        layer.initCanvas(800, 600);
        const canvas = layer.canvas;
        layer.initCanvas(800, 600);
        expect(layer.canvas).toBe(canvas);
    });

    it("should support multiple watchers on same path", () => {
        const layer = new BaseLayer("test", 1);
        const store = new ReactiveStore({ count: 0 });
        layer.bindStore(store);

        const cb1 = vi.fn();
        const cb2 = vi.fn();
        layer.watch("count", cb1);
        layer.watch("count", cb2);

        store.state.count = 10;
        store.flush();

        expect(cb1).toHaveBeenCalledWith(10, 0);
        expect(cb2).toHaveBeenCalledWith(10, 0);
    });

    it("should return unwatch function from watch", () => {
        const layer = new BaseLayer("test", 1);
        const store = new ReactiveStore({ count: 0 });
        layer.bindStore(store);

        const cb = vi.fn();
        const unwatch = layer.watch("count", cb);
        unwatch();

        store.state.count = 5;
        store.flush();
        expect(cb).not.toHaveBeenCalled();
    });

    it("should track watcher count in debug info", () => {
        const layer = new BaseLayer("test", 1);
        const store = new ReactiveStore({ a: 0, b: 0 });
        layer.bindStore(store);
        layer.watch("a", () => {});
        layer.watch("b", () => {});
        layer.watch("b", () => {});

        const info = layer.getDebugInfo();
        expect(info.watcherCount).toBe(3);
        expect(info.hasStore).toBe(true);
    });

    it("should set canvas style width and height", () => {
        const layer = new BaseLayer("test", 1);
        layer.initCanvas(1024, 768);
        expect(layer.canvas.style.width).toBe("1024px");
        expect(layer.canvas.style.height).toBe("768px");
    });

    it("should reset renderCount on destroy", () => {
        const layer = new BaseLayer("test", 1);
        layer.renderCount = 42;
        layer.destroy();
        expect(layer.renderCount).toBe(0);
    });

    it("should set dirty to true on destroy", () => {
        const layer = new BaseLayer("test", 1);
        layer.clearDirty();
        layer.destroy();
        expect(layer.dirty).toBe(true);
    });

    it("should clear canvas on destroy", () => {
        const layer = new BaseLayer("test", 1);
        layer.initCanvas(800, 600);
        layer.destroy();
        expect(layer.canvas).toBeNull();
        expect(layer.ctx).toBeNull();
    });

    it("should handle disable without marking dirty", () => {
        const layer = new BaseLayer("test", 1);
        layer.clearDirty();
        layer.disable();
        expect(layer.dirty).toBe(false);
        expect(layer.enabled).toBe(false);
    });

    it("should handle enable marking dirty", () => {
        const layer = new BaseLayer("test", 1);
        layer.clearDirty();
        layer.enable();
        expect(layer.dirty).toBe(true);
        expect(layer.enabled).toBe(true);
    });
});