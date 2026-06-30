import { describe, it, expect, vi, beforeEach } from "vitest";
import { LayerCompositor } from "../../../src/render/LayerCompositor.js";
import { TileLayer } from "../../../src/render/layers/TileLayer.js";
import { SelectionLayer } from "../../../src/render/layers/SelectionLayer.js";
import { FrozenLayer } from "../../../src/render/layers/FrozenLayer.js";
import { InteractionLayer } from "../../../src/render/layers/InteractionLayer.js";
import { HeaderLayer } from "../../../src/render/layers/HeaderLayer.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";
import { LAYER_Z_INDEX } from "../../../src/constants/layerZIndex.js";

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
        compositor.register(new SelectionLayer());
        compositor.register(new FrozenLayer());
        compositor.register(new InteractionLayer());
        compositor.register(new HeaderLayer());

        const sorted = compositor.getSortedLayers();
        expect(sorted[0].name).toBe("tiles");
        expect(sorted[0].zIndex).toBe(LAYER_Z_INDEX.TILE);
        expect(sorted[1].name).toBe("selection");
        expect(sorted[1].zIndex).toBe(LAYER_Z_INDEX.SELECTION);
        expect(sorted[2].name).toBe("frozen");
        expect(sorted[2].zIndex).toBe(LAYER_Z_INDEX.FROZEN);
        expect(sorted[3].name).toBe("interaction");
        expect(sorted[3].zIndex).toBe(LAYER_Z_INDEX.INTERACTION);
        expect(sorted[4].name).toBe("headers");
        expect(sorted[4].zIndex).toBe(LAYER_Z_INDEX.HEADER);
    });

    it("should bind all layers to store", () => {
        compositor.register(new TileLayer());
        compositor.register(new SelectionLayer());
        compositor.register(new FrozenLayer());
        compositor.register(new InteractionLayer());
        compositor.register(new HeaderLayer());

        compositor.bindAllLayers(store);

        const sorted = compositor.getSortedLayers();
        for (const layer of sorted) {
            expect(layer.getStore()).toBe(store);
        }
    });

    it("should compose all layers with mocked renderers", () => {
        const tileLayer = new TileLayer();
        const selectionLayer = new SelectionLayer();
        const frozenLayer = new FrozenLayer();
        const interactionLayer = new InteractionLayer();
        const headerLayer = new HeaderLayer();

        vi.spyOn(tileLayer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(selectionLayer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(selectionLayer.overlayRenderer, "renderSelection").mockImplementation(() => {});
        vi.spyOn(frozenLayer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(frozenLayer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(frozenLayer.overlayRenderer, "renderSelection").mockImplementation(() => {});
        vi.spyOn(headerLayer.headerRenderer, "render").mockImplementation(() => {});

        compositor.register(tileLayer);
        compositor.register(selectionLayer);
        compositor.register(frozenLayer);
        compositor.register(interactionLayer);
        compositor.register(headerLayer);

        const mockMainCtx = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn() };
        const sheet = {
            frozenColsWidth: 0,
            frozenRowsHeight: 0,
            getHeaderWidth: vi.fn(() => 50),
            getHeaderHeight: vi.fn(() => 25),
            getMerge: vi.fn(() => null),
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
        const selectionLayer = new SelectionLayer();
        const frozenLayer = new FrozenLayer();
        const interactionLayer = new InteractionLayer();
        const headerLayer = new HeaderLayer();

        compositor.register(tileLayer);
        compositor.register(selectionLayer);
        compositor.register(frozenLayer);
        compositor.register(interactionLayer);
        compositor.register(headerLayer);
        compositor.bindAllLayers(store);

        tileLayer.clearDirty();
        selectionLayer.clearDirty();
        frozenLayer.clearDirty();
        interactionLayer.clearDirty();
        headerLayer.clearDirty();

        store.state.scroll.x = 100;
        store.flush();

        expect(tileLayer.dirty).toBe(true);
        expect(selectionLayer.dirty).toBe(true);
        expect(frozenLayer.dirty).toBe(true);
        expect(interactionLayer.dirty).toBe(true);
        expect(headerLayer.dirty).toBe(true);
    });

    it("should handle selection change affecting selection and header", () => {
        const selectionLayer = new SelectionLayer();
        const headerLayer = new HeaderLayer();
        const tileLayer = new TileLayer();

        compositor.register(selectionLayer);
        compositor.register(headerLayer);
        compositor.register(tileLayer);
        compositor.bindAllLayers(store);

        selectionLayer.clearDirty();
        headerLayer.clearDirty();
        tileLayer.clearDirty();

        store.state.selection.activeRange = { row: 0, col: 0 };
        store.flush();

        expect(selectionLayer.dirty).toBe(true);
        expect(headerLayer.dirty).toBe(true);
        expect(tileLayer.dirty).toBe(false);
    });

    it("should handle frozenOffset change affecting all layers", () => {
        const selectionLayer = new SelectionLayer();
        const frozenLayer = new FrozenLayer();
        const interactionLayer = new InteractionLayer();
        const tileLayer = new TileLayer();

        compositor.register(selectionLayer);
        compositor.register(frozenLayer);
        compositor.register(interactionLayer);
        compositor.register(tileLayer);
        compositor.bindAllLayers(store);

        selectionLayer.clearDirty();
        frozenLayer.clearDirty();
        interactionLayer.clearDirty();
        tileLayer.clearDirty();

        store.state.frozenOffset.colsWidth = 100;
        store.flush();

        expect(selectionLayer.dirty).toBe(true);
        expect(frozenLayer.dirty).toBe(true);
        expect(interactionLayer.dirty).toBe(true);
        expect(tileLayer.dirty).toBe(true);
    });

    it("should handle viewport change affecting tile, selection and header", () => {
        const tileLayer = new TileLayer();
        const headerLayer = new HeaderLayer();
        const selectionLayer = new SelectionLayer();

        compositor.register(tileLayer);
        compositor.register(headerLayer);
        compositor.register(selectionLayer);
        compositor.bindAllLayers(store);

        tileLayer.clearDirty();
        headerLayer.clearDirty();
        selectionLayer.clearDirty();

        store.state.viewport.width = 1024;
        store.flush();

        expect(tileLayer.dirty).toBe(true);
        expect(headerLayer.dirty).toBe(true);
        expect(selectionLayer.dirty).toBe(true);
    });

    it("should handle editor change affecting interaction layer", () => {
        const interactionLayer = new InteractionLayer();
        const tileLayer = new TileLayer();
        const selectionLayer = new SelectionLayer();

        compositor.register(interactionLayer);
        compositor.register(tileLayer);
        compositor.register(selectionLayer);
        compositor.bindAllLayers(store);

        interactionLayer.clearDirty();
        tileLayer.clearDirty();
        selectionLayer.clearDirty();

        store.state.editor.visible = true;
        store.flush();

        expect(interactionLayer.dirty).toBe(true);
        expect(tileLayer.dirty).toBe(false);
        expect(selectionLayer.dirty).toBe(false);
    });

    it("should handle unregister and re-register", () => {
        compositor.register(new TileLayer());
        compositor.register(new SelectionLayer());

        expect(compositor.getSortedLayers()).toHaveLength(2);

        compositor.unregister("tiles");
        expect(compositor.getSortedLayers()).toHaveLength(1);
        expect(compositor.getSortedLayers()[0].name).toBe("selection");

        compositor.register(new TileLayer());
        expect(compositor.getSortedLayers()).toHaveLength(2);
    });

    it("should handle destroyAll and re-register", () => {
        compositor.register(new TileLayer());
        compositor.register(new SelectionLayer());
        compositor.bindAllLayers(store);

        compositor.destroyAll();
        expect(compositor.getSortedLayers()).toHaveLength(0);

        compositor.register(new TileLayer());
        compositor.bindAllLayers(store);
        expect(compositor.getSortedLayers()).toHaveLength(1);
    });

    it("should handle markAllDirty on compositor", () => {
        const tileLayer = new TileLayer();
        const selectionLayer = new SelectionLayer();

        compositor.register(tileLayer);
        compositor.register(selectionLayer);

        tileLayer.clearDirty();
        selectionLayer.clearDirty();

        compositor.markAllDirty();

        expect(tileLayer.dirty).toBe(true);
        expect(selectionLayer.dirty).toBe(true);
    });

    it("should return debug info for all layers", () => {
        compositor.register(new TileLayer());
        compositor.register(new SelectionLayer());
        compositor.register(new InteractionLayer());

        const info = compositor.getDebugInfo();
        expect(info).toHaveLength(3);
        expect(info.map((i) => i.name)).toEqual(["tiles", "selection", "interaction"]);
    });

    it("should handle frozen state change affecting frozen and tile layers", () => {
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
        expect(tileLayer.dirty).toBe(true);
    });

    it("should have offscreen=true for TileLayer and FrozenLayer, offscreen=false for others", () => {
        const tileLayer = new TileLayer();
        const selectionLayer = new SelectionLayer();
        const frozenLayer = new FrozenLayer();
        const interactionLayer = new InteractionLayer();
        const headerLayer = new HeaderLayer();

        expect(tileLayer.offscreen).toBe(true);
        expect(frozenLayer.offscreen).toBe(true);
        expect(selectionLayer.offscreen).toBe(false);
        expect(interactionLayer.offscreen).toBe(false);
        expect(headerLayer.offscreen).toBe(false);
    });

    describe("Selection clipping - no overlap between FrozenLayer and SelectionLayer", () => {
        it("should clip SelectionLayer to non-frozen area when frozen cols exist", () => {
            const selectionLayer = new SelectionLayer();
            const frozenLayer = new FrozenLayer();

            const renderSelectionSpy = vi.spyOn(selectionLayer.overlayRenderer, "renderSelection").mockImplementation(() => {});
            const renderMergesSpy = vi.spyOn(selectionLayer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(frozenLayer.tileRenderer, "render").mockImplementation(() => {});
            const frozenRenderSelectionSpy = vi.spyOn(frozenLayer.overlayRenderer, "renderSelection").mockImplementation(() => {});
            vi.spyOn(frozenLayer.overlayRenderer, "renderMerges").mockImplementation(() => {});

            const ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                rect: vi.fn(),
                clip: vi.fn(),
                clearRect: vi.fn(),
                setTransform: vi.fn(),
                drawImage: vi.fn(),
            };

            const sheet = {
                frozenColsWidth: 120,
                frozenRowsHeight: 0,
                getHeaderWidth: vi.fn(() => 50),
                getHeaderHeight: vi.fn(() => 25),
                getMerge: vi.fn(() => null),
                fixedColumnsStart: 1,
                fixedRowsTop: 0,
                selection: { getRange: () => ({ topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 3 }) },
            };

            const viewport = {
                mergeToViewRect: () => ({ x: 50, y: 25, w: 400, h: 84 }),
                scrollX: 0,
                scrollY: 0,
            };

            selectionLayer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });

            expect(ctx.rect).toHaveBeenCalledWith(50 + 120, 25, 800 - 50 - 120, 600 - 25);
            expect(ctx.clip).toHaveBeenCalled();
            expect(renderSelectionSpy).toHaveBeenCalled();

            renderSelectionSpy.mockRestore();
            renderMergesSpy.mockRestore();
            frozenRenderSelectionSpy.mockRestore();
        });

        it("should clip SelectionLayer to non-frozen area when frozen rows exist", () => {
            const selectionLayer = new SelectionLayer();
            vi.spyOn(selectionLayer.overlayRenderer, "renderSelection").mockImplementation(() => {});
            vi.spyOn(selectionLayer.overlayRenderer, "renderMerges").mockImplementation(() => {});

            const ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                rect: vi.fn(),
                clip: vi.fn(),
            };

            const sheet = {
                frozenColsWidth: 0,
                frozenRowsHeight: 60,
                getHeaderWidth: vi.fn(() => 50),
                getHeaderHeight: vi.fn(() => 25),
            };

            selectionLayer.render(ctx, sheet, {}, { viewW: 800, viewH: 600 });

            expect(ctx.rect).toHaveBeenCalledWith(50, 25 + 60, 800 - 50, 600 - 25 - 60);
            expect(ctx.clip).toHaveBeenCalled();
        });

        it("should clip SelectionLayer to non-frozen area when both frozen cols and rows exist", () => {
            const selectionLayer = new SelectionLayer();
            vi.spyOn(selectionLayer.overlayRenderer, "renderSelection").mockImplementation(() => {});
            vi.spyOn(selectionLayer.overlayRenderer, "renderMerges").mockImplementation(() => {});

            const ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                rect: vi.fn(),
                clip: vi.fn(),
            };

            const sheet = {
                frozenColsWidth: 120,
                frozenRowsHeight: 60,
                getHeaderWidth: vi.fn(() => 50),
                getHeaderHeight: vi.fn(() => 25),
            };

            selectionLayer.render(ctx, sheet, {}, { viewW: 800, viewH: 600 });

            expect(ctx.rect).toHaveBeenCalledWith(50 + 120, 25 + 60, 800 - 50 - 120, 600 - 25 - 60);
            expect(ctx.clip).toHaveBeenCalled();
        });

        it("should not clip SelectionLayer when no frozen area", () => {
            const selectionLayer = new SelectionLayer();
            vi.spyOn(selectionLayer.overlayRenderer, "renderSelection").mockImplementation(() => {});
            vi.spyOn(selectionLayer.overlayRenderer, "renderMerges").mockImplementation(() => {});

            const ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                rect: vi.fn(),
                clip: vi.fn(),
            };

            const sheet = {
                frozenColsWidth: 0,
                frozenRowsHeight: 0,
                getHeaderWidth: vi.fn(() => 50),
                getHeaderHeight: vi.fn(() => 25),
            };

            selectionLayer.render(ctx, sheet, {}, { viewW: 800, viewH: 600 });

            expect(ctx.rect).not.toHaveBeenCalled();
            expect(ctx.clip).not.toHaveBeenCalled();
        });

        it("FrozenLayer and SelectionLayer clip areas are complementary", () => {
            const headerW = 50;
            const headerH = 25;
            const frozenColsW = 120;
            const frozenRowsH = 60;
            const viewW = 800;
            const viewH = 600;

            const frozenColClip = { x: headerW, y: headerH, w: frozenColsW, h: viewH - headerH };
            const frozenRowClip = { x: headerW, y: headerH, w: viewW - headerW, h: frozenRowsH };
            const frozenCornerClip = { x: headerW, y: headerH, w: frozenColsW, h: frozenRowsH };
            const selectionClip = { x: headerW + frozenColsW, y: headerH + frozenRowsH, w: viewW - headerW - frozenColsW, h: viewH - headerH - frozenRowsH };

            function rectsOverlap(a, b) {
                return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
            }

            expect(rectsOverlap(frozenColClip, selectionClip)).toBe(false);
            expect(rectsOverlap(frozenRowClip, selectionClip)).toBe(false);
            expect(rectsOverlap(frozenCornerClip, selectionClip)).toBe(false);

            const totalFrozenArea = (frozenColsW * (viewH - headerH)) + ((viewW - headerW - frozenColsW) * frozenRowsH);
            const selectionArea = selectionClip.w * selectionClip.h;
            const totalDataArea = (viewW - headerW) * (viewH - headerH);

            expect(totalFrozenArea + selectionArea).toBe(totalDataArea);
        });
    });
});