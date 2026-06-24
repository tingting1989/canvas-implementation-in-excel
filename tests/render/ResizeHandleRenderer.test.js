import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResizeHandleRenderer } from "@/render/ResizeHandleRenderer";
import { HIT_TYPE } from "@/constants/hitType";
import { CONFIG } from "@/constants/config";

function createMockCtx() {
    return {
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
}

describe("ResizeHandleRenderer - setResizeLine", () => {
    it("should set resize line state", () => {
        const renderer = new ResizeHandleRenderer();
        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 3, 150);
        const state = renderer.getResizeLine();
        expect(state).toEqual({ type: HIT_TYPE.COL_RESIZE, index: 3, position: 150 });
    });

    it("should clear resize line when type is null", () => {
        const renderer = new ResizeHandleRenderer();
        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 3, 150);
        renderer.setResizeLine(null, 0, 0);
        expect(renderer.getResizeLine()).toBeNull();
    });

    it("should overwrite previous state", () => {
        const renderer = new ResizeHandleRenderer();
        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 3, 150);
        renderer.setResizeLine(HIT_TYPE.ROW_RESIZE, 5, 200);
        const state = renderer.getResizeLine();
        expect(state.type).toBe(HIT_TYPE.ROW_RESIZE);
        expect(state.index).toBe(5);
    });
});

describe("ResizeHandleRenderer - clearResizeLine", () => {
    it("should clear resize line state", () => {
        const renderer = new ResizeHandleRenderer();
        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 3, 150);
        renderer.clearResizeLine();
        expect(renderer.getResizeLine()).toBeNull();
    });

    it("should be safe to call when no state", () => {
        const renderer = new ResizeHandleRenderer();
        expect(() => renderer.clearResizeLine()).not.toThrow();
    });
});

describe("ResizeHandleRenderer - render", () => {
    it("should not render when no resize line", () => {
        const renderer = new ResizeHandleRenderer();
        const ctx = createMockCtx();
        renderer.render(ctx, 800, 600);
        expect(ctx.save).not.toHaveBeenCalled();
    });

    it("should render vertical line for COL_RESIZE", () => {
        const renderer = new ResizeHandleRenderer();
        const ctx = createMockCtx();
        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 3, 200);
        renderer.render(ctx, 800, 600);
        expect(ctx.save).toHaveBeenCalled();
        expect(ctx.moveTo).toHaveBeenCalledWith(200, 0);
        expect(ctx.lineTo).toHaveBeenCalledWith(200, 600);
        expect(ctx.stroke).toHaveBeenCalled();
        expect(ctx.restore).toHaveBeenCalled();
    });

    it("should render horizontal line for ROW_RESIZE", () => {
        const renderer = new ResizeHandleRenderer();
        const ctx = createMockCtx();
        renderer.setResizeLine(HIT_TYPE.ROW_RESIZE, 5, 300);
        renderer.render(ctx, 800, 600);
        expect(ctx.moveTo).toHaveBeenCalledWith(0, 300);
        expect(ctx.lineTo).toHaveBeenCalledWith(800, 300);
    });

    it("should use dashed line style", () => {
        const renderer = new ResizeHandleRenderer();
        const ctx = createMockCtx();
        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 3, 200);
        renderer.render(ctx, 800, 600);
        expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
    });

    it("should use selection color", () => {
        const renderer = new ResizeHandleRenderer();
        const ctx = createMockCtx();
        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 3, 200);
        renderer.render(ctx, 800, 600);
        expect(ctx.strokeStyle).toBe(CONFIG.SELECTION_COLOR);
    });

    it("should set line width to 2", () => {
        const renderer = new ResizeHandleRenderer();
        const ctx = createMockCtx();
        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 3, 200);
        renderer.render(ctx, 800, 600);
        expect(ctx.lineWidth).toBe(2);
    });
});

describe("ResizeHandleRenderer - render then clear", () => {
    it("should not render after clear", () => {
        const renderer = new ResizeHandleRenderer();
        const ctx = createMockCtx();
        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 3, 200);
        renderer.clearResizeLine();
        renderer.render(ctx, 800, 600);
        expect(ctx.save).not.toHaveBeenCalled();
    });
});