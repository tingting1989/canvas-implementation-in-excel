import { describe, it, expect, vi, beforeEach } from "vitest";
import { InteractionLayer } from "../../../src/render/layers/InteractionLayer.js";
import { HIT_TYPE } from "../../../src/constants/hitType.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";
import { LAYER_Z_INDEX } from "../../../src/constants/layerZIndex.js";

function createMockSheet(overrides = {}) {
    return {
        frozenColsWidth: 0,
        frozenRowsHeight: 0,
        getHeaderWidth: vi.fn(() => 50),
        getHeaderHeight: vi.fn(() => 25),
        getMerge: vi.fn(() => null),
        ...overrides,
    };
}

describe("InteractionLayer", () => {
    let layer;

    beforeEach(() => {
        layer = new InteractionLayer();
    });

    it("should have name 'interaction' and correct zIndex", () => {
        expect(layer.name).toBe("interaction");
        expect(layer.zIndex).toBe(LAYER_Z_INDEX.INTERACTION);
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

    it("should have debugMode false by default", () => {
        expect(layer.debugMode).toBe(false);
    });

    describe("ResizeLine API", () => {
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
    });

    describe("Freeze Lines Rendering", () => {
        it("should render but not draw freeze lines when no frozen area", () => {
            const ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                stroke: vi.fn(),
            };
            const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsHeight: 0 });
            layer.render(ctx, sheet, {}, { viewW: 800, viewH: 600 });

            expect(ctx.beginPath).not.toHaveBeenCalled();
            expect(layer.renderCount).toBe(1);
        });

        it("should draw vertical freeze line when frozenColsWidth > 0", () => {
            const ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                stroke: vi.fn(),
                strokeStyle: "",
                lineWidth: 0,
            };
            const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsHeight: 0 });
            layer.render(ctx, sheet, {}, { viewW: 800, viewH: 600 });

            expect(ctx.save).toHaveBeenCalled();
            expect(ctx.strokeStyle).toBe("#217346");
            expect(ctx.lineWidth).toBe(2);
            expect(ctx.beginPath).toHaveBeenCalled();
            expect(ctx.moveTo).toHaveBeenCalledWith(50 + 120, 25);
            expect(ctx.lineTo).toHaveBeenCalledWith(50 + 120, 600);
            expect(ctx.stroke).toHaveBeenCalled();
            expect(ctx.restore).toHaveBeenCalled();
        });

        it("should draw horizontal freeze line when frozenRowsHeight > 0", () => {
            const ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                stroke: vi.fn(),
                strokeStyle: "",
                lineWidth: 0,
            };
            const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsHeight: 60 });
            layer.render(ctx, sheet, {}, { viewW: 800, viewH: 600 });

            expect(ctx.beginPath).toHaveBeenCalled();
            expect(ctx.moveTo).toHaveBeenCalledWith(50, 25 + 60);
            expect(ctx.lineTo).toHaveBeenCalledWith(800, 25 + 60);
        });
    });

    describe("Resize Line Rendering", () => {
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

            layer.render(ctx, createMockSheet(), {}, { viewW: 800, viewH: 600 });
            expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
            expect(ctx.moveTo).toHaveBeenCalledWith(300, 0);
            expect(ctx.lineTo).toHaveBeenCalledWith(300, 600);
            expect(ctx.stroke).toHaveBeenCalled();
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

            layer.render(ctx, createMockSheet(), {}, { viewW: 800, viewH: 600 });
            expect(ctx.moveTo).toHaveBeenCalledWith(0, 250);
            expect(ctx.lineTo).toHaveBeenCalledWith(800, 250);
        });
    });

    describe("Editor Rendering", () => {
        it("should skip editor render when editor is not visible", () => {
            const store = new ReactiveStore({
                editor: { visible: false, row: -1, col: -1, value: "" },
                scroll: { x: 0, y: 0 },
                frozenOffset: { colsWidth: 0, rowsHeight: 0 },
                frozen: { rows: 0, cols: 0 },
                selection: { ranges: [], activeRange: null },
            });
            layer.bindStore(store);

            const ctx = { save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn(), fillRect: vi.fn() };
            layer.render(ctx, createMockSheet(), {}, { viewW: 800, viewH: 600 });
            expect(ctx.strokeRect).not.toHaveBeenCalled();
        });

        it("should render editor highlight when editor is visible", () => {
            const store = new ReactiveStore({
                editor: { visible: true, row: 2, col: 3, value: "test" },
                scroll: { x: 0, y: 0 },
                frozenOffset: { colsWidth: 0, rowsHeight: 0 },
                frozen: { rows: 0, cols: 0 },
                selection: { ranges: [], activeRange: null },
            });
            layer.bindStore(store);

            const ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                strokeStyle: "",
                lineWidth: 0,
                fillStyle: "",
                strokeRect: vi.fn(),
                fillRect: vi.fn(),
            };

            const sheet = createMockSheet();
            const viewport = { cellToViewRect: () => ({ x: 200, y: 100, w: 80, h: 28 }) };

            layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });
            expect(ctx.strokeRect).toHaveBeenCalledWith(200, 100, 80, 28);
            expect(ctx.fillRect).toHaveBeenCalledWith(200, 100, 80, 28);
        });
    });

    describe("Debug Mode", () => {
        it("should render debug info when debugMode is true", () => {
            layer.debugMode = true;
            const ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                fillText: vi.fn(),
            };
            const sheet = createMockSheet();
            const options = { viewW: 800, viewH: 600, layers: [layer] };

            layer.render(ctx, sheet, {}, options);

            expect(ctx.fillText).toHaveBeenCalled();
        });

        it("should not render debug info when debugMode is false", () => {
            const ctx = {
                save: vi.fn(),
                restore: vi.fn(),
                fillText: vi.fn(),
            };
            const sheet = createMockSheet();
            const options = { viewW: 800, viewH: 600, layers: [layer] };

            layer.render(ctx, sheet, {}, options);

            expect(ctx.fillText).not.toHaveBeenCalled();
        });
    });

    describe("Store Binding", () => {
        it("should bind store and watch scroll, frozenOffset, frozen, editor, selection", () => {
            const store = new ReactiveStore({
                scroll: { x: 0, y: 0 },
                frozenOffset: { colsWidth: 0, rowsHeight: 0 },
                frozen: { rows: 0, cols: 0 },
                editor: { visible: false, row: -1, col: -1, value: "" },
                selection: { ranges: [], activeRange: null },
            });
            layer.bindStore(store);
            layer.clearDirty();

            store.state.scroll.x = 100;
            store.flush();
            expect(layer.dirty).toBe(true);
        });

        it("should mark dirty on editor change", () => {
            const store = new ReactiveStore({
                scroll: { x: 0, y: 0 },
                frozenOffset: { colsWidth: 0, rowsHeight: 0 },
                frozen: { rows: 0, cols: 0 },
                editor: { visible: false, row: -1, col: -1, value: "" },
                selection: { ranges: [], activeRange: null },
            });
            layer.bindStore(store);
            layer.clearDirty();

            store.state.editor.visible = true;
            store.flush();
            expect(layer.dirty).toBe(true);
        });
    });

    it("should skip render when disabled", () => {
        layer.disable();
        const ctx = { save: vi.fn(), restore: vi.fn() };
        layer.render(ctx, createMockSheet(), {}, { viewW: 800, viewH: 600 });
        expect(layer.renderCount).toBe(0);
    });

    it("should destroy and clean up", () => {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            frozen: { rows: 0, cols: 0 },
            editor: { visible: false, row: -1, col: -1, value: "" },
            selection: { ranges: [], activeRange: null },
        });
        layer.bindStore(store);
        layer.destroy();
        expect(layer.getStore()).toBeNull();
        expect(layer.renderCount).toBe(0);
    });

    it("should return correct debug info", () => {
        const info = layer.getDebugInfo();
        expect(info.name).toBe("interaction");
        expect(info.zIndex).toBe(LAYER_Z_INDEX.INTERACTION);
        expect(info.enabled).toBe(true);
    });
});