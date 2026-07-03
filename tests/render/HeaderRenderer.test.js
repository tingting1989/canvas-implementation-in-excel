import { describe, it, expect, vi, beforeEach } from "vitest";
import { HeaderRenderer } from "../../src/render/HeaderRenderer.js";

describe("HeaderRenderer", () => {
    let renderer;
    let ctx;
    let sheet;
    let vt;

    beforeEach(() => {
        renderer = new HeaderRenderer();

        ctx = {
            fillStyle: "",
            strokeStyle: "",
            lineWidth: 1,
            font: "",
            textAlign: "",
            fillRect: vi.fn(),
            strokeRect: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
            fillText: vi.fn(),
            measureText: vi.fn(() => ({ width: 50 })),
        };

        sheet = {
            rowColManager: {
                getColWidth: vi.fn((c) => 100),
                getRowHeight: vi.fn((r) => 25),
                colAt: vi.fn((x) => Math.floor(x / 100)),
                rowAt: vi.fn((y) => Math.floor(y / 25)),
                isColumnHidden: vi.fn(() => false),
                isRowHidden: vi.fn(() => false),
                visibleRowCount: 100,
                visibleColCount: 26,
                colCount: 26,
                rowCount: 100,
            },
            selection: {
                getRange: vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 9, bottomCol: 2 })),
                getFocus: vi.fn(() => [0, 0]),
            },
            getDefaultStyle: vi.fn(() => ({})),
            getColHeader: vi.fn((c) => String.fromCharCode(65 + c)),
            getColHeaderStyle: vi.fn(() => null),
            getRowHeader: vi.fn((r) => String(r + 1)),
            getRowHeaderStyle: vi.fn(() => null),
            cellPadding: 6,
            getNestedHeaderRowCount: vi.fn(() => 0),
            nestedHeaders: [],
            toRealRow: vi.fn((r) => r), // 添加缺失的方法
            toPageRow: vi.fn((r) => r),
            getHeaderWidth: vi.fn(() => 40),
            getHeaderHeight: vi.fn(() => 30),
            frozenColsWidth: 0,
            fixedColumnsStart: 0,
            fixedRowsTop: 0,
            frozenRowsHeight: 0,
        };

        vt = {
            headerW: 40,
            headerH: 30,
            frozenColsW: 0,
            frozenRowsH: 0,
            fixedCols: 0,
            fixedRows: 0,
            scrollX: 0,
            scrollY: 0,
            colToViewX: vi.fn((c) => 40 + c * 100),
            colRightToViewX: vi.fn((c) => 40 + (c + 1) * 100),
            rowToViewY: vi.fn((r) => 30 + r * 25),
            rowBottomToViewY: vi.fn((r) => 30 + (r + 1) * 25),
        };
    });

    describe("Constructor", () => {
        it("should create instance without errors", () => {
            expect(renderer).toBeInstanceOf(HeaderRenderer);
        });

        it("should initialize with no drag indicator", () => {
            expect(renderer._dragIndicator).toBeUndefined();
        });
    });

    describe("render()", () => {
        it("should call column headers rendering", () => {
            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.fillRect).toHaveBeenCalled();
        });

        it("should store drag indicator reference", () => {
            const mockDragIndicator = {
                hasColumnMove: vi.fn(() => false),
                hasRowMove: vi.fn(() => false),
                isColumnSource: vi.fn(() => false),
                isRowSource: vi.fn(() => false),
            };

            renderer.render(ctx, sheet, vt, 800, 600, mockDragIndicator);

            expect(renderer._dragIndicator).toBe(mockDragIndicator);
        });

        it("should work without drag indicator", () => {
            expect(() => renderer.render(ctx, sheet, vt, 800, 600)).not.toThrow();
        });
    });

    describe("Column Headers Rendering", () => {
        it("should fill column header background", () => {
            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.fillRect).toHaveBeenCalledWith(
                expect.any(Number),
                0,
                expect.any(Number),
                expect.any(Number)
            );
        });

        it("should draw column separators", () => {
            renderer.render(ctx, sheet, vt, 800, 600);

            const lineToCalls = ctx.lineTo.mock.calls.filter(
                ([x, y]) => y === 30 && x > 40
            );
            expect(lineToCalls.length).toBeGreaterThan(0);
        });
    });

    describe("Row Headers Rendering", () => {
        it("should fill row header background", () => {
            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.fillRect).toHaveBeenCalledWith(
                0,
                expect.any(Number),
                expect.any(Number),
                expect.any(Number)
            );
        });

        it("should draw row headers text", () => {
            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.fillText).toHaveBeenCalled();
        });
    });

    describe("Corner Rendering", () => {
        it("should render corner area", () => {
            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 40, 30);
        });

        it("should highlight corner when all selected", () => {
            sheet.selection.getRange.mockReturnValue({ topRow: 0, topCol: 0, bottomRow: 99, bottomCol: 25 });

            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 40, 30);
        });
    });

    describe("Frozen Columns Support", () => {
        beforeEach(() => {
            vt.frozenColsW = 100;
            vt.fixedCols = 1;
        });

        it("should render frozen column region when frozenColsW > 0", () => {
            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.save).toHaveBeenCalled();
            expect(ctx.clip).toHaveBeenCalled();
        });

        it("should render both frozen and non-frozen regions", () => {
            renderer.render(ctx, sheet, vt, 800, 600);

            const saveCalls = ctx.save.mock.calls.length;
            expect(saveCalls).toBeGreaterThanOrEqual(4); // 至少：frozen + non-frozen for both regions
        });
    });

    describe("#drawColSelectionLines() - Column Selection Highlight Line", () => {
        let originalDrawSelectionLine;

        beforeEach(() => {
            originalDrawSelectionLine = renderer._drawSelectionLine || null;
        });

        it("should draw selection line for non-frozen columns only", () => {
            vt.fixedCols = 0;
            vt.frozenColsW = 0;

            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.moveTo).toHaveBeenCalled();
            expect(ctx.stroke).toHaveBeenCalled();
        });

        it("should split selection line at frozen boundary", () => {
            vt.fixedCols = 1;
            vt.frozenColsW = 100;
            sheet.selection.getRange.mockReturnValue({ topRow: 0, topCol: 0, bottomRow: 9, bottomCol: 2 });

            renderer.render(ctx, sheet, vt, 800, 600);

            const strokeCalls = ctx.stroke.mock.calls.length;
            expect(strokeCalls).toBeGreaterThan(0);
        });

        it("should only draw in frozen area when selection is in frozen cols", () => {
            vt.fixedCols = 2;
            vt.frozenColsW = 200;
            sheet.selection.getRange.mockReturnValue({ topRow: 0, topCol: 0, bottomRow: 9, bottomCol: 1 });

            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.stroke).toHaveBeenCalled();
        });

        it("should only draw in non-frozen area when selection is after frozen cols", () => {
            vt.fixedCols = 1;
            vt.frozenColsW = 100;
            sheet.selection.getRange.mockReturnValue({ topRow: 0, topCol: 1, bottomRow: 9, bottomCol: 3 });

            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.stroke).toHaveBeenCalled();
        });

        it("should not draw selection line during column move drag", () => {
            const mockDragIndicator = {
                hasColumnMove: vi.fn(() => true),
                hasRowMove: vi.fn(() => false),
                isColumnSource: vi.fn(() => false),
                isRowSource: vi.fn(() => false),
            };

            renderer.render(ctx, sheet, vt, 800, 600, mockDragIndicator);

            expect(mockDragIndicator.hasColumnMove).toHaveBeenCalled();
        });
    });

    describe("Nested Headers Support", () => {
        beforeEach(() => {
            sheet.getNestedHeaderRowCount.mockReturnValue(2);
            sheet.nestedHeaders = [
                [
                    { label: "Basic Info", colspan: 2 },
                    { label: "Details", colspan: 2 },
                ],
                [
                    { label: "Name" },
                    { label: "Age" },
                    { label: "City" },
                    { label: "Phone" },
                ],
            ];
        });

        it("should render nested headers when count > 0", () => {
            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.fillText).toHaveBeenCalled();
        });

        it("should render multiple layers of nested headers", () => {
            renderer.render(ctx, sheet, vt, 800, 600);

            const textCalls = ctx.fillText.mock.calls.filter(
                ([text]) => text === "Basic Info" || text === "Name"
            );
            expect(textCalls.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe("Drag Indicator Integration", () => {
        it("should highlight source column during move", () => {
            const mockDragIndicator = {
                hasColumnMove: vi.fn(() => true),
                hasRowMove: vi.fn(() => false),
                isColumnSource: vi.fn((c) => c === 1),
                isRowSource: vi.fn(() => false),
            };

            renderer.render(ctx, sheet, vt, 800, 600, mockDragIndicator);

            expect(mockDragIndicator.isColumnSource).toHaveBeenCalled();
        });

        it("should hide selection line during column move", () => {
            const mockDragIndicator = {
                hasColumnMove: vi.fn(() => true),
                hasRowMove: vi.fn(() => false),
                isColumnSource: vi.fn(() => false),
                isRowSource: vi.fn(() => false),
            };

            renderer.render(ctx, sheet, vt, 800, 600, mockDragIndicator);

            expect(mockDragIndicator.hasColumnMove).toHaveBeenCalled();
        });
    });

    describe("Hidden Columns Handling", () => {
        beforeEach(() => {
            sheet.rowColManager.getColWidth.mockImplementation((c) => c === 1 ? 0 : 100);
        });

        it("should skip hidden columns (width <= 0)", () => {
            renderer.render(ctx, sheet, vt, 800, 600);

            const separatorCalls = ctx.lineTo.mock.calls.filter(
                ([x, y]) => y === 30
            );

            expect(separatorCalls.length).toBeLessThan(10);
        });
    });

    describe("Edge Cases", () => {
        it("should handle empty selection range gracefully", () => {
            sheet.selection.getRange.mockReturnValue({ topRow: 0, topCol: 0, bottomRow: -1, bottomCol: -1 });

            expect(() => renderer.render(ctx, sheet, vt, 800, 600)).not.toThrow();
        });

        it("should handle single cell selection", () => {
            sheet.selection.getRange.mockReturnValue({ topRow: 5, topCol: 3, bottomRow: 5, bottomCol: 3 });

            expect(() => renderer.render(ctx, sheet, vt, 800, 600)).not.toThrow();
        });

        it("should handle very large selection range", () => {
            sheet.selection.getRange.mockReturnValue({ topRow: 0, topCol: 0, bottomRow: 999, bottomCol: 999 });

            expect(() => renderer.render(ctx, sheet, vt, 800, 600)).not.toThrow();
        });

        it("should handle zero viewport dimensions", () => {
            expect(() => renderer.render(ctx, sheet, vt, 0, 0)).not.toThrow();
        });

        it("should handle custom font style from default style", () => {
            sheet.getDefaultStyle.mockReturnValue({
                fontStyle: "italic",
                fontWeight: "bold",
                fontSize: 14,
                fontFamily: "Arial",
            });

            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.font).toContain("italic");
            expect(ctx.font).toContain("bold");
            expect(ctx.font).toContain("14px");
        });
    });

    describe("Performance & Optimization", () => {
        it("should use save/restore for clipping contexts", () => {
            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.save).toHaveBeenCalled();
            expect(ctx.restore).toHaveBeenCalled();
        });

        it("should balance save and restore calls", () => {
            renderer.render(ctx, sheet, vt, 800, 600);

            expect(ctx.save.mock.calls.length).toEqual(ctx.restore.mock.calls.length);
        });
    });
});