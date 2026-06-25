 import { describe, it, expect, vi, beforeEach } from "vitest";
import { DragIndicatorLayer } from "../../../src/render/layers/DragIndicatorLayer.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";

describe("DragIndicatorLayer", () => {
    let layer;

    beforeEach(() => {
        layer = new DragIndicatorLayer();
    });

    it("should have name 'drag-indicator' and zIndex 6", () => {
        expect(layer.name).toBe("drag-indicator");
        expect(layer.zIndex).toBe(6);
    });

    it("should be dirty on construction", () => {
        expect(layer.dirty).toBe(true);
    });

    it("should be enabled on construction", () => {
        expect(layer.enabled).toBe(true);
    });

    describe("column move state", () => {
        it("should start with no column move state", () => {
            expect(layer.hasColumnMove()).toBe(false);
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

        it("should clear column move state with null", () => {
            layer.setColumnMoveState({
                sourceCol: 2,
                targetCol: 5,
                dragX: 300,
                dragStartX: 100,
                colW: 80,
            });
            layer.setColumnMoveState(null);
            expect(layer.hasColumnMove()).toBe(false);
            expect(layer.isColumnSource(2)).toBe(false);
        });
    });

    describe("row move state", () => {
        it("should start with no row move state", () => {
            expect(layer.hasRowMove()).toBe(false);
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

        it("should clear row move state with null", () => {
            layer.setRowMoveState({
                sourceRow: 3,
                targetRow: 7,
                dragY: 250,
                dragStartY: 80,
                rowH: 28,
            });
            layer.setRowMoveState(null);
            expect(layer.hasRowMove()).toBe(false);
            expect(layer.isRowSource(3)).toBe(false);
        });
    });

    it("should handle both column and row move states simultaneously", () => {
        layer.setColumnMoveState({
            sourceCol: 2,
            targetCol: 5,
            dragX: 300,
            dragStartX: 100,
            colW: 80,
        });
        layer.setRowMoveState({
            sourceRow: 3,
            targetRow: 7,
            dragY: 250,
            dragStartY: 80,
            rowH: 28,
        });
        expect(layer.hasColumnMove()).toBe(true);
        expect(layer.hasRowMove()).toBe(true);
    });

    it("should skip render when disabled", () => {
        layer.setColumnMoveState({
            sourceCol: 2,
            targetCol: 5,
            dragX: 300,
            dragStartX: 100,
            colW: 80,
        });
        layer.disable();

        const ctx = { save: vi.fn(), restore: vi.fn() };
        layer.render(ctx, {}, {}, { viewW: 800, viewH: 600 });
        expect(ctx.save).not.toHaveBeenCalled();
        expect(layer.renderCount).toBe(0);
    });

    it("should skip render when no move state", () => {
        const ctx = { save: vi.fn(), restore: vi.fn() };
        layer.render(ctx, {}, {}, { viewW: 800, viewH: 600 });
        expect(ctx.save).not.toHaveBeenCalled();
        expect(layer.renderCount).toBe(1);
    });

    it("should render column move indicator", () => {
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
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
        };

        const sheet = {
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

    it("should render row move indicator", () => {
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
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
        };

        const sheet = {
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

    it("should bind store and watch scroll, frozen, viewport", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozen: { rows: 0, cols: 0 },
            viewport: { width: 800, height: 600 },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.scroll.x = 100;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should return correct debug info", () => {
        const info = layer.getDebugInfo();
        expect(info.name).toBe("drag-indicator");
        expect(info.zIndex).toBe(60);
        expect(info.enabled).toBe(true);
    });
});