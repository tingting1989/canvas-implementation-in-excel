import { describe, it, expect, vi } from "vitest";
import { DragIndicatorRenderer } from "@/render/DragIndicatorRenderer";

describe("DragIndicatorRenderer - Column Move State", () => {
    it("should set and detect column move state", () => {
        const renderer = new DragIndicatorRenderer();
        expect(renderer.hasColumnMove()).toBe(false);
        renderer.setColumnMoveState({ sourceCol: 2, targetCol: 5, dragX: 300, dragStartX: 200, colW: 100 });
        expect(renderer.hasColumnMove()).toBe(true);
    });

    it("should clear column move state with null", () => {
        const renderer = new DragIndicatorRenderer();
        renderer.setColumnMoveState({ sourceCol: 2, targetCol: 5, dragX: 300, dragStartX: 200, colW: 100 });
        renderer.setColumnMoveState(null);
        expect(renderer.hasColumnMove()).toBe(false);
    });

    it("should identify source column", () => {
        const renderer = new DragIndicatorRenderer();
        renderer.setColumnMoveState({ sourceCol: 2, targetCol: 5, dragX: 300, dragStartX: 200, colW: 100 });
        expect(renderer.isColumnSource(2)).toBe(true);
        expect(renderer.isColumnSource(3)).toBe(false);
    });

    it("isColumnSource should return false when no move active", () => {
        const renderer = new DragIndicatorRenderer();
        expect(renderer.isColumnSource(2)).toBe(false);
    });
});

describe("DragIndicatorRenderer - Row Move State", () => {
    it("should set and detect row move state", () => {
        const renderer = new DragIndicatorRenderer();
        expect(renderer.hasRowMove()).toBe(false);
        renderer.setRowMoveState({ sourceRow: 3, targetRow: 7, dragY: 250, dragStartY: 100, rowH: 28 });
        expect(renderer.hasRowMove()).toBe(true);
    });

    it("should clear row move state with null", () => {
        const renderer = new DragIndicatorRenderer();
        renderer.setRowMoveState({ sourceRow: 3, targetRow: 7, dragY: 250, dragStartY: 100, rowH: 28 });
        renderer.setRowMoveState(null);
        expect(renderer.hasRowMove()).toBe(false);
    });

    it("should identify source row", () => {
        const renderer = new DragIndicatorRenderer();
        renderer.setRowMoveState({ sourceRow: 3, targetRow: 7, dragY: 250, dragStartY: 100, rowH: 28 });
        expect(renderer.isRowSource(3)).toBe(true);
        expect(renderer.isRowSource(4)).toBe(false);
    });

    it("isRowSource should return false when no move active", () => {
        const renderer = new DragIndicatorRenderer();
        expect(renderer.isRowSource(3)).toBe(false);
    });
});

describe("DragIndicatorRenderer - renderColumnMoveIndicator", () => {
    function createMockCtx() {
        return {
            save: vi.fn(),
            restore: vi.fn(),
            fillStyle: "",
            strokeStyle: "",
            lineWidth: 0,
            fillRect: vi.fn(),
            strokeRect: vi.fn(),
            font: "",
            textAlign: "",
            fillText: vi.fn(),
            beginPath: vi.fn(),
        };
    }

    function createMockVT() {
        return {
            headerW: 46,
            headerH: 28,
            colToViewX: vi.fn((col) => col * 100),
            colRightToViewX: vi.fn((col) => (col + 1) * 100),
            rowToViewY: vi.fn(),
            rowBottomToViewY: vi.fn(),
        };
    }

    function createMockSheet() {
        return {
            getDefaultStyle: vi.fn(() => ({})),
            getColHeader: vi.fn((col) => String.fromCharCode(65 + col)),
            getRowHeader: vi.fn((row) => String(row + 1)),
        };
    }

    it("should not render when no column move state", () => {
        const renderer = new DragIndicatorRenderer();
        const ctx = createMockCtx();
        const sheet = createMockSheet();
        const vt = createMockVT();
        renderer.renderColumnMoveIndicator(ctx, sheet, vt, 800, 600);
        expect(ctx.save).not.toHaveBeenCalled();
    });

    it("should render ghost column when move is active", () => {
        const renderer = new DragIndicatorRenderer();
        const ctx = createMockCtx();
        const sheet = createMockSheet();
        const vt = createMockVT();
        renderer.setColumnMoveState({
            sourceCol: 2,
            targetCol: 5,
            dragX: 300,
            dragStartX: 200,
            colW: 100,
        });
        renderer.renderColumnMoveIndicator(ctx, sheet, vt, 800, 600);
        expect(ctx.save).toHaveBeenCalled();
        expect(ctx.fillRect).toHaveBeenCalled();
        expect(ctx.restore).toHaveBeenCalled();
    });

    it("should render ghost column header", () => {
        const renderer = new DragIndicatorRenderer();
        const ctx = createMockCtx();
        const sheet = createMockSheet();
        const vt = createMockVT();
        renderer.setColumnMoveState({
            sourceCol: 2,
            targetCol: 5,
            dragX: 300,
            dragStartX: 200,
            colW: 100,
        });
        renderer.renderColumnMoveIndicator(ctx, sheet, vt, 800, 600);
        expect(sheet.getColHeader).toHaveBeenCalledWith(2);
        expect(ctx.fillText).toHaveBeenCalled();
    });

    it("should render insertion indicator when target differs from source", () => {
        const renderer = new DragIndicatorRenderer();
        const ctx = createMockCtx();
        const sheet = createMockSheet();
        const vt = createMockVT();
        renderer.setColumnMoveState({
            sourceCol: 2,
            targetCol: 5,
            dragX: 300,
            dragStartX: 200,
            colW: 100,
        });
        renderer.renderColumnMoveIndicator(ctx, sheet, vt, 800, 600);
        const fillRectCalls = ctx.fillRect.mock.calls;
        const indicatorCalls = fillRectCalls.filter(
            (call) => call[2] === 3,
        );
        expect(indicatorCalls.length).toBeGreaterThan(0);
    });

    it("should not render insertion indicator when target equals source", () => {
        const renderer = new DragIndicatorRenderer();
        const ctx = createMockCtx();
        const sheet = createMockSheet();
        const vt = createMockVT();
        renderer.setColumnMoveState({
            sourceCol: 2,
            targetCol: 2,
            dragX: 300,
            dragStartX: 200,
            colW: 100,
        });
        renderer.renderColumnMoveIndicator(ctx, sheet, vt, 800, 600);
        const fillRectCalls = ctx.fillRect.mock.calls;
        const indicatorCalls = fillRectCalls.filter(
            (call) => call[2] === 3,
        );
        expect(indicatorCalls.length).toBe(0);
    });
});

