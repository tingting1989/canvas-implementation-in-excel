import { describe, it, expect, vi, beforeEach } from "vitest";
import { OverlayRenderer } from "../../src/render/OverlayRenderer.js";

describe("OverlayRenderer", () => {
    let renderer;

    beforeEach(() => {
        renderer = new OverlayRenderer();
    });

    describe("renderMerges", () => {
        it("should call mergeToViewRect for each merge", () => {
            const ctx = {
                strokeStyle: "",
                lineWidth: 0,
                strokeRect: vi.fn(),
            };

            const merge1 = { topRow: 0, topCol: 0, bottomRow: 1, bottomCol: 1 };
            const merge2 = { topRow: 3, topCol: 3, bottomRow: 4, bottomCol: 4 };

            const sheet = {
                getAllMerges: () => [merge1, merge2],
                rowColManager: {
                    getColWidth: () => 100,
                },
            };

            const vt = {
                mergeToViewRect: vi.fn((m) => ({
                    x: m.topCol * 100,
                    y: m.topRow * 28,
                    w: (m.bottomCol - m.topCol + 1) * 100,
                    h: (m.bottomRow - m.topRow + 1) * 28,
                })),
            };

            renderer.renderMerges(ctx, sheet, vt);

            expect(vt.mergeToViewRect).toHaveBeenCalledTimes(2);
            expect(ctx.strokeRect).toHaveBeenCalledTimes(2);
        });

        it("should skip merges in hidden columns", () => {
            const ctx = {
                strokeStyle: "",
                lineWidth: 0,
                strokeRect: vi.fn(),
            };

            const merges = [
                { topRow: 0, topCol: 5, bottomRow: 1, bottomCol: 5 },
            ];

            const sheet = {
                getAllMerges: () => merges,
                rowColManager: {
                    getColWidth: () => 0,
                },
            };

            const vt = {
                mergeToViewRect: vi.fn(),
            };

            renderer.renderMerges(ctx, sheet, vt);

            expect(ctx.strokeRect).not.toHaveBeenCalled();
        });

        it("should skip merges with zero width or height", () => {
            const ctx = {
                strokeStyle: "",
                lineWidth: 0,
                strokeRect: vi.fn(),
            };

            const merges = [
                { topRow: 0, topCol: 0, bottomRow: 1, bottomCol: 1 },
                { topRow: 50, topCol: 0, bottomRow: 51, bottomCol: 1 },
            ];

            const sheet = {
                getAllMerges: () => merges,
                rowColManager: {
                    getColWidth: () => 100,
                },
            };

            const vt = {
                mergeToViewRect: vi.fn((m) => ({
                    x: 0, y: 0, w: 100, h: 28,
                })),
            };

            renderer.renderMerges(ctx, sheet, vt);

            expect(ctx.strokeRect).toHaveBeenCalledTimes(2);
        });

        it("should reset lineWidth to 1 after rendering", () => {
            const ctx = {
                strokeStyle: "",
                lineWidth: 0,
                strokeRect: vi.fn(),
            };

            const sheet = {
                getAllMerges: () => [],
                rowColManager: {
                    getColWidth: () => 100,
                },
            };

            const vt = {};

            renderer.renderMerges(ctx, sheet, vt);

            expect(ctx.lineWidth).toBe(1);
        });
    });

    describe("renderSelection", () => {
        function createMockSheetForSelection() {
            return {
                selection: {
                    getRange: () => ({ topRow: 1, topCol: 2, bottomRow: 3, bottomCol: 4 }),
                    getFocus: () => [2, 3],
                },
                getMerge: () => null,
            };
        }

        function createMockVt() {
            return {
                mergeToViewRect: vi.fn(() => ({ x: 200, y: 56, w: 300, h: 84 })),
                colToViewX: vi.fn(() => 200),
                colRightToViewX: vi.fn(() => 500),
                rowToViewY: vi.fn(() => 56),
                rowBottomToViewY: vi.fn(() => 140),
                cellToViewRect: vi.fn(() => ({ x: 300, y: 84, w: 100, h: 28 })),
                headerH: 28,
                headerW: 46,
            };
        }

        it("should render range highlight, header highlight, active cell, border, and fill handle", () => {
            const ctx = {
                fillStyle: "",
                strokeStyle: "",
                lineWidth: 0,
                fillRect: vi.fn(),
                strokeRect: vi.fn(),
            };

            const sheet = createMockSheetForSelection();
            const vt = createMockVt();

            renderer.renderSelection(ctx, sheet, vt, 800, 600);

            expect(ctx.fillRect.mock.calls.length).toBeGreaterThanOrEqual(3);
            expect(ctx.strokeRect).toHaveBeenCalled();
        });

        it("should not render resize line (moved to ResizeLayer)", () => {
            const ctx = {
                fillStyle: "",
                strokeStyle: "",
                lineWidth: 0,
                fillRect: vi.fn(),
                strokeRect: vi.fn(),
                save: vi.fn(),
                restore: vi.fn(),
                beginPath: vi.fn(),
                setLineDash: vi.fn(),
            };

            const sheet = createMockSheetForSelection();
            const vt = createMockVt();

            renderer.renderSelection(ctx, sheet, vt, 800, 600);

            expect(ctx.setLineDash).not.toHaveBeenCalled();
        });

        it("should render active cell with merge when cell is merged", () => {
            const ctx = {
                fillStyle: "",
                strokeStyle: "",
                lineWidth: 0,
                fillRect: vi.fn(),
                strokeRect: vi.fn(),
            };

            const sheet = {
                selection: {
                    getRange: () => ({ topRow: 0, topCol: 0, bottomRow: 1, bottomCol: 1 }),
                    getFocus: () => [0, 0],
                },
                getMerge: () => ({ topRow: 0, topCol: 0, bottomRow: 1, bottomCol: 1 }),
            };

            const vt = {
                mergeToViewRect: vi.fn(() => ({ x: 0, y: 0, w: 200, h: 56 })),
                colToViewX: vi.fn(() => 0),
                colRightToViewX: vi.fn(() => 200),
                rowToViewY: vi.fn(() => 0),
                rowBottomToViewY: vi.fn(() => 56),
                headerH: 28,
                headerW: 46,
            };

            renderer.renderSelection(ctx, sheet, vt, 800, 600);

            expect(vt.mergeToViewRect).toHaveBeenCalled();
        });
    });

    describe("renderMerges with empty list", () => {
        it("should not draw anything when there are no merges", () => {
            const ctx = {
                strokeStyle: "",
                lineWidth: 0,
                strokeRect: vi.fn(),
            };

            const sheet = {
                getAllMerges: () => [],
                rowColManager: {
                    getColWidth: () => 100,
                },
            };

            const vt = {};

            renderer.renderMerges(ctx, sheet, vt);

            expect(ctx.strokeRect).not.toHaveBeenCalled();
        });
    });
});