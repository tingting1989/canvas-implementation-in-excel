import { describe, it, expect, beforeEach } from "vitest";
import { ViewportTransform } from "../../src/render/ViewportTransform.js";

function createMockSheet(options = {}) {
    const {
        headerW = 46,
        headerH = 28,
        fixedCols = 0,
        fixedRows = 0,
        frozenColsW = 0,
        frozenRowsH = 0,
        colWidths = {},
        rowHeights = {},
        defaultColWidth = 100,
        defaultRowHeight = 28,
    } = options;

    const colXCache = {};
    const rowYCache = {};

    function getColX(col) {
        if (colXCache[col] !== undefined) return colXCache[col];
        if (col === 0) return 0;
        let x = 0;
        for (let c = 0; c < col; c++) {
            x += colWidths[c] ?? defaultColWidth;
        }
        colXCache[col] = x;
        return x;
    }

    function getRowY(row) {
        if (rowYCache[row] !== undefined) return rowYCache[row];
        if (row === 0) return 0;
        let y = 0;
        for (let r = 0; r < row; r++) {
            y += rowHeights[r] ?? defaultRowHeight;
        }
        rowYCache[row] = y;
        return y;
    }

    function getColWidth(col) {
        return colWidths[col] ?? defaultColWidth;
    }

    function getRowHeight(row) {
        return rowHeights[row] ?? defaultRowHeight;
    }

    function colAt(dataX) {
        let x = 0;
        let col = 0;
        while (x + getColWidth(col) <= dataX && col < 1000) {
            x += getColWidth(col);
            col++;
        }
        return col;
    }

    function rowAt(dataY) {
        let y = 0;
        let row = 0;
        while (y + getRowHeight(row) <= dataY && row < 1000) {
            y += getRowHeight(row);
            row++;
        }
        return row;
    }

    return {
        getHeaderWidth: () => headerW,
        getHeaderHeight: () => headerH,
        fixedColumnsStart: fixedCols,
        fixedRowsTop: fixedRows,
        frozenColsWidth: frozenColsW,
        frozenRowsHeight: frozenRowsH,
        rowColManager: {
            getColX,
            getRowY,
            getColWidth,
            getRowHeight,
            colAt,
            rowAt,
        },
    };
}

