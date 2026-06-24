import { describe, it, expect, vi, beforeEach } from "vitest";
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

describe("ViewportTransform - Bug Hunting", () => {
    describe("冻结区域边界条件", () => {
        it("BUG: 冻结列边界上的viewX应正确判断是否在冻结区", () => {
            const sheet = createMockSheet({ headerW: 46, frozenColsW: 200 });
            const vt = new ViewportTransform(sheet, 100, 0);

            expect(vt.isViewXInFrozenCols(46)).toBe(true);
            expect(vt.isViewXInFrozenCols(246)).toBe(true);
            expect(vt.isViewXInFrozenCols(247)).toBe(false);
        });

        it("BUG: 冻结行边界上的viewY应正确判断是否在冻结区", () => {
            const sheet = createMockSheet({ headerH: 28, frozenRowsH: 56 });
            const vt = new ViewportTransform(sheet, 0, 100);

            expect(vt.isViewYInFrozenRows(28)).toBe(true);
            expect(vt.isViewYInFrozenRows(84)).toBe(true);
            expect(vt.isViewYInFrozenRows(85)).toBe(false);
        });

        it("BUG: viewXToDataX在冻结区边界应不添加scroll偏移", () => {
            const sheet = createMockSheet({ headerW: 46, frozenColsW: 200 });
            const vt = new ViewportTransform(sheet, 500, 0);

            const dataXInFrozen = vt.viewXToDataX(146);
            expect(dataXInFrozen).toBe(100);

            const dataXOutsideFrozen = vt.viewXToDataX(300);
            expect(dataXOutsideFrozen).toBe(300 - 46 + 500);
        });

        it("BUG: viewYToDataY在冻结区边界应不添加scroll偏移", () => {
            const sheet = createMockSheet({ headerH: 28, frozenRowsH: 56 });
            const vt = new ViewportTransform(sheet, 0, 500);

            const dataYInFrozen = vt.viewYToDataY(56);
            expect(dataYInFrozen).toBe(28);

            const dataYOutsideFrozen = vt.viewYToDataY(100);
            expect(dataYOutsideFrozen).toBe(100 - 28 + 500);
        });
    });

    describe("坐标转换一致性", () => {
        it("BUG: colToViewX + viewXToDataX应等于getColX", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 0, 0);

            for (let col = 0; col < 5; col++) {
                const viewX = vt.colToViewX(col);
                const dataX = vt.viewXToDataX(viewX);
                expect(dataX).toBe(sheet.rowColManager.getColX(col));
            }
        });

        it("BUG: rowToViewY + viewYToDataY应等于getRowY", () => {
            const sheet = createMockSheet({ headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);

            for (let row = 0; row < 5; row++) {
                const viewY = vt.rowToViewY(row);
                const dataY = vt.viewYToDataY(viewY);
                expect(dataY).toBe(sheet.rowColManager.getRowY(row));
            }
        });

        it("BUG: 有scroll时colToViewX + viewXToDataX应等于getColX", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 200, 0);

            for (let col = 0; col < 5; col++) {
                const viewX = vt.colToViewX(col);
                const dataX = vt.viewXToDataX(viewX);
                expect(dataX).toBe(sheet.rowColManager.getColX(col));
            }
        });

        it("BUG: 有scroll时rowToViewY + viewYToDataY应等于getRowY", () => {
            const sheet = createMockSheet({ headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 200);

            for (let row = 0; row < 5; row++) {
                const viewY = vt.rowToViewY(row);
                const dataY = vt.viewYToDataY(viewY);
                expect(dataY).toBe(sheet.rowColManager.getRowY(row));
            }
        });
    });

    describe("cellToViewRect - 矩形一致性", () => {
        it("BUG: cellToViewRect的w/h应等于getColWidth/getRowHeight", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);

            const rect = vt.cellToViewRect(3, 5);
            expect(rect.w).toBe(sheet.rowColManager.getColWidth(5));
            expect(rect.h).toBe(sheet.rowColManager.getRowHeight(3));
        });

        it("BUG: cellToViewRect的x/y应等于colToViewX/rowToViewY", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 100, 200);

            const rect = vt.cellToViewRect(3, 5);
            expect(rect.x).toBe(vt.colToViewX(5));
            expect(rect.y).toBe(vt.rowToViewY(3));
        });

        it("BUG: 自定义列宽/行高应正确反映在cellToViewRect中", () => {
            const sheet = createMockSheet({
                headerW: 46,
                headerH: 28,
                colWidths: { 0: 150 },
                rowHeights: { 0: 50 },
            });
            const vt = new ViewportTransform(sheet, 0, 0);

            const rect = vt.cellToViewRect(0, 0);
            expect(rect.w).toBe(150);
            expect(rect.h).toBe(50);
        });
    });

    describe("mergeToViewRect - 合并区域", () => {
        it("BUG: mergeToViewRect的宽高应等于各列宽/各行高之和", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);

            const merge = { topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 3 };
            const rect = vt.mergeToViewRect(merge);

            const expectedW = 100 * 4;
            const expectedH = 28 * 3;
            expect(rect.w).toBe(expectedW);
            expect(rect.h).toBe(expectedH);
        });

        it("BUG: mergeToViewRect在有scroll时位置应正确", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 50, 30);

            const merge = { topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 };
            const rect = vt.mergeToViewRect(merge);

            expect(rect.x).toBe(46 - 50);
            expect(rect.y).toBe(28 - 30);
        });
    });

    describe("isCellVisible - 可见性判断", () => {
        it("BUG: 部分可见的单元格应判定为可见", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 50, 0);

            expect(vt.isCellVisible(0, 0, 800, 600)).toBe(true);
        });

        it("BUG: 完全不可见的单元格应判定为不可见", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 100000, 0);

            expect(vt.isCellVisible(0, 0, 800, 600)).toBe(false);
        });

        it("BUG: 冻结列中的单元格在滚动后应仍可见", () => {
            const sheet = createMockSheet({
                headerW: 46,
                headerH: 28,
                fixedCols: 1,
                frozenColsW: 100,
            });
            const vt = new ViewportTransform(sheet, 10000, 0);

            expect(vt.isCellVisible(0, 0, 800, 600)).toBe(true);
        });

        it("BUG: 冻结行中的单元格在滚动后应仍可见", () => {
            const sheet = createMockSheet({
                headerW: 46,
                headerH: 28,
                fixedRows: 1,
                frozenRowsH: 28,
            });
            const vt = new ViewportTransform(sheet, 0, 10000);

            expect(vt.isCellVisible(0, 0, 800, 600)).toBe(true);
        });

        it("BUG: tabH参数应正确影响可见性判断", () => {
            const sheet = createMockSheet({ headerW: 46, headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);

            expect(vt.isCellVisible(20, 0, 800, 60, 30)).toBe(false);
        });
    });

    describe("colRightToViewX / rowBottomToViewY", () => {
        it("BUG: colRightToViewX应等于colToViewX + getColWidth", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 100, 0);

            for (let col = 0; col < 5; col++) {
                expect(vt.colRightToViewX(col)).toBe(vt.colToViewX(col) + sheet.rowColManager.getColWidth(col));
            }
        });

        it("BUG: rowBottomToViewY应等于rowToViewY + getRowHeight", () => {
            const sheet = createMockSheet({ headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 100);

            for (let row = 0; row < 5; row++) {
                expect(vt.rowBottomToViewY(row)).toBe(vt.rowToViewY(row) + sheet.rowColManager.getRowHeight(row));
            }
        });
    });

    describe("负坐标处理", () => {
        it("BUG: 滚动超出数据范围时viewXToCol应返回合理值", () => {
            const sheet = createMockSheet({ headerW: 46 });
            const vt = new ViewportTransform(sheet, 0, 0);

            const col = vt.viewXToCol(0);
            expect(col).toBeGreaterThanOrEqual(0);
        });

        it("BUG: 滚动超出数据范围时viewYToRow应返回合理值", () => {
            const sheet = createMockSheet({ headerH: 28 });
            const vt = new ViewportTransform(sheet, 0, 0);

            const row = vt.viewYToRow(0);
            expect(row).toBeGreaterThanOrEqual(0);
        });
    });
});