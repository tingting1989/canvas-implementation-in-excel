import { describe, it, expect, vi, beforeEach } from "vitest";
import { SelectionLayer } from "../../../src/render/layers/SelectionLayer.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";
import { LAYER_Z_INDEX } from "../../../src/constants/layerZIndex.js";

describe("SelectionLayer", () => {
    let layer;

    beforeEach(() => {
        layer = new SelectionLayer();
    });

    it("should have name 'selection' and correct zIndex", () => {
        expect(layer.name).toBe("selection");
        expect(layer.zIndex).toBe(LAYER_Z_INDEX.SELECTION);
    });

    it("should be offscreen=false", () => {
        expect(layer.offscreen).toBe(false);
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

    it("should bind store and watch selection, frozenOffset, frozen, scroll, viewport", () => {
        const store = new ReactiveStore({
            selection: { ranges: [], activeRange: null },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            frozen: { rows: 0, cols: 0 },
            scroll: { x: 0, y: 0 },
            viewport: { width: 800, height: 600 },
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
            frozen: { rows: 0, cols: 0 },
            scroll: { x: 0, y: 0 },
            viewport: { width: 800, height: 600 },
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

    it("should render overlay when enabled", () => {
        const renderMergesSpy = vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
        const renderSelectionSpy = vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

        const ctx = {};
        const sheet = { frozenColsWidth: 0, frozenRowsHeight: 0, getHeaderWidth: () => 0, getHeaderHeight: () => 0 };
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(renderMergesSpy).toHaveBeenCalledWith(ctx, sheet, viewport);
        expect(renderSelectionSpy).toHaveBeenCalledWith(ctx, sheet, viewport, 800, 600);
        expect(layer.renderCount).toBe(1);

        renderMergesSpy.mockRestore();
        renderSelectionSpy.mockRestore();
    });

    it("should destroy and clean up", () => {
        const store = new ReactiveStore({
            selection: { ranges: [], activeRange: null },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            frozen: { rows: 0, cols: 0 },
            scroll: { x: 0, y: 0 },
            viewport: { width: 800, height: 600 },
        });
        layer.bindStore(store);
        layer.destroy();
        expect(layer.getStore()).toBeNull();
        expect(layer.renderCount).toBe(0);
    });

    it("should return correct debug info", () => {
        const info = layer.getDebugInfo();
        expect(info.name).toBe("selection");
        expect(info.zIndex).toBe(LAYER_Z_INDEX.SELECTION);
        expect(info.enabled).toBe(true);
    });

    describe("DragIndicator API", () => {
        it("should start with no column move state", () => {
            expect(layer.hasColumnMove()).toBe(false);
        });

        it("should start with no row move state", () => {
            expect(layer.hasRowMove()).toBe(false);
        });

        it("should set column move state and mark dirty", () => {
            layer.clearDirty();
            layer.setColumnMoveState({
                sourceCol: 2,
                targetCol: 5,
                dragX: 300,
                dragStartX: 100,
                colW: 80,
            });
            expect(layer.hasColumnMove()).toBe(true);
            expect(layer.isColumnSource(2)).toBe(true);
            expect(layer.isColumnSource(3)).toBe(false);
            expect(layer.dirty).toBe(true);
        });

        it("should set row move state and mark dirty", () => {
            layer.clearDirty();
            layer.setRowMoveState({
                sourceRow: 3,
                targetRow: 7,
                dragY: 250,
                dragStartY: 80,
                rowH: 28,
            });
            expect(layer.hasRowMove()).toBe(true);
            expect(layer.isRowSource(3)).toBe(true);
            expect(layer.isRowSource(4)).toBe(false);
            expect(layer.dirty).toBe(true);
        });

        it("should clear column move state with null", () => {
            layer.setColumnMoveState({ sourceCol: 2, targetCol: 5, dragX: 300, dragStartX: 100, colW: 80 });
            layer.setColumnMoveState(null);
            expect(layer.hasColumnMove()).toBe(false);
            expect(layer.isColumnSource(2)).toBe(false);
        });

        it("should clear row move state with null", () => {
            layer.setRowMoveState({ sourceRow: 3, targetRow: 7, dragY: 250, dragStartY: 80, rowH: 28 });
            layer.setRowMoveState(null);
            expect(layer.hasRowMove()).toBe(false);
            expect(layer.isRowSource(3)).toBe(false);
        });

        it("should handle both column and row move states simultaneously", () => {
            layer.setColumnMoveState({ sourceCol: 2, targetCol: 5, dragX: 300, dragStartX: 100, colW: 80 });
            layer.setRowMoveState({ sourceRow: 3, targetRow: 7, dragY: 250, dragStartY: 80, rowH: 28 });
            expect(layer.hasColumnMove()).toBe(true);
            expect(layer.hasRowMove()).toBe(true);
        });
    });

    describe("Column Move Rendering", () => {
        it("should render column move indicator", () => {
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.setColumnMoveState({
                sourceCol: 2,
                targetCol: 5,
                dragX: 300,
                dragStartX: 100,
                colW: 80,
            });

            const ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                fillStyle: "",
                strokeStyle: "",
                lineWidth: 0,
                font: "",
                textAlign: "",
                textBaseline: "",
                fillRect: vi.fn(),
                strokeRect: vi.fn(),
                fillText: vi.fn(),
            };

            const sheet = {
                frozenColsWidth: 0,
                frozenRowsHeight: 0,
                getHeaderWidth: () => 0,
                getHeaderHeight: () => 0,
                getDefaultStyle: () => ({}),
                getColHeader: () => "C",
            };
            const viewport = {
                headerW: 46,
                headerH: 28,
                colToViewX: () => 100,
                colRightToViewX: () => 500,
            };

            layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });
            expect(ctx.save).toHaveBeenCalled();
            expect(ctx.fillRect).toHaveBeenCalled();
            expect(ctx.restore).toHaveBeenCalled();
            expect(layer.renderCount).toBe(1);
        });
    });

    describe("Row Move Rendering", () => {
        it("should render row move indicator", () => {
            vi.spyOn(layer.overlayRenderer, "renderMerges").mockImplementation(() => {});
            vi.spyOn(layer.overlayRenderer, "renderSelection").mockImplementation(() => {});

            layer.setRowMoveState({
                sourceRow: 3,
                targetRow: 7,
                dragY: 250,
                dragStartY: 80,
                rowH: 28,
            });

            const ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                fillStyle: "",
                strokeStyle: "",
                lineWidth: 0,
                font: "",
                textAlign: "",
                textBaseline: "",
                fillRect: vi.fn(),
                strokeRect: vi.fn(),
                fillText: vi.fn(),
            };

            const sheet = {
                frozenColsWidth: 0,
                frozenRowsHeight: 0,
                getHeaderWidth: () => 0,
                getHeaderHeight: () => 0,
                getDefaultStyle: () => ({}),
            };
            const viewport = {
                headerW: 46,
                headerH: 28,
                rowToViewY: () => 80,
                rowBottomToViewY: () => 300,
            };

            layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });
            expect(ctx.save).toHaveBeenCalled();
            expect(ctx.fillRect).toHaveBeenCalled();
            expect(ctx.restore).toHaveBeenCalled();
            expect(layer.renderCount).toBe(1);
        });
    });
});