describe("ViewportTransform", () => {
    describe("colToViewX", () => {
        it("should convert column 0 to view X with header offset", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.colToViewX(0)).toBe(46);
        });

        it("should convert column with scroll offset", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 150, 0);
            expect(vt.colToViewX(0)).toBe(46 - 150);
        });

        it("should keep frozen columns fixed when scrolling", () => {
            const sheet = createMockSheet({ headerW: 46, fixedCols: 2, frozenColsW: 200 });
            const vt = new ViewportTransform(sheet, 500, 0);
            expect(vt.colToViewX(0)).toBe(46);
            expect(vt.colToViewX(1)).toBe(46 + 100);
        });

        it("should apply scroll to non-frozen columns", () => {
            const sheet = createMockSheet({ headerW: 46, fixedCols: 2, frozenColsW: 200 });
            const vt = new ViewportTransform(sheet, 500, 0);
            const frozenX = vt.colToViewX(1);
            const nonFrozenX = vt.colToViewX(2);
            expect(nonFrozenX).toBeLessThan(frozenX + 500);
        });

        it("should handle no scroll", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.colToViewX(1)).toBe(46 + 100);
        });
    });

    describe("colRightToViewX", () => {
        it("should return right edge of column", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.colRightToViewX(0)).toBe(46 + 100);
        });

        it("should return right edge with custom width", () => {
            const sheet = createMockSheet({ headerW: 46, colWidths: { 0: 150 } });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.colRightToViewX(0)).toBe(46 + 150);
        });
    });

    describe("rowToViewY", () => {
        it("should convert row 0 to view Y with header offset", () => {
            const sheet = createMockSheet({ headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.rowToViewY(0)).toBe(28);
        });

        it("should convert row with scroll offset", () => {
            const sheet = createMockSheet({ headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 100);
            expect(vt.rowToViewY(0)).toBe(28 - 100);
        });

        it("should keep frozen rows fixed when scrolling", () => {
            const sheet = createMockSheet({ headerH: 28, fixedRows: 2, frozenRowsH: 56 });
            const vt = new ViewportTransform(sheet, 0, 300);
            expect(vt.rowToViewY(0)).toBe(28);
            expect(vt.rowToViewY(1)).toBe(28 + 28);
        });

        it("should apply scroll to non-frozen rows", () => {
            const sheet = createMockSheet({ headerH: 28, fixedRows: 2, frozenRowsH: 56 });
            const vt = new ViewportTransform(sheet, 0, 300);
            const frozenY = vt.rowToViewY(1);
            const nonFrozenY = vt.rowToViewY(2);
            expect(nonFrozenY).toBeLessThan(frozenY + 300);
        });
    });

    describe("rowBottomToViewY", () => {
        it("should return bottom edge of row", () => {
            const sheet = createMockSheet({ headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.rowBottomToViewY(0)).toBe(28 + 28);
        });

        it("should return bottom edge with custom height", () => {
            const sheet = createMockSheet({ headerH: 28, rowHeights: { 0: 50 } });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.rowBottomToViewY(0)).toBe(28 + 50);
        });
    });

    describe("viewXToDataX", () => {
        it("should convert view X to data X without scroll", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.viewXToDataX(146)).toBe(100);
        });

        it("should convert view X to data X with scroll", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 200, 0);
            expect(vt.viewXToDataX(146)).toBe(100 + 200);
        });

        it("should not add scroll offset in frozen column area", () => {
            const sheet = createMockSheet({ headerW: 46, frozenColsW: 200 });
            const vt = new ViewportTransform(sheet, 200, 0);
            expect(vt.viewXToDataX(146)).toBe(100);
        });

        it("should add scroll offset outside frozen column area", () => {
            const sheet = createMockSheet({ headerW: 46, frozenColsW: 200 });
            const vt = new ViewportTransform(sheet, 200, 0);
            expect(vt.viewXToDataX(300)).toBe(300 - 46 + 200);
        });
    });

    describe("viewYToDataY", () => {
        it("should convert view Y to data Y without scroll", () => {
            const sheet = createMockSheet({ headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.viewYToDataY(56)).toBe(28);
        });

        it("should convert view Y to data Y with scroll", () => {
            const sheet = createMockSheet({ headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 150);
            expect(vt.viewYToDataY(56)).toBe(28 + 150);
        });

        it("should not add scroll offset in frozen row area", () => {
            const sheet = createMockSheet({ headerH: 28, frozenRowsH: 56 });
            const vt = new ViewportTransform(sheet, 0, 150);
            expect(vt.viewYToDataY(56)).toBe(28);
        });

        it("should add scroll offset outside frozen row area", () => {
            const sheet = createMockSheet({ headerH: 28, frozenRowsH: 56 });
            const vt = new ViewportTransform(sheet, 0, 150);
            expect(vt.viewYToDataY(100)).toBe(100 - 28 + 150);
        });
    });

    describe("viewXToCol", () => {
        it("should convert view X to column index", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.viewXToCol(146)).toBe(1);
        });

        it("should convert view X to column index with scroll", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 100, 0);
            expect(vt.viewXToCol(146)).toBe(2);
        });
    });

    describe("viewYToRow", () => {
        it("should convert view Y to row index", () => {
            const sheet = createMockSheet({ headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.viewYToRow(56)).toBe(1);
        });

        it("should convert view Y to row index with scroll", () => {
            const sheet = createMockSheet({ headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 28);
            expect(vt.viewYToRow(56)).toBe(2);
        });
    });

    describe("colRightToDataX / rowBottomToDataY", () => {
        it("should return right edge data X of column", () => {
            const sheet = createMockSheet();
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.colRightToDataX(0)).toBe(100);
        });

        it("should return bottom edge data Y of row", () => {
            const sheet = createMockSheet();
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.rowBottomToDataY(0)).toBe(28);
        });
    });

    describe("cellToViewRect", () => {
        it("should return view rect for a cell", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);
            const rect = vt.cellToViewRect(0, 0);
            expect(rect.x).toBe(46);
            expect(rect.y).toBe(28);
            expect(rect.w).toBe(100);
            expect(rect.h).toBe(28);
        });

        it("should return view rect for cell at offset", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);
            const rect = vt.cellToViewRect(1, 1);
            expect(rect.x).toBe(46 + 100);
            expect(rect.y).toBe(28 + 28);
        });

        it("should return view rect with scroll", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 50, 30);
            const rect = vt.cellToViewRect(0, 0);
            expect(rect.x).toBe(46 - 50);
            expect(rect.y).toBe(28 - 30);
        });
    });

    describe("mergeToViewRect", () => {
        it("should return view rect for merge range", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);
            const merge = { topRow: 0, topCol: 0, bottomRow: 1, bottomCol: 1 };
            const rect = vt.mergeToViewRect(merge);
            expect(rect.x).toBe(46);
            expect(rect.y).toBe(28);
            expect(rect.w).toBe(200);
            expect(rect.h).toBe(56);
        });

        it("should return view rect for partial merge", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28, colWidths: { 0: 120 } });
            const vt = new ViewportTransform(sheet, 0, 0);
            const merge = { topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 1 };
            const rect = vt.mergeToViewRect(merge);
            expect(rect.x).toBe(46);
            expect(rect.y).toBe(28);
            expect(rect.w).toBe(120 + 100);
            expect(rect.h).toBe(28);
        });
    });

    describe("isInFrozenCols / isInFrozenRows", () => {
        it("should detect frozen column", () => {
            const sheet = createMockSheet({ fixedCols: 3 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.isInFrozenCols(0)).toBe(true);
            expect(vt.isInFrozenCols(2)).toBe(true);
            expect(vt.isInFrozenCols(3)).toBe(false);
        });

        it("should detect frozen row", () => {
            const sheet = createMockSheet({ fixedRows: 2 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.isInFrozenRows(0)).toBe(true);
            expect(vt.isInFrozenRows(1)).toBe(true);
            expect(vt.isInFrozenRows(2)).toBe(false);
        });

        it("should return false when no frozen cols/rows", () => {
            const sheet = createMockSheet();
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.isInFrozenCols(0)).toBe(false);
            expect(vt.isInFrozenRows(0)).toBe(false);
        });
    });

    describe("isViewXInFrozenCols / isViewYInFrozenRows", () => {
        it("should detect view X in frozen column area", () => {
            const sheet = createMockSheet({ headerW: 46, frozenColsW: 200 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.isViewXInFrozenCols(46)).toBe(true);
            expect(vt.isViewXInFrozenCols(246)).toBe(true);
            expect(vt.isViewXInFrozenCols(247)).toBe(false);
        });

        it("should return false when no frozen columns", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.isViewXInFrozenCols(46)).toBe(false);
        });

        it("should detect view Y in frozen row area", () => {
            const sheet = createMockSheet({ headerH: 28, frozenRowsH: 56 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.isViewYInFrozenRows(28)).toBe(true);
            expect(vt.isViewYInFrozenRows(84)).toBe(true);
            expect(vt.isViewYInFrozenRows(85)).toBe(false);
        });

        it("should return false when no frozen rows", () => {
            const sheet = createMockSheet({ headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.isViewYInFrozenRows(28)).toBe(false);
        });
    });

    describe("isCellVisible", () => {
        it("should return true for visible cell in viewport", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.isCellVisible(0, 0, 800, 600)).toBe(true);
        });

        it("should return false for cell scrolled out of view", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 10000, 0);
            expect(vt.isCellVisible(0, 0, 800, 600)).toBe(false);
        });

        it("should return true for frozen cell even when scrolled", () => {
            const sheet = createMockSheet({
                headerW: 46,
                headerH: 28,
                fixedCols: 1,
                fixedRows: 1,
                frozenColsW: 100,
                frozenRowsH: 28,
            });
            const vt = new ViewportTransform(sheet, 10000, 10000);
            expect(vt.isCellVisible(0, 0, 800, 600)).toBe(true);
        });

        it("should account for tab height", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.isCellVisible(5, 0, 800, 600, 30)).toBe(true);
        });

        it("should return false for cell beyond viewport width", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);
            expect(vt.isCellVisible(0, 50, 200, 600)).toBe(false);
        });
    });

    describe("coordinate round-trip", () => {
        it("should round-trip colToViewX and viewXToCol", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 0, 0);
            const col = 3;
            const viewX = vt.colToViewX(col);
            const resultCol = vt.viewXToCol(viewX + 1);
            expect(resultCol).toBe(col);
        });

        it("should round-trip rowToViewY and viewYToRow", () => {
            const sheet = createMockSheet({ headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);
            const row = 5;
            const viewY = vt.rowToViewY(row);
            const resultRow = vt.viewYToRow(viewY + 1);
            expect(resultRow).toBe(row);
        });
    });
});