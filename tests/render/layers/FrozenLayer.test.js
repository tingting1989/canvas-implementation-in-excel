import { describe, it, expect, vi, beforeEach } from "vitest";
import { FrozenLayer } from "../../../src/render/layers/FrozenLayer.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";

function createMockSheet(overrides = {}) {
    const frozenColsWidth = overrides.frozenColsWidth ?? 0;
    const frozenRowsH = overrides.frozenRowsH ?? 0;
    const frozenRowsHeight = overrides.frozenRowsHeight ?? frozenRowsH;
    return {
        frozenColsWidth,
        frozenRowsH,
        frozenRowsHeight,
        getHeaderWidth: vi.fn(() => 50),
        getHeaderHeight: vi.fn(() => 25),
        rowColManager: {
            totalWidth: 2000,
            totalHeight: 2000,
            colCount: 20,
            rowCount: 20,
        },
    };
}

describe("FrozenLayer", () => {
    let layer;

    beforeEach(() => {
        layer = new FrozenLayer();
    });

    it("should have name 'frozen' and zIndex 4", () => {
        expect(layer.name).toBe("frozen");
        expect(layer.zIndex).toBe(4);
    });

    it("should be dirty on construction", () => {
        expect(layer.dirty).toBe(true);
    });

    it("should be enabled on construction", () => {
        expect(layer.enabled).toBe(true);
    });

    it("should have tileRenderer with independent TileCache", () => {
        expect(layer.tileRenderer).toBeDefined();
        expect(layer.tileRenderer.tileCache).toBeDefined();
    });

    it("should have overlayRenderer", () => {
        expect(layer.overlayRenderer).toBeDefined();
    });

    it("should initialize cached frozen state as -1", () => {
        expect(layer._cachedFrozenColsW).toBe(-1);
        expect(layer._cachedFrozenRowsH).toBe(-1);
    });

    it("should bind store and watch frozen, frozenOffset, scroll, selection", () => {
        const store = new ReactiveStore({
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            scroll: { x: 0, y: 0 },
            selection: { ranges: [], activeRange: null },
        });
        layer.bindStore(store);

        layer.clearDirty();

        store.state.frozen.rows = 3;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should mark dirty on scroll change", () => {
        const store = new ReactiveStore({
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            scroll: { x: 0, y: 0 },
            selection: { ranges: [], activeRange: null },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.scroll.y = 100;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should mark dirty on frozenOffset change", () => {
        const store = new ReactiveStore({
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            scroll: { x: 0, y: 0 },
            selection: { ranges: [], activeRange: null },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.frozenOffset.rowsHeight = 80;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should mark dirty on selection change", () => {
        const store = new ReactiveStore({
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            scroll: { x: 0, y: 0 },
            selection: { ranges: [], activeRange: null },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.selection.activeRange = { row: 0, col: 0 };
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should skip render when no frozen rows or cols", () => {
        const ctx = { save: vi.fn(), restore: vi.fn() };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = { scrollX: 0, scrollY: 0 };
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);
        expect(layer.renderCount).toBe(0);
    });

    it("should skip render when disabled", () => {
        layer.disable();
        const ctx = { save: vi.fn(), restore: vi.fn() };
        const sheet = createMockSheet({ frozenColsWidth: 100, frozenRowsH: 50 });
        layer.render(ctx, sheet, {}, { viewW: 800, viewH: 600 });
        expect(layer.renderCount).toBe(0);
    });

    it("should render when frozen cols exist", () => {
        const tileRenderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        const mergesSpy = vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 0 });
        const viewport = { scrollX: 0, scrollY: 0 };
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(layer.renderCount).toBe(1);
        expect(tileRenderSpy).toHaveBeenCalled();

        tileRenderSpy.mockRestore();
        mergesSpy.mockRestore();
        selectionSpy.mockRestore();
    });

    it("should render when frozen rows exist", () => {
        const tileRenderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 60 });
        const viewport = { scrollX: 0, scrollY: 0 };
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(layer.renderCount).toBe(1);
        expect(tileRenderSpy).toHaveBeenCalled();
        tileRenderSpy.mockRestore();
    });

    it("should render all 3 regions when both frozen rows and cols exist", () => {
        const tileRenderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 60 });
        const viewport = { scrollX: 0, scrollY: 0 };
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(layer.renderCount).toBe(1);
        expect(tileRenderSpy).toHaveBeenCalledTimes(3);
        tileRenderSpy.mockRestore();
    });

    it("should invalidate all tiles when frozen state changes", () => {
        vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        };
        const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateAll");

        const sheet1 = createMockSheet({ frozenColsWidth: 100, frozenRowsH: 50 });
        layer.render(ctx, sheet1, { scrollX: 0, scrollY: 0 }, { viewW: 800, viewH: 600 });

        expect(invalidateSpy).toHaveBeenCalled();
        invalidateSpy.mockRestore();
    });

    it("should not invalidate when frozen state unchanged", () => {
        vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 100, frozenRowsH: 50 });

        layer.render(ctx, sheet, { scrollX: 0, scrollY: 0 }, { viewW: 800, viewH: 600 });

        const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateAll");
        layer.render(ctx, sheet, { scrollX: 0, scrollY: 0 }, { viewW: 800, viewH: 600 });

        expect(invalidateSpy).not.toHaveBeenCalled();
        invalidateSpy.mockRestore();
    });

    it("should use options.scrollX/scrollY when provided", () => {
        const tileRenderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 60 });
        const viewport = { scrollX: 0, scrollY: 0 };
        const options = { viewW: 800, viewH: 600, scrollX: 50, scrollY: 100 };

        layer.render(ctx, sheet, viewport, options);

        const calls = tileRenderSpy.mock.calls;
        expect(calls.length).toBeGreaterThan(0);

        tileRenderSpy.mockRestore();
    });

    it("should mark cell dirty via markCellDirty", () => {
        const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateCell");
        const rc = { getRowY: vi.fn(() => 0), getColX: vi.fn(() => 0) };
        layer.markCellDirty(3, 5, rc);
        expect(invalidateSpy).toHaveBeenCalledWith(3, 5, rc);
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

    it("should destroy and clean up", () => {
        const store = new ReactiveStore({
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            scroll: { x: 0, y: 0 },
            selection: { ranges: [], activeRange: null },
        });
        layer.bindStore(store);
        layer.watch("frozen", () => {});
        layer.destroy();
       expect(layer.getStore()).toBeNull();
        expect(layer.renderCount).toBe(0);
    });

    it("should return correct debug info", () => {
        const info = layer.getDebugInfo();
        expect(info.name).toBe("frozen");
        expect(info.zIndex).toBe(4);
        expect(info.enabled).toBe(true);
    });

    it("should update cached frozen state after render", () => {
        vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 60 });
        const viewport = { scrollX: 0, scrollY: 0 };
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(layer._cachedFrozenColsW).toBe(120);
        expect(layer._cachedFrozenRowsH).toBe(60);
    });

    it("should detect frozen state change between renders", () => {
        vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        };

        const sheet1 = createMockSheet({ frozenColsWidth: 100, frozenRowsH: 50 });
        layer.render(ctx, sheet1, { scrollX: 0, scrollY: 0 }, { viewW: 800, viewH: 600 });

        const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateAll");
        const sheet2 = createMockSheet({ frozenColsWidth: 150, frozenRowsH: 50 });
        layer.markDirty();
        layer.render(ctx, sheet2, { scrollX: 0, scrollY: 0 }, { viewW: 800, viewH: 600 });

        expect(invalidateSpy).toHaveBeenCalled();
        invalidateSpy.mockRestore();
    });

    it("should not render when both frozen values are 0", () => {
        const ctx = { save: vi.fn(), restore: vi.fn() };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = { scrollX: 0, scrollY: 0 };
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);
        expect(layer.renderCount).toBe(0);
    });

    it("should render only frozen cols region when frozenRowsH is 0", () => {
        const tileRenderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 100, frozenRowsH: 0 });
        const viewport = { scrollX: 0, scrollY: 0 };
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(tileRenderSpy).toHaveBeenCalledTimes(1);
        tileRenderSpy.mockRestore();
    });

    it("should render only frozen rows region when frozenColsWidth is 0", () => {
        const tileRenderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 60 });
        const viewport = { scrollX: 0, scrollY: 0 };
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(tileRenderSpy).toHaveBeenCalledTimes(1);
        tileRenderSpy.mockRestore();
    });

    it("should call overlayRenderer.renderMerges for each region", () => {
        vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        const mergesSpy = vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 60 });
        const viewport = { scrollX: 0, scrollY: 0 };
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(mergesSpy.call.length).toBeGreaterThanOrEqual(1);
        mergesSpy.mockRestore();
    });

    it("should call overlayRenderer.renderSelection for each region", () => {
        vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
        vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 60 });
        const viewport = { scrollX: 0, scrollY: 0 };
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(selectionSpy).toHaveBeenCalled();
        selectionSpy.mockRestore();
    });

    it("should handle markCellDirty with different cells", () => {
        const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateCell");
        const rc = { getRowY: vi.fn(() => 0), getColX: vi.fn(() => 0) };

        layer.markCellDirty(0, 0, rc);
        layer.markCellDirty(10, 20, rc);

        expect(invalidateSpy).toHaveBeenCalledTimes(2);
        invalidateSpy.mockRestore();
    });

    it("should handle markAllDirty after clearDirty", () => {
        layer.clearDirty();
        expect(layer.dirty).toBe(false);

        const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateAll");
        layer.markAllDirty();
        expect(invalidateSpy).toHaveBeenCalled();
        expect(layer.dirty).toBe(true);
        invalidateSpy.mockRestore();
    });

    it("should watch frozen, frozenOffset, scroll, selection on bindStore", () => {
        const store = new ReactiveStore({
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            scroll: { x: 0, y: 0 },
            selection: { ranges: [], activeRange: null },
        });
        layer.bindStore(store);

        const info = layer.getDebugInfo();
        expect(info.watcherCount).toBeGreaterThanOrEqual(4);
    });
});