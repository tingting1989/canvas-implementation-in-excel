import { describe, it, expect, vi, beforeEach } from "vitest";
import { LayerCompositor } from "../../src/render/LayerCompositor.js";
import { BaseLayer } from "../../src/render/BaseLayer.js";
import { ReactiveStore } from "../../src/state/ReactiveStore.js";

class MockLayer extends BaseLayer {
    constructor(name, zIndex) {
        super(name, zIndex);
        this.renderCalls = 0;
    }

    initCanvas(width, height) {
        if (!this.canvas) {
            this.canvas = {
                width: width,
                height: height,
                style: {},
            };
            this.ctx = {
                setTransform: vi.fn(),
                clearRect: vi.fn(),
            };
        }
    }

    render(ctx, sheet, viewport, options) {
        this.renderCalls++;
        this.renderCount++;
    }
}

describe("LayerCompositor", () => {
    let compositor;

    beforeEach(() => {
        compositor = new LayerCompositor();
    });

    it("should register a layer", () => {
        const layer = new MockLayer("test", 1);
        compositor.register(layer);
        expect(compositor.getLayer("test")).toBe(layer);
    });

    it("should throw if registering non-BaseLayer", () => {
        expect(() => compositor.register({})).toThrow();
    });

    it("should throw if registering duplicate name", () => {
        compositor.register(new MockLayer("test", 1));
        expect(() => compositor.register(new MockLayer("test", 2))).toThrow();
    });

    it("should unregister and destroy layer", () => {
        const layer = new MockLayer("test", 1);
        compositor.register(layer);
        expect(compositor.unregister("test")).toBe(true);
        expect(compositor.getLayer("test")).toBeUndefined();
    });

    it("should return false for unregistering non-existent", () => {
        expect(compositor.unregister("nope")).toBe(false);
    });

    it("should sort layers by zIndex", () => {
        compositor.register(new MockLayer("c", 3));
        compositor.register(new MockLayer("a", 1));
        compositor.register(new MockLayer("b", 2));

        const sorted = compositor.getSortedLayers();
        expect(sorted[0].name).toBe("a");
        expect(sorted[1].name).toBe("b");
        expect(sorted[2].name).toBe("c");
    });

    it("should exclude disabled layers from sorted list", () => {
        const disabled = new MockLayer("disabled", 5);
        disabled.disable();
        compositor.register(new MockLayer("active", 1));
        compositor.register(disabled);

        const sorted = compositor.getSortedLayers();
        expect(sorted).toHaveLength(1);
        expect(sorted[0].name).toBe("active");
    });

    it("should mark all layers dirty", () => {
        const a = new MockLayer("a", 1);
        const b = new MockLayer("b", 2);
        a.clearDirty();
        b.clearDirty();
        compositor.register(a);
        compositor.register(b);
        compositor.markAllDirty();
        expect(a.dirty).toBe(true);
        expect(b.dirty).toBe(true);
    });

    it("should bind all layers to store", () => {
        const a = new MockLayer("a", 1);
        const b = new MockLayer("b", 2);
        compositor.register(a);
        compositor.register(b);

        const store = new ReactiveStore({ count: 0 });
        compositor.bindAllLayers(store);

        expect(a._store).toBe(store);
        expect(b._store).toBe(store);
    });

    it("should compose layers to main canvas", () => {
        const a = new MockLayer("a", 1);
        const b = new MockLayer("b", 2);
        compositor.register(a);
        compositor.register(b);

        const mockMainCtx = {
            drawImage: vi.fn(),
        };
        const result = compositor.compose(mockMainCtx, {}, {}, 800, 600);

        expect(result.totalLayers).toBe(2);
        expect(result.dirtyLayers).toBe(2);
        expect(a.renderCalls).toBe(1);
        expect(b.renderCalls).toBe(1);
    });

    it("should skip rendering clean layers", () => {
        const a = new MockLayer("a", 1);
        const b = new MockLayer("b", 2);
        compositor.register(a);
        compositor.register(b);

        const mockMainCtx = { drawImage: vi.fn() };
        compositor.compose(mockMainCtx, {}, {}, 800, 600);

        a.clearDirty();
        b.clearDirty();

        const result = compositor.compose(mockMainCtx, {}, {}, 800, 600);
        expect(result.cachedLayers).toBe(2);
        expect(result.dirtyLayers).toBe(0);
    });

    it("should return debug info for all layers", () => {
        compositor.register(new MockLayer("a", 1));
        compositor.register(new MockLayer("b", 2));
        const info = compositor.getDebugInfo();
        expect(info).toHaveLength(2);
        expect(info[0].name).toBe("a");
        expect(info[1].name).toBe("b");
    });

    it("should destroy all layers", () => {
        compositor.register(new MockLayer("a", 1));
        compositor.register(new MockLayer("b", 2));
        compositor.destroyAll();
        expect(compositor.getLayer("a")).toBeUndefined();
        expect(compositor.getLayer("b")).toBeUndefined();
    });

    it("should track stats across compose calls", () => {
        compositor.register(new MockLayer("a", 1));
        compositor.register(new MockLayer("b", 2));

        const mockMainCtx = { drawImage: vi.fn() };
        compositor.compose(mockMainCtx, {}, {}, 800, 600);

        expect(compositor.stats.totalRenders).toBe(1);
        expect(compositor.stats.dirtyRenders).toBe(2);
        expect(compositor.stats.cacheHits).toBe(0);

        compositor.getLayer("a").clearDirty();
        compositor.getLayer("b").clearDirty();
        compositor.compose(mockMainCtx, {}, {}, 800, 600);

        expect(compositor.stats.totalRenders).toBe(2);
        expect(compositor.stats.cacheHits).toBe(2);
        expect(compositor.stats.dirtyRenders).toBe(2);
    });

    it("should compute avgFrameTime", () => {
        compositor.register(new MockLayer("a", 1));

        const mockMainCtx = { drawImage: vi.fn() };
        compositor.compose(mockMainCtx, {}, {}, 800, 600);

        expect(compositor.stats.avgFrameTime).toBeGreaterThanOrEqual(0);
        expect(compositor.stats.lastFrameTime).toBeGreaterThanOrEqual(0);
    });

    it("should handle compose with no layers", () => {
        const mockMainCtx = { drawImage: vi.fn() };
        const result = compositor.compose(mockMainCtx, {}, {}, 800, 600);

        expect(result.totalLayers).toBe(0);
        expect(result.dirtyLayers).toBe(0);
        expect(result.cachedLayers).toBe(0);
    });

    it("should re-sort layers when a new layer is registered", () => {
        compositor.register(new MockLayer("b", 2));
        const sorted1 = compositor.getSortedLayers();
        expect(sorted1[0].name).toBe("b");

        compositor.register(new MockLayer("a", 1));
        const sorted2 = compositor.getSortedLayers();
        expect(sorted2[0].name).toBe("a");
        expect(sorted2[1].name).toBe("b");
    });

    it("should re-sort layers when a layer is unregistered", () => {
        compositor.register(new MockLayer("a", 1));
        compositor.register(new MockLayer("b", 2));
        compositor.register(new MockLayer("c", 3));

        compositor.unregister("b");
        const sorted = compositor.getSortedLayers();
        expect(sorted).toHaveLength(2);
        expect(sorted[0].name).toBe("a");
        expect(sorted[1].name).toBe("c");
    });

    it("should handle compose error gracefully", () => {
        const errorLayer = new MockLayer("error", 1);
        errorLayer.render = () => {
            throw new Error("render failed");
        };
        compositor.register(errorLayer);

        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const mockMainCtx = { drawImage: vi.fn() };
        const result = compositor.compose(mockMainCtx, {}, {}, 800, 600);

        expect(errorSpy).toHaveBeenCalled();
        expect(result.totalLayers).toBe(1);
        errorSpy.mockRestore();
    });

    it("should pass renderOptions with layers array to each layer", () => {
        const layer = new MockLayer("a", 1);
        let capturedOptions = null;
        layer.render = (ctx, sheet, viewport, options) => {
            capturedOptions = options;
            layer.renderCalls++;
            layer.renderCount++;
        };
        compositor.register(layer);

        const mockMainCtx = { drawImage: vi.fn() };
        compositor.compose(mockMainCtx, {}, {}, 800, 600);

        expect(capturedOptions).toBeDefined();
        expect(capturedOptions.viewW).toBe(800);
        expect(capturedOptions.viewH).toBe(600);
        expect(capturedOptions.layers).toBeDefined();
        expect(capturedOptions.layers.length).toBe(1);
    });

    it("should handle layer with same zIndex by registration order", () => {
        compositor.register(new MockLayer("first", 2));
        compositor.register(new MockLayer("second", 2));

        const sorted = compositor.getSortedLayers();
        expect(sorted[0].name).toBe("first");
        expect(sorted[1].name).toBe("second");
    });

    it("should include disabled layers in getLayer but not in getSortedLayers", () => {
        const disabled = new MockLayer("disabled", 5);
        disabled.disable();
        compositor.register(new MockLayer("active", 1));
        compositor.register(disabled);

        expect(compositor.getLayer("disabled")).toBe(disabled);
        expect(compositor.getSortedLayers()).toHaveLength(1);
    });

    it("should compose only dirty layers and cache clean ones", () => {
        const a = new MockLayer("a", 1);
        const b = new MockLayer("b", 2);
        compositor.register(a);
        compositor.register(b);

        const mockMainCtx = { drawImage: vi.fn() };
        const result1 = compositor.compose(mockMainCtx, {}, {}, 800, 600);
        expect(result1.dirtyLayers).toBe(2);
        expect(result1.cachedLayers).toBe(0);

        a.clearDirty();
        b.markDirty();

        const result2 = compositor.compose(mockMainCtx, {}, {}, 800, 600);
        expect(result2.dirtyLayers).toBe(1);
        expect(result2.cachedLayers).toBe(1);
        expect(a.renderCalls).toBe(1);
        expect(b.renderCalls).toBe(2);
    });

    it("should clear dirty after compose", () => {
        const layer = new MockLayer("a", 1);
        compositor.register(layer);

        const mockMainCtx = { drawImage: vi.fn() };
        compositor.compose(mockMainCtx, {}, {}, 800, 600);

        expect(layer.dirty).toBe(false);
    });

    it("should return frameTime in result", () => {
        compositor.register(new MockLayer("a", 1));

        const mockMainCtx = { drawImage: vi.fn() };
        const result = compositor.compose(mockMainCtx, {}, {}, 800, 600);

        expect(result.frameTime).toBeGreaterThanOrEqual(0);
    });
});