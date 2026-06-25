import { describe, it, expect, vi, beforeEach } from "vitest";
import { OverlayLayer } from "../../../src/render/layers/OverlayLayer.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";

describe("OverlayLayer", () => {
    let layer;

    beforeEach(() => {
        layer = new OverlayLayer();
    });

    it("should have name 'overlays' and zIndex 2", () => {
        expect(layer.name).toBe("overlays");
        expect(layer.zIndex).toBe(2);
    });

    it("should be dirty on construction", () => {
        expect(layer.dirty).toBe(true);
    });

    it("should be enabled on construction", () => {
        expect(layer.enabled).toBe(true);
    });

    it("should have overlayRenderer", () => {
        expect(layer.overlayRenderer).toBeDefined();
    });

    it("should bind store and watch selection and frozenOffset", () => {
        const store = new ReactiveStore({
            selection: { ranges: [], activeRange: null },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
        });
        layer.bindStore(store);

        layer.clearDirty();

        store.state.selection.activeRange = { row: 0, col: 0 };
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should mark dirty on frozenOffset change", () => {
        const store = new ReactiveStore({
            selection: { ranges: [], activeRange: null },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.frozenOffset.colsWidth = 100;
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
        const renderMergesSpy = vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        const renderSelectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {};
        const sheet = {};
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(renderMergesSpy).toHaveBeenCalledWith(ctx, sheet, viewport);
        expect(renderSelectionSpy).toHaveBeenCalledWith(ctx, sheet, viewport, 800, 600);
        expect(layer.renderCount).toBe(1);

        renderMergesSpy.mockRestore();
        renderSelectionSpy.mockRestore();
    });

    it("should increment renderCount on each render", () => {
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {};
        const sheet = {};
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);
        layer.render(ctx, sheet, viewport, options);
        layer.render(ctx, sheet, viewport, options);
        expect(layer.renderCount).toBe(3);
    });

    it("should destroy and clean up", () => {
        const store = new ReactiveStore({
            selection: { ranges: [], activeRange: null },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
        });
        layer.bindStore(store);
        layer.watch("selection", () => {});
        layer.destroy();
        expect(layer.getStore()).toBeNull();
        expect(layer.renderCount).toBe(0);
    });

    it("should return correct debug info", () => {
        const info = layer.getDebugInfo();
        expect(info.name).toBe("overlays");
        expect(info.zIndex).toBe(20);
        expect(info.enabled).toBe(true);
    });

    it("should call renderMerges and renderSelection in order", () => {
        const callOrder = [];
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {
            callOrder.push("merges");
        });
        vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {
            callOrder.push("selection");
        });

        const ctx = {};
        const sheet = {};
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(callOrder).toEqual(["merges", "selection"]);
    });

    it("should pass viewW and viewH to renderSelection", () => {
        const renderSelectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});

        const ctx = {};
        const sheet = {};
        const viewport = {};
        const options = { viewW: 1024, viewH: 768 };

        layer.render(ctx, sheet, viewport, options);

        expect(renderSelectionSpy).toHaveBeenCalledWith(ctx, sheet, viewport, 1024, 768);
        renderSelectionSpy.mockRestore();
    });

    it("should not render when disabled even with valid options", () => {
        layer.disable();
        const renderMergesSpy = vi.spyOn(layer.overlayRenderer, "renderMerges");
        const renderSelectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection");

        layer.render({}, {}, {}, { viewW: 800, viewH: 600 });

        expect(renderMergesSpy).not.toHaveBeenCalled();
        expect(renderSelectionSpy).not.toHaveBeenCalled();
        expect(layer.renderCount).toBe(0);
    });

    it("should handle multiple render calls", () => {
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {};
        const sheet = {};
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        for (let i = 0; i < 5; i++) {
            layer.render(ctx, sheet, viewport, options);
        }
        expect(layer.renderCount).toBe(5);
    });

    it("should watch both selection and frozenOffset on bindStore", () => {
        const store = new ReactiveStore({
            selection: { ranges: [], activeRange: null },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
        });
        layer.bindStore(store);

        const info = layer.getDebugInfo();
        expect(info.watcherCount).toBeGreaterThanOrEqual(2);
    });

    it("should handle destroy with bound store and watchers", () => {
        const store = new ReactiveStore({
            selection: { ranges: [], activeRange: null },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
        });
        layer.bindStore(store);
        layer.watch("selection", () => {});
        layer.watch("frozenOffset", () => {});
        layer.destroy();

        expect(layer.getStore()).toBeNull();
        expect(layer.renderCount).toBe(0);
    });
});