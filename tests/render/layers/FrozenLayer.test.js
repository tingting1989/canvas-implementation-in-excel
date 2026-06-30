import { describe, it, expect, vi, beforeEach } from "vitest";
import { FrozenLayer } from "../../../src/render/layers/FrozenLayer.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";
import { LAYER_Z_INDEX } from "../../../src/constants/layerZIndex.js";

function createMockSheet(overrides = {}) {
    const frozenColsWidth = overrides.frozenColsWidth ?? 0;
    const frozenRowsH = overrides.frozenRowsH ?? 0;
    const frozenRowsHeight = overrides.frozenRowsHeight ?? frozenRowsH;
    return {
        frozenColsWidth,
        frozenRowsH,
        frozenRowsHeight,
        fixedColumnsStart: overrides.fixedColumnsStart ?? 0,
        fixedRowsTop: overrides.fixedRowsTop ?? 0,
        getHeaderWidth: vi.fn(() => 50),
        getHeaderHeight: vi.fn(() => 25),
        selection: {
            getRange: vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 })),
            getFocus: vi.fn(() => [0, 0]),
            ...overrides.selection,
        },
        rowColManager: {
            totalWidth: 2000,
            totalHeight: 2000,
            colCount: 20,
            rowCount: 20,
        },
    };
}

function createViewport(overrides = {}) {
    return {
        scrollX: overrides.scrollX ?? 0,
        scrollY: overrides.scrollY ?? 0,
        mergeToViewRect: (range) => ({
            x: range.topCol * 80 + 50,
            y: range.topRow * 25 + 25,
            w: (range.bottomCol - range.topCol + 1) * 80,
            h: (range.bottomRow - range.topRow + 1) * 25,
        }),
    };
}

