import { describe, it, expect, vi, beforeEach } from "vitest";
import { TileLayer } from "../../../src/render/layers/TileLayer.js";
import { TileCache } from "../../../src/render/TileCache.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";
import { LAYER_Z_INDEX } from "../../../src/constants/layerZIndex.js";

describe("TileLayer", () => {
    let layer;

    beforeEach(() => {
        layer = new TileLayer();
    });

    it("should have name 'tiles' and zIndex 10", () => {
        expect(layer.name).toBe("tiles");
        expect(layer.zIndex).toBe(LAYER_Z_INDEX.TILE);
    });

    it("should be dirty on construction", () => {
        expect(layer.dirty).toBe(true);
    });

    it("should be enabled on construction", () => {
        expect(layer.enabled).toBe(true);
    });

    it("should have tileRenderer", () => {
        expect(layer.tileRenderer).toBeDefined();
        expect(layer.tileRenderer.tileCache).toBeDefined();
    });

    it("should have onContentReady as null by default", () => {
        expect(layer.onContentReady).toBeNull();
    });

    it("should mark dirty when onContentReady fires from tileRenderer", () => {
        layer.clearDirty();
        layer.tileRenderer.onContentReady();
        expect(layer.dirty).toBe(true);
    });

    it("should call onContentReady callback when set", () => {
        const cb = vi.fn();
        layer.onContentReady = cb;
        layer.tileRenderer.onContentReady();
        expect(cb).toHaveBeenCalledOnce();
    });

    it("should bind store and watch scroll, viewport, tile", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            viewport: { width: 800, height: 600 },
            tile: { size: 256, cacheMax: 512 },
        });
        layer.bindStore(store);

        layer.clearDirty();

        store.state.scroll.x = 100;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should mark dirty on viewport change", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            viewport: { width: 800, height: 600 },
            tile: { size: 256, cacheMax: 512 },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.viewport.width = 1024;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should mark dirty on tile config change", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            viewport: { width: 800, height: 600 },
            tile: { size: 256, cacheMax: 512 },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.tile.size = 512;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should skip render when disabled", () => {
        layer.disable();
        const ctx = { save: vi.fn(), restore: vi.fn() };
        layer.render(ctx, {}, { scrollX: 0, scrollY: 0 }, { viewW: 800, viewH: 600 });
        expect(layer.renderCount).toBe(0);
    });

    it("should render when enabled", () => {
        const renderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        const ctx = {};
        const sheet = {};
        const viewport = { scrollX: 0, scrollY: 0 };
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);
        expect(renderSpy).toHaveBeenCalledWith(ctx, sheet, 0, 0, 800, 600, undefined);
        expect(layer.renderCount).toBe(1);
        renderSpy.mockRestore();
    });

    it("should use options.scrollX/scrollY when provided", () => {
        const renderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        const ctx = {};
        const sheet = {};
        const viewport = { scrollX: 0, scrollY: 0 };
        const options = { viewW: 800, viewH: 600, scrollX: 100, scrollY: 200 };

        layer.render(ctx, sheet, viewport, options);
        expect(renderSpy).toHaveBeenCalledWith(ctx, sheet, 100, 200, 800, 600, undefined);
        renderSpy.mockRestore();
    });

    it("should use viewport scroll when options not provided", () => {
        const renderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        const ctx = {};
        const sheet = {};
        const viewport = { scrollX: 50, scrollY: 75 };
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);
        expect(renderSpy).toHaveBeenCalledWith(ctx, sheet, 50, 75, 800, 600, undefined);
        renderSpy.mockRestore();
    });

    it("should mark cell dirty via markCellDirty", () => {
        const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateCell");
        const rc = { getRowY: vi.fn(() => 0), getColX: vi.fn(() => 0) };
        layer.markCellDirty(5, 3, rc);
        expect(invalidateSpy).toHaveBeenCalledWith(5, 3, rc);
        expect(layer.dirty).toBe(true);
        invalidateSpy.mockRestore();
    });

    it("should mark all dirty via markAllDirty", () => {
        const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateAll");
        layer.clearDirty();
        layer.markAllDirty();
        expect(invalidateSpy).toHaveBeenCalled();
        expect(layer.dirty).toBe(true);
        invalidateSpy.mockRestore();
    });

    it("should accept shared tileCache in constructor", () => {
        const sharedCache = new TileCache();
        const sharedLayer = new TileLayer(sharedCache);
        expect(sharedLayer.tileRenderer.tileCache).toBe(sharedCache);
    });

    it("should create independent tileCache when null passed", () => {
        const independentLayer = new TileLayer(null);
        expect(independentLayer.tileRenderer.tileCache).toBeDefined();
        expect(independentLayer.tileRenderer.tileCache).not.toBe(layer.tileRenderer.tileCache);
    });

    it("should destroy and clean up", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            viewport: { width: 800, height: 600 },
            tile: { size: 256, cacheMax: 512 },
        });
        layer.bindStore(store);
        layer.watch("scroll", () => {});
        layer.destroy();
       expect(layer.getStore()).toBeNull();
        expect(layer.renderCount).toBe(0);
    });

    it("should return correct debug info", () => {
        const info = layer.getDebugInfo();
        expect(info.name).toBe("tiles");
        expect(info.zIndex).toBe(LAYER_Z_INDEX.TILE);
        expect(info.enabled).toBe(true);
    });

    it("should handle markCellDirty with different cells", () => {
        const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateCell");
        const rc = { getRowY: vi.fn(() => 0), getColX: vi.fn(() => 0) };

        layer.markCellDirty(0, 0, rc);
        layer.markCellDirty(100, 50, rc);

        expect(invalidateSpy).toHaveBeenCalledTimes(2);
        expect(invalidateSpy).toHaveBeenCalledWith(0, 0, rc);
        expect(invalidateSpy).toHaveBeenCalledWith(100, 50, rc);
        invalidateSpy.mockRestore();
    });

    it("should remain dirty after markCellDirty even if previously clean", () => {
        const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateCell");
        layer.clearDirty();
        expect(layer.dirty).toBe(false);

        const rc = { getRowY: vi.fn(() => 0), getColX: vi.fn(() => 0) };
        layer.markCellDirty(5, 3, rc);
        expect(layer.dirty).toBe(true);
        invalidateSpy.mockRestore();
    });

    it("should handle render with empty options", () => {
        const renderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        const ctx = {};
        const sheet = {};
        const viewport = { scrollX: 10, scrollY: 20 };

        layer.render(ctx, sheet, viewport);
        expect(renderSpy).toHaveBeenCalledWith(ctx, sheet, 10, 20, undefined, undefined, undefined);
        renderSpy.mockRestore();
    });

    it("should not increment renderCount when disabled", () => {
        layer.disable();
        const ctx = {};
        layer.render(ctx, {}, { scrollX: 0, scrollY: 0 }, { viewW: 800, viewH: 600 });
        expect(layer.renderCount).toBe(0);
    });

    it("should handle multiple markAllDirty calls", () => {
        const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateAll");
        layer.markAllDirty();
        layer.markAllDirty();
        layer.markAllDirty();
        expect(invalidateSpy).toHaveBeenCalledTimes(3);
        expect(layer.dirty).toBe(true);
        invalidateSpy.mockRestore();
    });

    it("should handle onContentReady with null callback", () => {
        layer.onContentReady = null;
        layer.clearDirty();
        layer.tileRenderer.onContentReady();
        expect(layer.dirty).toBe(true);
    });

    it("should handle onContentReady with function callback", () => {
        const cb = vi.fn();
        layer.onContentReady = cb;
        layer.tileRenderer.onContentReady();
        expect(cb).toHaveBeenCalledOnce();
        expect(layer.dirty).toBe(true);
    });

    it("should handle bindStore with multiple state changes", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            viewport: { width: 800, height: 600 },
            tile: { size: 256, cacheMax: 512 },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.scroll.x = 100;
        store.state.viewport.width = 1024;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should handle destroy after bindStore", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            viewport: { width: 800, height: 600 },
            tile: { size: 256, cacheMax: 512 },
        });
        layer.bindStore(store);
        layer.destroy();

        expect(layer.getStore()).toBeNull();
        expect(layer.renderCount).toBe(0);
        expect(layer.onContentReady).toBeNull();
    });
});