describe("DragIndicatorRenderer - renderRowMoveIndicator", () => {
    function createMockCtx() {
        return {
            save: vi.fn(),
            restore: vi.fn(),
            fillStyle: "",
            strokeStyle: "",
            lineWidth: 0,
            fillRect: vi.fn(),
            strokeRect: vi.fn(),
            font: "",
            textAlign: "",
            fillText: vi.fn(),
            beginPath: vi.fn(),
        };
    }

    function createMockVT() {
        return {
            headerW: 46,
            headerH: 28,
            colToViewX: vi.fn(),
            colRightToViewX: vi.fn(),
            rowToViewY: vi.fn((row) => row * 28),
            rowBottomToViewY: vi.fn((row) => (row + 1) * 28),
        };
    }

    function createMockSheet() {
        return {
            getDefaultStyle: vi.fn(() => ({})),
            getColHeader: vi.fn(),
            getRowHeader: vi.fn((row) => String(row + 1)),
        };
    }

    it("should not render when no row move state", () => {
        const renderer = new DragIndicatorRenderer();
        const ctx = createMockCtx();
        const sheet = createMockSheet();
        const vt = createMockVT();
        renderer.renderRowMoveIndicator(ctx, sheet, vt, 800, 600);
        expect(ctx.save).not.toHaveBeenCalled();
    });

    it("should render ghost row when move is active", () => {
        const renderer = new DragIndicatorRenderer();
        const ctx = createMockCtx();
        const sheet = createMockSheet();
        const vt = createMockVT();
        renderer.setRowMoveState({
            sourceRow: 3,
            targetRow: 7,
            dragY: 250,
            dragStartY: 100,
            rowH: 28,
        });
        renderer.renderRowMoveIndicator(ctx, sheet, vt, 800, 600);
        expect(ctx.save).toHaveBeenCalled();
        expect(ctx.fillRect).toHaveBeenCalled();
        expect(ctx.restore).toHaveBeenCalled();
    });

    it("should render ghost row header", () => {
        const renderer = new DragIndicatorRenderer();
        const ctx = createMockCtx();
        const sheet = createMockSheet();
        const vt = createMockVT();
        renderer.setRowMoveState({
            sourceRow: 3,
            targetRow: 7,
            dragY: 250,
            dragStartY: 100,
            rowH: 28,
        });
        renderer.renderRowMoveIndicator(ctx, sheet, vt, 800, 600);
        expect(sheet.getRowHeader).toHaveBeenCalledWith(3);
    });
});

describe("DragIndicatorRenderer - State independence", () => {
    it("column and row move states should be independent", () => {
        const renderer = new DragIndicatorRenderer();
        renderer.setColumnMoveState({ sourceCol: 2, targetCol: 5, dragX: 300, dragStartX: 200, colW: 100 });
        renderer.setRowMoveState({ sourceRow: 3, targetRow: 7, dragY: 250, dragStartY: 100, rowH: 28 });
        expect(renderer.hasColumnMove()).toBe(true);
        expect(renderer.hasRowMove()).toBe(true);
    });

    it("clearing column state should not affect row state", () => {
        const renderer = new DragIndicatorRenderer();
        renderer.setColumnMoveState({ sourceCol: 2, targetCol: 5, dragX: 300, dragStartX: 200, colW: 100 });
        renderer.setRowMoveState({ sourceRow: 3, targetRow: 7, dragY: 250, dragStartY: 100, rowH: 28 });
        renderer.setColumnMoveState(null);
        expect(renderer.hasColumnMove()).toBe(false);
        expect(renderer.hasRowMove()).toBe(true);
    });
});