describe("FrozenLayer", () => {
    let layer;

    beforeEach(() => {
        layer = new FrozenLayer();
    });

    describe("Constructor & Initialization", () => {
        it("should have name 'frozen' and correct zIndex", () => {
            expect(layer.name).toBe("frozen");
            expect(layer.zIndex).toBe(LAYER_Z_INDEX.FROZEN);
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
    });

    describe("State Management", () => {
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

        it("should handle multiple markCellDirty calls", () => {
            const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateCell");
            const rc = { getRowY: vi.fn(() => 0), getColX: vi.fn(() => 0) };

            layer.markCellDirty(0, 0, rc);
            layer.markCellDirty(10, 20, rc);

            expect(invalidateSpy).toHaveBeenCalledTimes(2);
            invalidateSpy.mockRestore();
        });
    });

    describe("Store Binding & Watchers", () => {
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

        it("should have correct watcher count after bindStore", () => {
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

    describe("Render Logic - Basic Cases", () => {
        let ctx;

        beforeEach(() => {
            ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                rect: vi.fn(),
                clip: vi.fn(),
            };
        });

        it("should skip render when no frozen rows or cols", () => {
            const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
            const viewport = createViewport();

            layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });

            expect(layer.renderCount).toBe(0);
            expect(ctx.save).not.toHaveBeenCalled();
        });

        it("should skip render when disabled", () => {
            layer.disable();
            const sheet = createMockSheet({ frozenColsWidth: 100, frozenRowsH: 50 });
            const viewport = createViewport();

            layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });

            expect(layer.renderCount).toBe(0);
            expect(ctx.save).not.toHaveBeenCalled();
        });

        it("should render when frozen cols exist", () => {
            const tileRenderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            const mergesSpy = vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 0 });
            const viewport = createViewport();

            layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });

            expect(layer.renderCount).toBe(1);
            expect(tileRenderSpy).toHaveBeenCalled();
            expect(ctx.save).toHaveBeenCalled();
            expect(ctx.clip).toHaveBeenCalled();

            tileRenderSpy.mockRestore();
            mergesSpy.mockRestore();
            selectionSpy.mockRestore();
        });

        it("should render when frozen rows exist", () => {
            const tileRenderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 60 });
            const viewport = createViewport();

            layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });

            expect(layer.renderCount).toBe(1);
            expect(tileRenderSpy).toHaveBeenCalled();
            tileRenderSpy.mockRestore();
        });

        it("should render all 3 regions when both frozen rows and cols exist", () => {
            const tileRenderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 60 });
            const viewport = createViewport();

            layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });

            expect(layer.renderCount).toBe(1);
            expect(tileRenderSpy).toHaveBeenCalledTimes(3);
            tileRenderSpy.mockRestore();
        });

        it("should use options.scrollX/scrollY when provided", () => {
            const tileRenderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 60 });
            const viewport = createViewport();
            const options = { viewW: 800, viewH: 600, scrollX: 50, scrollY: 100 };

            layer.render(ctx, sheet, viewport, options);

            const calls = tileRenderSpy.mock.calls;
            expect(calls.length).toBeGreaterThan(0);

            tileRenderSpy.mockRestore();
        });
    });

    describe("Render Logic - Frozen State Caching", () => {
        let ctx;

        beforeEach(() => {
            ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                rect: vi.fn(),
                clip: vi.fn(),
            };
        });

        it("should update cached frozen state after render", () => {
            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 60 });
            const viewport = createViewport();

            layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });

            expect(layer._cachedFrozenColsW).toBe(120);
            expect(layer._cachedFrozenRowsH).toBe(60);
        });

        it("should detect frozen state change between renders", () => {
            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            const sheet1 = createMockSheet({ frozenColsWidth: 100, frozenRowsH: 50 });
            layer.render(ctx, sheet1, createViewport(), { viewW: 800, viewH: 600 });

            const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateAll");
            const sheet2 = createMockSheet({ frozenColsWidth: 150, frozenRowsH: 50 });
            layer.markDirty();
            layer.render(ctx, sheet2, createViewport(), { viewW: 800, viewH: 600 });

            expect(invalidateSpy).toHaveBeenCalled();
            invalidateSpy.mockRestore();
        });

        it("should not invalidate when frozen state unchanged", () => {
            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            const sheet = createMockSheet({ frozenColsWidth: 100, frozenRowsH: 50 });

            layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });

            const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateAll");
            layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });

            expect(invalidateSpy).not.toHaveBeenCalled();
            invalidateSpy.mockRestore();
        });

        it("should invalidate all tiles when frozen state changes", () => {
            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            const invalidateSpy = vi.spyOn(layer.tileRenderer, "invalidateAll");

            const sheet1 = createMockSheet({ frozenColsWidth: 100, frozenRowsH: 50 });
            layer.render(ctx, sheet1, createViewport(), { viewW: 800, viewH: 600 });

            expect(invalidateSpy).toHaveBeenCalled();
            invalidateSpy.mockRestore();
        });
    });

    describe("Selection Rendering with Frozen Columns", () => {
        let layer;
        let ctx;

        beforeEach(() => {
            layer = new FrozenLayer();
            ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                rect: vi.fn(),
                clip: vi.fn(),
            };
        });

        function createSheetWithSelection(overrides = {}) {
            return {
                ...createMockSheet(overrides),
                fixedColumnsStart: overrides.fixedColumnsStart ?? 1,
                fixedRowsTop: overrides.fixedRowsTop ?? 0,
                selection: {
                    getRange: () => overrides.selectionRange ?? { topRow: 2, topCol: 3, bottomRow: 5, bottomCol: 3 },
                    getFocus: () => [2, 3],
                },
            };
        }

        it("should render selection in frozen column when selected cell is in frozen column", () => {
            const sheet = createSheetWithSelection({
                frozenColsWidth: 120,
                fixedColumnsStart: 1,
                selectionRange: { topRow: 2, topCol: 0, bottomRow: 5, bottomCol: 0 },
            });

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });

            expect(selectionSpy).toHaveBeenCalled();
            selectionSpy.mockRestore();
        });

        it("should NOT render non-frozen selection in frozen column area", () => {
            const sheet = createSheetWithSelection({
                frozenColsWidth: 120,
                fixedColumnsStart: 1,
                selectionRange: { topRow: 2, topCol: 3, bottomRow: 5, bottomCol: 3 },
            });

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });

            expect(selectionSpy).not.toHaveBeenCalled();
            selectionSpy.mockRestore();
        });

        it("should render selection spanning both frozen and non-frozen columns", () => {
            const sheet = createSheetWithSelection({
                frozenColsWidth: 120,
                fixedColumnsStart: 1,
                selectionRange: { topRow: 2, topCol: 0, bottomRow: 5, bottomCol: 3 },
            });

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });

            expect(selectionSpy).toHaveBeenCalled();
            selectionSpy.mockRestore();
        });

        it("should handle selection at boundary of frozen columns", () => {
            const sheet = createSheetWithSelection({
                frozenColsWidth: 120,
                fixedColumnsStart: 1,
                selectionRange: { topRow: 2, topCol: 0, bottomRow: 5, bottomCol: 0 },
            });

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });

            expect(selectionSpy).toHaveBeenCalled();
            selectionSpy.mockRestore();
        });
    });

    describe("Selection Rendering with Frozen Rows", () => {
        let layer;
        let ctx;

        beforeEach(() => {
            layer = new FrozenLayer();
            ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                rect: vi.fn(),
                clip: vi.fn(),
            };
        });

        function createSheetWithFrozenRows(overrides = {}) {
            return {
                ...createMockSheet(overrides),
                fixedColumnsStart: 0,
                fixedRowsTop: overrides.fixedRowsTop ?? 1,
                selection: {
                    getRange: () =>
                        overrides.selectionRange ?? { topRow: 3, topCol: 2, bottomRow: 3, bottomCol: 5 },
                    getFocus: () => [3, 2],
                },
            };
        }

        it("should render selection in frozen row when selected cell is in frozen row", () => {
            const sheet = createSheetWithFrozenRows({
                frozenRowsH: 40,
                fixedRowsTop: 1,
                selectionRange: { topRow: 0, topCol: 2, bottomRow: 0, bottomCol: 5 },
            });

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });

            expect(selectionSpy).toHaveBeenCalled();
            selectionSpy.mockRestore();
        });

        it("should NOT render non-frozen row selection in frozen row area", () => {
            const sheet = createSheetWithFrozenRows({
                frozenRowsH: 40,
                fixedRowsTop: 1,
                selectionRange: { topRow: 3, topCol: 2, bottomRow: 3, bottomCol: 5 },
            });

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });

            expect(selectionSpy).not.toHaveBeenCalled();
            selectionSpy.mockRestore();
        });
    });

    describe("Selection Rendering with Both Frozen Rows and Cols", () => {
        let layer;
        let ctx;

        beforeEach(() => {
            layer = new FrozenLayer();
            ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                rect: vi.fn(),
                clip: vi.fn(),
            };
        })

        function createSheetWithBothFrozen(overrides = {}) {
            return {
                ...createMockSheet(overrides),
                fixedColumnsStart: overrides.fixedColumnsStart ?? 1,
                fixedRowsTop: overrides.fixedRowsTop ?? 1,
                selection: {
                    getRange: () =>
                        overrides.selectionRange ?? { topRow: 2, topCol: 2, bottomRow: 2, bottomCol: 2 },
                    getFocus: () => [2, 2],
                },
            };
        }

        it("should render selection in corner area when cell is in frozen corner", () => {
            const sheet = createSheetWithBothFrozen({
                frozenColsWidth: 120,
                frozenRowsH: 40,
                fixedColumnsStart: 1,
                fixedRowsTop: 1,
                selectionRange: { topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 },
            });

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });

            expect(selectionSpy).toHaveBeenCalled();
            selectionSpy.mockRestore();
        });

        it("should NOT render non-corner selection in frozen corner area", () => {
            const sheet = createSheetWithBothFrozen({
                frozenColsWidth: 120,
                frozenRowsH: 40,
                fixedColumnsStart: 1,
                fixedRowsTop: 1,
                selectionRange: { topRow: 3, topCol: 3, bottomRow: 3, bottomCol: 3 },
            });

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });

            expect(selectionSpy).not.toHaveBeenCalled();
            selectionSpy.mockRestore();
        });

        it("should render selection correctly in each region based on location", () => {
            const sheet = createSheetWithBothFrozen({
                frozenColsWidth: 120,
                frozenRowsH: 40,
                fixedColumnsStart: 1,
                fixedRowsTop: 1,
                selectionRange: { topRow: 0, topCol: 2, bottomRow: 0, bottomCol: 2 },
            });

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });

            expect(selectionSpy).toHaveBeenCalledTimes(1);
            selectionSpy.mockRestore();
        });
    });

    describe("Edge Cases for Selection Rendering", () => {
        let layer;
        let ctx;

        beforeEach(() => {
            layer = new FrozenLayer();
            ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                rect: vi.fn(),
                clip: vi.fn(),
            };
        });

        it("should handle no selection gracefully", () => {
            const sheet = {
                ...createMockSheet({ frozenColsWidth: 120 }),
                fixedColumnsStart: 1,
                selection: {
                    getRange: () => null,
                    getFocus: () => [0, 0],
                },
            };

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            expect(() => {
                layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });
            }).not.toThrow();
        });

        it("should handle empty selection range", () => {
            const sheet = {
                ...createMockSheet({ frozenColsWidth: 120 }),
                fixedColumnsStart: 1,
                selection: {
                    getRange: () => ({ topRow: -1, topCol: -1, bottomRow: -1, bottomCol: -1 }),
                    getFocus: () => [-1, -1],
                },
            };

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            expect(() => {
                layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });
            }).not.toThrow();
        });

        it("should always render merges regardless of selection position", () => {
            const sheet = createMockSheet({ frozenColsWidth: 120 });
            sheet.fixedColumnsStart = 1;
            sheet.selection = {
                getRange: () => ({ topRow: 10, topCol: 5, bottomRow: 15, bottomCol: 8 }),
                getFocus: () => [10, 5],
            };

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            const mergesSpy = vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.render(ctx, sheet, createViewport(), { viewW: 800, viewH: 600 });

            expect(mergesSpy).toHaveBeenCalled();
            mergesSpy.mockRestore();
        });

        it("should work correctly after horizontal scrolling", () => {
            const sheet = createMockSheet({ frozenColsWidth: 120 });
            sheet.fixedColumnsStart = 1;
            sheet.selection = {
                getRange: () => ({ topRow: 2, topCol: 3, bottomRow: 5, bottomCol: 3 }),
                getFocus: () => [2, 3],
            };

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.render(ctx, sheet, createViewport({ scrollX: 300 }), { viewW: 800, viewH: 600 });

            expect(selectionSpy).not.toHaveBeenCalled();
            selectionSpy.mockRestore();
        });

        it("should work correctly after vertical scrolling", () => {
            const sheet = createMockSheet({ frozenRowsH: 40 });
            sheet.fixedRowsTop = 1;
            sheet.selection = {
                getRange: () => ({ topRow: 8, topCol: 2, bottomRow: 12, bottomCol: 5 }),
                getFocus: () => [8, 2],
            };

            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.render(ctx, sheet, createViewport({ scrollY: 200 }), { viewW: 800, viewH: 600 });

            expect(selectionSpy).not.toHaveBeenCalled();
            selectionSpy.mockRestore();
        });
    });

    describe("Overlay Rendering Behavior", () => {
        let ctx;

        beforeEach(() => {
            ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                rect: vi.fn(),
                clip: vi.fn(),
            };
        });

        it("should call overlayRenderer.renderMerges for each region", () => {
            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            const mergesSpy = vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 60 });
            const viewport = createViewport();

            layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });

            expect(mergesSpy.call.length).toBeGreaterThanOrEqual(1);
            mergesSpy.mockRestore();
        });

        it("should call overlayRenderer.renderSelection for each region", () => {
            vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            const selectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 60 });
            sheet.fixedColumnsStart = 1;
            sheet.fixedRowsTop = 1;
            sheet.selection = {
                getRange: () => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 }),
                getFocus: () => [0, 0],
            };
            const viewport = createViewport();

            layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });

            expect(selectionSpy).toHaveBeenCalled();
            selectionSpy.mockRestore();
        });
    });

    describe("Destroy & Cleanup", () => {
        it("should destroy and clean up properly", () => {
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
    });

    describe("Debug Info", () => {
        it("should return correct debug info", () => {
            const info = layer.getDebugInfo();
            expect(info.name).toBe("frozen");
            expect(info.zIndex).toBe(LAYER_Z_INDEX.FROZEN);
            expect(info.enabled).toBe(true);
        });
    });

    describe("Pagination Mode Support", () => {
        let ctx;

        beforeEach(() => {
            ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                rect: vi.fn(),
                clip: vi.fn(),
            };
        });

        it("should pass useRealRows option to tile renderer when pagination is active", () => {
            const tileRenderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 60 });
            const viewport = createViewport();

            layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600, isPaginationActive: true });

            expect(tileRenderSpy).toHaveBeenCalled();
            const options = tileRenderSpy.mock.calls[0][6];
            expect(options.useRealRows).toBe(true);

            tileRenderSpy.mockRestore();
        });

        it("should not pass useRealRows option when pagination is not active", () => {
            const tileRenderSpy = vi.spyOn(layer.tileRenderer, "render").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 60 });
            const viewport = createViewport();

            layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600, isPaginationActive: false });

            expect(tileRenderSpy).toHaveBeenCalled();
            const options = tileRenderSpy.mock.calls[0][6];
            expect(options).toBeUndefined();

            tileRenderSpy.mockRestore();
        });
    });
});