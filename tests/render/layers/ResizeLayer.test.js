import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResizeLayer } from "../../../src/render/layers/ResizeLayer.js";
import { HIT_TYPE } from "../../../src/constants/hitType.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";

describe("ResizeLayer", () => {
    let layer;

    beforeEach(() => {
        layer = new ResizeLayer();
    });

    it("should have name 'resize' and zIndex 3", () => {
        expect(layer.name).toBe("resize");
        expect(layer.zIndex).toBe(3);
    });

    it("should be dirty on construction", () => {
        expect(layer.dirty).toBe(true);
    });

    it("should be enabled on construction", () => {
        expect(layer.enabled).toBe(true);
    });

    it("should start with no resize line", () => {
        expect(layer.getResizeLine()).toBeNull();
    });

    it("should set column resize line", () => {
        layer.setResizeLine(HIT_TYPE.COL_RESIZE, 2, 150);
        const line = layer.getResizeLine();
        expect(line).not.toBeNull();
        expect(line.type).toBe(HIT_TYPE.COL_RESIZE);
        expect(line.index).toBe(2);
        expect(line.position).toBe(150);
        expect(layer.dirty).toBe(true);
    });

    it("should set row resize line", () => {
        layer.setResizeLine(HIT_TYPE.ROW_RESIZE, 3, 200);
        const line = layer.getResizeLine();
        expect(line).not.toBeNull();
        expect(line.type).toBe(HIT_TYPE.ROW_RESIZE);
        expect(line.index).toBe(3);
        expect(line.position).toBe(200);
    });

    it("should clear resize line", () => {
        layer.setResizeLine(HIT_TYPE.COL_RESIZE, 0, 100);
        layer.clearResizeLine();
        expect(layer.getResizeLine()).toBeNull();
        expect(layer.dirty).toBe(true);
    });

    it("should replace existing resize line", () => {
        layer.setResizeLine(HIT_TYPE.COL_RESIZE, 0, 100);
        layer.setResizeLine(HIT_TYPE.ROW_RESIZE, 1, 200);
        const line = layer.getResizeLine();
        expect(line.type).toBe(HIT_TYPE.ROW_RESIZE);
        expect(line.position).toBe(200);
    });

    it("should clear resize line when type is null/undefined", () => {
        layer.setResizeLine(HIT_TYPE.COL_RESIZE, 0, 100);
        layer.setResizeLine(null, 0, 0);
        expect(layer.getResizeLine()).toBeNull();
    });

    it("should render column resize line", () => {
        layer.setResizeLine(HIT_TYPE.COL_RESIZE, 0, 300);
        layer.clearDirty();

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            strokeStyle: "",
            lineWidth: 0,
            setLineDash: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
        };

        layer.render(ctx, {}, {}, { viewW: 800, viewH: 600 });
        expect(ctx.save).toHaveBeenCalled();
        expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
        expect(ctx.beginPath).toHaveBeenCalled();
        expect(ctx.moveTo).toHaveBeenCalledWith(300, 0);
        expect(ctx.lineTo).toHaveBeenCalledWith(300, 600);
        expect(ctx.stroke).toHaveBeenCalled();
        expect(ctx.restore).toHaveBeenCalled();
        expect(layer.renderCount).toBe(1);
    });

    it("should render row resize line", () => {
        layer.setResizeLine(HIT_TYPE.ROW_RESIZE, 0, 250);
        layer.clearDirty();

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            strokeStyle: "",
            lineWidth: 0,
            setLineDash: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
        };

        layer.render(ctx, {}, {}, { viewW: 800, viewH: 600 });
        expect(ctx.moveTo).toHaveBeenCalledWith(0, 250);
        expect(ctx.lineTo).toHaveBeenCalledWith(800, 250);
    });

    it("should skip render when disabled", () => {
        layer.setResizeLine(HIT_TYPE.COL_RESIZE, 0, 300);
        layer.disable();

        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
        };

        layer.render(ctx, {}, {}, { viewW: 800, viewH: 600 });
        expect(ctx.save).not.toHaveBeenCalled();
        expect(layer.renderCount).toBe(0);
    });

    it("should skip render when no resize line", () => {
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
        };

        layer.render(ctx, {}, {}, { viewW: 800, viewH: 600 });
        expect(ctx.save).not.toHaveBeenCalled();
        expect(layer.renderCount).toBe(0);
    });

    it("should bind store and watch scroll and frozenOffset", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.scroll.x = 100;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should mark dirty on frozenOffset change", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.frozenOffset.colsWidth = 100;
        store.flush();
        expect(layer.dirty).toBe(true);
    });
});