import { describe, it, expect, vi, beforeEach } from "vitest";
import { HeaderLayer } from "../../../src/render/layers/HeaderLayer.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";

describe("HeaderLayer", () => {
    let layer;

    beforeEach(() => {
        layer = new HeaderLayer();
    });

    it("should have name 'headers' and zIndex 3", () => {
        expect(layer.name).toBe("headers");
        expect(layer.zIndex).toBe(3);
    });

    it("should be dirty on construction", () => {
        expect(layer.dirty).toBe(true);
    });

    it("should be enabled on construction", () => {
        expect(layer.enabled).toBe(true);
    });

    it("should have headerRenderer", () => {
        expect(layer.headerRenderer).toBeDefined();
    });

    it("should bind store and watch scroll, frozen, viewport, selection", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozen: { rows: 0, cols: 0 },
            viewport: { width: 800, height: 600 },
            selection: { ranges: [], activeRange: null },
        });
        layer.bindStore(store);

        layer.clearDirty();

        store.state.scroll.x = 100;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should mark dirty on frozen change", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozen: { rows: 0, cols: 0 },
            viewport: { width: 800, height: 600 },
            selection: { ranges: [], activeRange: null },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.frozen.cols = 2;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should mark dirty on viewport change", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozen: { rows: 0, cols: 0 },
            viewport: { width: 800, height: 600 },
            selection: { ranges: [], activeRange: null },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.viewport.height = 900;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should mark dirty on selection change", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozen: { rows: 0, cols: 0 },
            viewport: { width: 800, height: 600 },
            selection: { ranges: [], activeRange: null },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.selection.activeRange = { row: 0, col: 0 };
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should skip render when disabled", () => {
        layer.disable();
        const ctx = { save: vi.fn(), restore: vi.fn() };
        layer.render(ctx, {}, {}, { viewW: 800, viewH: 600 });
        expect(layer.renderCount).toBe(0);
    });

    it("should render when enabled", () => {
        const renderSpy = vi.spyOn(layer.headerRenderer, "render").mockImplementation(() => {});
        const ctx = {};
        const sheet = {};
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(renderSpy).toHaveBeenCalledWith(ctx, sheet, viewport, 800, 600);
        expect(layer.renderCount).toBe(1);
        renderSpy.mockRestore();
    });

    it("should increment renderCount on each render", () => {
        vi.spyOn(layer.headerRenderer, "render").mockImplementation(() => {});
        const ctx = {};
        const sheet = {};
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);
        layer.render(ctx, sheet, viewport, options);
        expect(layer.renderCount).toBe(2);
    });

    it("should destroy and clean up", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozen: { rows: 0, cols: 0 },
            viewport: { width: 800, height: 600 },
            selection: { ranges: [], activeRange: null },
        });
        layer.bindStore(store);
        layer.watch("scroll", () => {});
        layer.destroy();
        expect(layer._store).toBeNull();
        expect(layer.renderCount).toBe(0);
    });

    it("should return correct debug info", () => {
        const info = layer.getDebugInfo();
        expect(info.name).toBe("headers");
        expect(info.zIndex).toBe(3);
        expect(info.enabled).toBe(true);
    });
});