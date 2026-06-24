import { describe, it, expect, vi, beforeEach } from "vitest";
import { LayerCompositor } from "../../../src/render/LayerCompositor.js";
import { TileLayer } from "../../../src/render/layers/TileLayer.js";
import { OverlayLayer } from "../../../src/render/layers/OverlayLayer.js";
import { FrozenLayer } from "../../../src/render/layers/FrozenLayer.js";
import { HeaderLayer } from "../../../src/render/layers/HeaderLayer.js";
import { UILayer } from "../../../src/render/layers/UILayer.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";

describe("Layer Integration", () => {
    let compositor;
    let store;

    beforeEach(() => {
        compositor = new LayerCompositor();
        store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            viewport: { width: 800, height: 600 },
            tile: { size: 256, cacheMax: 512 },
            selection: { ranges: [], activeRange: null },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            frozen: { rows: 0, cols: 0 },
            editor: { visible: false, row: -1, col: -1, value: "" },
        });
    });

    it("should register all layers in correct zIndex order", () => {
        compositor.register(new TileLayer());
        compositor.register(new OverlayLayer());
        compositor.register(new FrozenLayer());
        compositor.register(new HeaderLayer());
        compositor.register(new UILayer());

        const sorted = compositor.getSortedLayers();
        expect(sorted[0].name).toBe("tiles");
        expect(sorted[0].zIndex).toBe(1);
        expect(sorted[1].name).toBe("overlays");
        expect(sorted[1].zIndex).toBe(2);
        expect(sorted[2].name).toBe("frozen");
        expect(sorted[2].zIndex).toBe(2.5);
        expect(sorted[3].name).toBe("headers");
        expect(sorted[3].zIndex).toBe(3);
        expect(sorted[4].name).toBe("ui");
        expect(sorted[4].zIndex).toBe(4);
    });

    it("should bind all layers to store", () => {
        compositor.register(new TileLayer());
        compositor.register(new OverlayLayer());
        compositor.register(new FrozenLayer());
        compositor.register(new HeaderLayer());
        compositor.register(new UILayer());

        compositor.bindAllLayers(store);

        const sorted = compositor.getSortedLayers();
        for (const layer of sorted) {
            expect(layer._store).toBe(store);
        }
    });

    it("should compose all layers with mocked renderers", () => {
        const tileLayer = new TileLayer();
        const overlayLayer = new OverlayLayer();
        const frozenLayer = new FrozenLayer();
        const headerLayer = new HeaderLayer();
        const uiLayer = new UILayer();

        vi.spyOn(tileLayer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(overlayLayer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(overlayLayer.overlayRenderer, "renderSelection").mockImplementation(() => {});
        vi.spyOn(frozenLayer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(frozenLayer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(frozenLayer.overlayRenderer, "renderSelection").mockImplementation(() => {});
        vi.spyOn(headerLayer.headerRenderer, "render").mockImplementation(() => {});

        compositor.register(tileLayer);
        compositor.register(overlayLayer);
        compositor.register(frozenLayer);
        compositor.register(headerLayer);
        compositor.register(uiLayer);

        const mockMainCtx = { drawImage: vi.fn() };
        const sheet = {
            frozenColsWidth: 0,
            frozenRowsH: 0,
            frozenRowsHeight: 0,
            getHeaderWidth: vi.fn(() => 50),
            getHeaderHeight: vi.fn(() => 25),
            rowColManager: {
                totalWidth: 2000,
                totalHeight: 2000,
                colCount: 20,
                rowCount: 20,
            },
        };
        const viewport = { scrollX: 0, scrollY: 0 };

        const result = compositor.compose(mockMainCtx, sheet, viewport, 800, 600);

        expect(result.totalLayers).toBe(5);
        expect(result.dirtyLayers).toBe(5);
        expect(result.cachedLayers).toBe(0);
    });

    it("should handle scroll state change affecting all layers", () => {
        const tileLayer = new TileLayer();
        const headerLayer = new HeaderLayer();
        const frozenLayer = new FrozenLayer();

        compositor.register(tileLayer);
        compositor.register(headerLayer);
        compositor.register(frozenLayer);
        compositor.bindAllLayers(store);

        tileLayer.clearDirty();
        headerLayer.clearDirty();
        frozenLayer.clearDirty();

        store.state.scroll.x = 100;
        store.flush();

        expect(tileLayer.dirty).toBe(true);
        expect(headerLayer.dirty).toBe(true);
        expect(frozenLayer.dirty).toBe(true);
    });

    it("should handle selection change affecting overlay and header", () => {
        const overlayLayer = new OverlayLayer();
        const headerLayer = new HeaderLayer();
        const tileLayer = new TileLayer();

        compositor.register(overlayLayer);
        compositor.register(headerLayer);
        compositor.register(tileLayer);
        compositor.bindAllLayers(store);

        overlayLayer.clearDirty();
        headerLayer.clearDirty();
        tileLayer.clearDirty();

        store.state.selection.activeRange = { row: 0, col: 0 };
        store.flush();

        expect(overlayLayer.dirty).toBe(true);
        expect(headerLayer.dirty).toBe(true);
        expect(tileLayer.dirty).toBe(false);
    });

    it("should handle frozenOffset change affecting overlay, frozen, ui", () => {
        const overlayLayer = new OverlayLayer();
        const frozenLayer = new FrozenLayer();
        const uiLayer = new UILayer();
        const tileLayer = new TileLayer();

        compositor.register(overlayLayer);
        compositor.register(frozenLayer);
        compositor.register(uiLayer);
        compositor.register(tileLayer);
        compositor.bindAllLayers(store);

        overlayLayer.clearDirty();
        frozenLayer.clearDirty();
        uiLayer.clearDirty();
        tileLayer.clearDirty();

        store.state.frozenOffset.colsWidth = 100;
        store.flush();

        expect(overlayLayer.dirty).toBe(true);
        expect(frozenLayer.dirty).toBe(true);
        expect(uiLayer.dirty).toBe(true);
        expect(tileLayer.dirty).toBe(false);
    });

    it("should handle viewport change affecting tile and header", () => {
        const tileLayer = new TileLayer();
        const headerLayer = new HeaderLayer();

        compositor.register(tileLayer);
        compositor.register(headerLayer);
        compositor.bindAllLayers(store);

        tileLayer.clearDirty();
        headerLayer.clearDirty();

        store.state.viewport.width = 1024;
        store.flush();

        expect(tileLayer.dirty).toBe(true);
        expect(headerLayer.dirty).toBe(true);
    });

    it("should handle editor change affecting ui layer only", () => {
        const uiLayer = new UILayer();
        const tileLayer = new TileLayer();
        const overlayLayer = new OverlayLayer();

        compositor.register(uiLayer);
        compositor.register(tileLayer);
        compositor.register(overlayLayer);
        compositor.bindAllLayers(store);

        uiLayer.clearDirty();
        tileLayer.clearDirty();
        overlayLayer.clearDirty();

        store.state.editor.visible = true;
        store.flush();

        expect(uiLayer.dirty).toBe(true);
        expect(tileLayer.dirty).toBe(false);
        expect(overlayLayer.dirty).toBe(false);
    });

    it("should handle unregister and re-register", () => {
        compositor.register(new TileLayer());
        compositor.register(new OverlayLayer());

        expect(compositor.getSortedLayers()).toHaveLength(2);

        compositor.unregister("tiles");
        expect(compositor.getSortedLayers()).toHaveLength(1);
        expect(compositor.getSortedLayers()[0].name).toBe("overlays");

        compositor.register(new TileLayer());
        expect(compositor.getSortedLayers()).toHaveLength(2);
    });

    it("should handle destroyAll and re-register", () => {
        compositor.register(new TileLayer());
        compositor.register(new OverlayLayer());
        compositor.bindAllLayers(store);

        compositor.destroyAll();
        expect(compositor.getSortedLayers()).toHaveLength(0);

        compositor.register(new TileLayer());
        compositor.bindAllLayers(store);
        expect(compositor.getSortedLayers()).toHaveLength(1);
    });

    it("should handle markAllDirty on compositor", () => {
        const tileLayer = new TileLayer();
        const overlayLayer = new OverlayLayer();

        compositor.register(tileLayer);
        compositor.register(overlayLayer);

        tileLayer.clearDirty();
        overlayLayer.clearDirty();

        compositor.markAllDirty();

        expect(tileLayer.dirty).toBe(true);
        expect(overlayLayer.dirty).toBe(true);
    });

    it("should return debug info for all layers", () => {
        compositor.register(new TileLayer());
        compositor.register(new OverlayLayer());
        compositor.register(new UILayer());

        const info = compositor.getDebugInfo();
        expect(info).toHaveLength(3);
        expect(info.map((i) => i.name)).toEqual(["tiles", "overlays", "ui"]);
    });

    it("should handle frozen state change affecting frozen layer", () => {
        const frozenLayer = new FrozenLayer();
        const tileLayer = new TileLayer();

        compositor.register(frozenLayer);
        compositor.register(tileLayer);
        compositor.bindAllLayers(store);

        frozenLayer.clearDirty();
        tileLayer.clearDirty();

        store.state.frozen.rows = 3;
        store.flush();

        expect(frozenLayer.dirty).toBe(true);
        expect(tileLayer.dirty).toBe(false);
    });
});