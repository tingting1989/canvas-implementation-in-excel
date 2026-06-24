import { describe, it, expect, vi, beforeEach } from "vitest";
import { UILayer } from "../../../src/render/layers/UILayer.js";
import { ReactiveStore } from "../../../src/state/ReactiveStore.js";

function createMockSheet(overrides = {}) {
    return {
        frozenColsWidth: 0,
        frozenRowsH: 0,
        getHeaderWidth: vi.fn(() => 50),
        getHeaderHeight: vi.fn(() => 25),
        ...overrides,
    };
}

describe("UILayer", () => {
    let layer;

    beforeEach(() => {
        layer = new UILayer();
    });

    it("should have name 'ui' and zIndex 7", () => {
        expect(layer.name).toBe("ui");
        expect(layer.zIndex).toBe(7);
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

    it("should bind store and watch frozenOffset and editor", () => {
        const store = new ReactiveStore({
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            editor: { visible: false, row: -1, col: -1, value: "" },
        });
        layer.bindStore(store);

        layer.clearDirty();

        store.state.frozenOffset.colsWidth = 100;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should mark dirty on editor change", () => {
        const store = new ReactiveStore({
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            editor: { visible: false, row: -1, col: -1, value: "" },
        });
        layer.bindStore(store);
        layer.clearDirty();

        store.state.editor.visible = true;
        store.flush();
        expect(layer.dirty).toBe(true);
    });

    it("should skip render when disabled", () => {
        layer.disable();
        const ctx = { save: vi.fn(), restore: vi.fn() };
        layer.render(ctx, createMockSheet(), {}, { viewW: 800, viewH: 600 });
        expect(layer.renderCount).toBe(0);
    });

    it("should render but not draw freeze lines when no frozen area", () => {
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

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
        };
        const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 0 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(ctx.save).toHaveBeenCalled();
        expect(ctx.strokeStyle).toBe("#217346");
        expect(ctx.lineWidth).toBe(2);
        expect(ctx.beginPath).toHaveBeenCalled();
        expect(ctx.moveTo).toHaveBeenCalledWith(50 + 120, 25);
        expect(ctx.lineTo).toHaveBeenCalledWith(50 + 120, 600);
        expect(ctx.stroke).toHaveBeenCalled();
        expect(ctx.restore).toHaveBeenCalled();
        expect(layer.renderCount).toBe(1);
    });

    it("should draw horizontal freeze line when frozenRowsH > 0", () => {
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 60 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(ctx.beginPath).toHaveBeenCalled();
        expect(ctx.moveTo).toHaveBeenCalledWith(50, 25 + 60);
        expect(ctx.lineTo).toHaveBeenCalledWith(800, 25 + 60);
        expect(ctx.stroke).toHaveBeenCalled();
        expect(layer.renderCount).toBe(1);
    });

    it("should draw both freeze lines when both frozen rows and cols exist", () => {
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 120, frozenRowsH: 60 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(ctx.moveTo).toHaveBeenCalledTimes(2);
        expect(ctx.lineTo).toHaveBeenCalledTimes(2);
        expect(layer.renderCount).toBe(1);
    });

    it("should render debug info when debugMode is true", () => {
        layer.debugMode = true;
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fillText: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600, layers: [layer] };

        layer.render(ctx, sheet, viewport, options);

        expect(ctx.fillText).toHaveBeenCalled();
        const firstTextCall = ctx.fillText.mock.calls[0][0];
        expect(firstTextCall).toContain("UILayer Debug");
        expect(layer.renderCount).toBe(1);
    });

    it("should not render debug info when debugMode is false", () => {
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            fillText: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600, layers: [layer] };

        layer.render(ctx, sheet, viewport, options);

        expect(ctx.fillText).not.toHaveBeenCalled();
    });

    it("should display layer info in debug panel", () => {
        layer.debugMode = true;
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            fillText: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = {};
        const mockLayer = {
            name: "test",
            zIndex: 1,
            dirty: true,
            renderCount: 5,
            getDebugInfo: () => ({ name: "test", zIndex: 1, enabled: true, dirty: true }),
        };
        const options = { viewW: 800, viewH: 600, layers: [mockLayer] };

        layer.render(ctx, sheet, viewport, options);

        const allText = ctx.fillText.mock.calls.map((c) => c[0]).join(" ");
        expect(allText).toContain("test");
        expect(allText).toContain("DIRTY");
    });

    it("should destroy and clean up", () => {
        const store = new ReactiveStore({
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            editor: { visible: false, row: -1, col: -1, value: "" },
        });
        layer.bindStore(store);
        layer.watch("frozenOffset", () => {});
        layer.destroy();
        expect(layer.getStore()).toBeNull();
        expect(layer.renderCount).toBe(0);
    });

    it("should return correct debug info", () => {
        const info = layer.getDebugInfo();
        expect(info.name).toBe("ui");
        expect(info.zIndex).toBe(7);
        expect(info.enabled).toBe(true);
    });

    it("should draw freeze lines with correct style", () => {
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 100, frozenRowsH: 40 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(ctx.strokeStyle).toBe("#217346");
        expect(ctx.lineWidth).toBe(2);
    });

    it("should draw vertical freeze line at correct position", () => {
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 200, frozenRowsH: 0 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(ctx.moveTo).toHaveBeenCalledWith(50 + 200, 25);
        expect(ctx.lineTo).toHaveBeenCalledWith(50 + 200, 600);
    });

    it("should draw horizontal freeze line at correct position", () => {
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 80 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(ctx.moveTo).toHaveBeenCalledWith(50, 25 + 80);
        expect(ctx.lineTo).toHaveBeenCalledWith(800, 25 + 80);
    });

    it("should not draw freeze lines when only header exists", () => {
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        expect(ctx.beginPath).not.toHaveBeenCalled();
        expect(ctx.stroke).not.toHaveBeenCalled();
    });

    it("should render debug info with layer count", () => {
        layer.debugMode = true;
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            fillText: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600, layers: [layer] };

        layer.render(ctx, sheet, viewport, options);

        const headerCall = ctx.fillText.mock.calls.find((c) => c[0].includes("Total Layers"));
        expect(headerCall).toBeDefined();
        expect(headerCall[0]).toContain("1");
    });

    it("should render debug info with CLEAN status for clean layers", () => {
        layer.debugMode = true;
        layer.clearDirty();
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            fillText: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = {};
        const mockLayer = {
            name: "test",
            zIndex: 1,
            dirty: false,
            renderCount: 3,
            getDebugInfo: () => ({ name: "test", zIndex: 1, enabled: true, dirty: false }),
        };
        const options = { viewW: 800, viewH: 600, layers: [mockLayer] };

        layer.render(ctx, sheet, viewport, options);

        const allText = ctx.fillText.mock.calls.map((c) => c[0]).join(" ");
        expect(allText).toContain("CLEAN");
    });

    it("should render debug info with red color", () => {
        layer.debugMode = true;
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            fillText: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600, layers: [] };

        layer.render(ctx, sheet, viewport, options);

        expect(ctx.fillStyle).toBe("rgba(255, 0, 0, 0.8)");
    });

    it("should render debug info with monospace font", () => {
        layer.debugMode = true;
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            fillText: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600, layers: [] };

        layer.render(ctx, sheet, viewport, options);

        expect(ctx.font).toBe("12px monospace");
    });

    it("should handle debug mode with no layers in options", () => {
        layer.debugMode = true;
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            fillText: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);

        const headerCall = ctx.fillText.mock.calls.find((c) => c[0].includes("Total Layers: 0"));
        expect(headerCall).toBeDefined();
    });

    it("should handle toggle debugMode on and off", () => {
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fillText: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600, layers: [layer] };

        layer.debugMode = true;
        layer.render(ctx, sheet, viewport, options);
        expect(ctx.fillText).toHaveBeenCalled();

        ctx.fillText.mockClear();
        layer.debugMode = false;
        layer.markDirty();
        layer.render(ctx, sheet, viewport, options);
        expect(ctx.fillText).not.toHaveBeenCalled();
    });

    it("should increment renderCount correctly", () => {
        const ctx = {
            save: vi.fn(),
            restore: vi.fn(),
        };
        const sheet = createMockSheet({ frozenColsWidth: 0, frozenRowsH: 0 });
        const viewport = {};
        const options = { viewW: 800, viewH: 600 };

        layer.render(ctx, sheet, viewport, options);
        layer.render(ctx, sheet, viewport, options);
        layer.render(ctx, sheet, viewport, options);
        expect(layer.renderCount).toBe(3);
    });

    it("should handle destroy with bound store", () => {
        const store = new ReactiveStore({
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            editor: { visible: false, row: -1, col: -1, value: "" },
        });
        layer.bindStore(store);
        layer.watch("frozenOffset", () => {});
        layer.watch("editor", () => {});
        layer.destroy();
        expect(layer.getStore()).toBeNull();
        expect(layer.renderCount).toBe(0);
    });
});