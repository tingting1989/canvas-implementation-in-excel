import { describe, it, expect, vi, beforeEach } from "vitest";
import { HeaderLayer } from "../../../src/render/layers/HeaderLayer.js";
import { DragIndicatorLayer } from "../../../src/render/layers/DragIndicatorLayer.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";
import { LAYER_Z_INDEX } from "../../../src/constants/layerZIndex.js";

describe("HeaderLayer", () => {
    let layer;

    beforeEach(() => {
        layer = new HeaderLayer();
    });

    it("should have name 'headers' and zIndex 5", () => {
        expect(layer.name).toBe("headers");
        expect(layer.zIndex).toBe(LAYER_Z_INDEX.HEADER);
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

        expect(renderSpy).toHaveBeenCalledWith(ctx, sheet, viewport, 800, 600, null);
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
        expect(layer.getStore()).toBeNull();
        expect(layer.renderCount).toBe(0);
    });

    it("should return correct debug info", () => {
        const info = layer.getDebugInfo();
        expect(info.name).toBe("headers");
        expect(info.zIndex).toBe(LAYER_Z_INDEX.HEADER);
        expect(info.enabled).toBe(true);
    });
});

describe("HeaderLayer - setDragIndicator", () => {
    it("should pass null to HeaderRenderer when no drag indicator set", () => {
        const layer = new HeaderLayer();

        const renderSpy = vi.spyOn(layer.headerRenderer, "render").mockImplementation(() => {});
        layer.render({}, {}, {}, { viewW: 800, viewH: 600 });

        expect(renderSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 800, 600, null);
        renderSpy.mockRestore();
    });

    it("should set drag indicator via setDragIndicator", () => {
        const layer = new HeaderLayer();
        const dragLayer = new DragIndicatorLayer();
        layer.setDragIndicator(dragLayer);

        const renderSpy = vi.spyOn(layer.headerRenderer, "render").mockImplementation(() => {});
        layer.render({}, {}, {}, { viewW: 800, viewH: 600 });

        expect(renderSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 800, 600, dragLayer);
        renderSpy.mockRestore();
    });

    it("should pass drag indicator to HeaderRenderer.render", () => {
        const layer = new HeaderLayer();
        const dragLayer = new DragIndicatorLayer();
        layer.setDragIndicator(dragLayer);

        const renderSpy = vi.spyOn(layer.headerRenderer, "render").mockImplementation(() => {});
        const ctx = {};
        const sheet = {};
        const viewport = {};

        layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });

        expect(renderSpy).toHaveBeenCalledWith(ctx, sheet, viewport, 800, 600, dragLayer);
        renderSpy.mockRestore();
    });

    it("should not use options.layers for drag indicator lookup", () => {
        const layer = new HeaderLayer();
        const dragLayer = new DragIndicatorLayer();
        layer.setDragIndicator(dragLayer);

        const renderSpy = vi.spyOn(layer.headerRenderer, "render").mockImplementation(() => {});
        const fakeLayers = [{ name: "drag-indicator", zIndex: 60 }];

        layer.render({}, {}, {}, { viewW: 800, viewH: 600, layers: fakeLayers });

        expect(renderSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 800, 600, dragLayer);
        renderSpy.mockRestore();
    });

    it("should allow replacing drag indicator", () => {
        const layer = new HeaderLayer();
        const dragLayer1 = new DragIndicatorLayer();
        const dragLayer2 = new DragIndicatorLayer();

        layer.setDragIndicator(dragLayer1);
        const renderSpy = vi.spyOn(layer.headerRenderer, "render").mockImplementation(() => {});
        layer.render({}, {}, {}, { viewW: 800, viewH: 600 });
        expect(renderSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 800, 600, dragLayer1);
        renderSpy.mockRestore();

        layer.setDragIndicator(dragLayer2);
        const renderSpy2 = vi.spyOn(layer.headerRenderer, "render").mockImplementation(() => {});
        layer.render({}, {}, {}, { viewW: 800, viewH: 600 });
        expect(renderSpy2).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 800, 600, dragLayer2);
        renderSpy2.mockRestore();
    });

    it("should allow clearing drag indicator by passing null", () => {
        const layer = new HeaderLayer();
        const dragLayer = new DragIndicatorLayer();
        layer.setDragIndicator(dragLayer);
        layer.setDragIndicator(null);

        const renderSpy = vi.spyOn(layer.headerRenderer, "render").mockImplementation(() => {});
        layer.render({}, {}, {}, { viewW: 800, viewH: 600 });
        expect(renderSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 800, 600, null);
        renderSpy.mockRestore();
    });
});