import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorLayer } from "../../../src/render/layers/EditorLayer.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";

describe("EditorLayer", () => {
    let layer;

    beforeEach(() => {
        layer = new EditorLayer();
    });

    it("should have name 'editor' and zIndex 8", () => {
        expect(layer.name).toBe("editor");
        expect(layer.zIndex).toBe(8);
    });

    it("should be dirty on construction", () => {
        expect(layer.dirty).toBe(true);
    });

    it("should be enabled on construction", () => {
        expect(layer.enabled).toBe(true);
    });

    it("should skip render when disabled", () => {
        layer.disable();
        const ctx = { save: vi.fn(), restore: vi.fn() };
        layer.render(ctx, {}, {}, { viewW: 800, viewH: 600 });
        expect(ctx.save).not.toHaveBeenCalled();
        expect(layer.renderCount).toBe(0);
    });

    it("should skip render when editor is not visible", () => {
        const store = new ReactiveStore({
            editor: { visible: false, row: -1, col: -1, value: "" },
            selection: { ranges: [], activeRange: null },
            scroll: { x: 0, y: 0 },
        });
        layer.bindStore(store);

        const ctx = { save: vi.fn(), restore: vi.fn() };
        layer.render(ctx, {}, {}, { viewW: 800, viewH: 600 });
        expect(ctx.save).not.toHaveBeenCalled();
        expect(layer.renderCount).toBe(1);
    });

    it("should skip render when editor row/col is negative", () => {
        const store = new ReactiveStore({
            editor: { visible: true, row: -1, col: -1, value: "" },
            selection: { ranges: [], activeRange: null },
            scroll: { x: 0, y: 0 },
        });
        layer.bindStore(store);

        const ctx = { save: vi.fn(), restore: vi.fn() };
        layer.render(ctx, {}, {}, { viewW: 800, viewH: 600 });
        expect(ctx.save).not.toHaveBeenCalled();
        expect(layer.renderCount).toBe(1);
    });

    it("should render editor highlight when editor is visible", () => {
        const store = new ReactiveStore({
            editor: { visible: true, row: 2, col: 3, value: "test" },
            selection: { ranges: [], activeRange: null },
            scroll: { x: 0, y: 0 },
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

        const sheet = {
            getMerge: () => null,
        };
        const viewport = {
            cellToViewRect: () => ({ x: 200, y: 100, w: 80, h: 28 }),
        };

        layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });
        expect(ctx.save).toHaveBeenCalled();
        expect(ctx.strokeRect).toHaveBeenCalledWith(200, 100, 80, 28);
        expect(ctx.fillRect).toHaveBeenCalledWith(200, 100, 80, 28);
        expect(ctx.restore).toHaveBeenCalled();
        expect(layer.renderCount).toBe(1);
    });

    it("should render merged cell highlight when cell is merged", () => {
        const store = new ReactiveStore({
            editor: { visible: true, row: 0, col: 0, value: "test" },
            selection: { ranges: [], activeRange: null },
            scroll: { x: 0, y: 0 },
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

        const merge = { topRow: 0, topCol: 0, bottomRow: 1, bottomCol: 1 };
        const sheet = {
            getMerge: () => merge,
        };
        const mergeToViewRect = vi.fn(() => ({ x: 0, y: 0, w: 160, h: 56 }));
        const viewport = {
            mergeToViewRect,
        };

        layer.render(ctx, sheet, viewport, { viewW: 800, viewH: 600 });
        expect(mergeToViewRect).toHaveBeenCalledWith(merge);
        expect(ctx.strokeRect).toHaveBeenCalledWith(0, 0, 160, 56);
    });

    it("should bind store and watch editor, selection, scroll", () => {
        const store = new ReactiveStore({
            editor: { visible: false, row: -1, col: -1, value: "" },
            selection: { ranges: [], activeRange: null },
            scroll: { x: 0, y: 0 },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.editor.visible = true;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should mark dirty on selection change", () => {
        const store = new ReactiveStore({
            editor: { visible: false, row: -1, col: -1, value: "" },
            selection: { ranges: [], activeRange: null },
            scroll: { x: 0, y: 0 },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.selection.activeRange = { row: 0, col: 0 };
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should mark dirty on scroll change", () => {
        const store = new ReactiveStore({
            editor: { visible: false, row: -1, col: -1, value: "" },
            selection: { ranges: [], activeRange: null },
            scroll: { x: 0, y: 0 },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.scroll.x = 100;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should return correct debug info", () => {
        const info = layer.getDebugInfo();
        expect(info.name).toBe("editor");
        expect(info.zIndex).toBe(80);
        expect(info.enabled).toBe(true);
    });
});