import { describe, it, expect } from "vitest";
import { RowColManager } from "@/model/grid/RowColManager";
import { CONFIG } from "@/constants/config";

describe("RowColManager - Basic Size", () => {
    it("should have default rowCount and colCount of 1", () => {
        const rcm = new RowColManager();
        expect(rcm.colCount).toBe(1);
        expect(rcm.rowCount).toBe(1);
    });

    it("should expand via ensureSize", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(10, 5);
        expect(rcm.rowCount).toBe(10);
        expect(rcm.colCount).toBe(5);
    });

    it("ensureSize should only grow, never shrink", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(10, 5);
        rcm.ensureSize(3, 2);
        expect(rcm.rowCount).toBe(10);
        expect(rcm.colCount).toBe(5);
    });

    it("resetSize should override to exact values", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(10, 5);
        rcm.resetSize(3, 2);
        expect(rcm.rowCount).toBe(3);
        expect(rcm.colCount).toBe(2);
        expect(rcm.isExplicitlySized).toBe(true);
    });

    it("resetSize should expand arrays and fill with defaults", () => {
        const rcm = new RowColManager();
        rcm.resetSize(5, 3);
        expect(rcm.getRowHeight(0)).toBe(CONFIG.DEFAULT_ROW_HEIGHT);
        expect(rcm.getColWidth(0)).toBe(CONFIG.DEFAULT_COL_WIDTH);
    });

    it("resetSize should shrink arrays", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(10, 5);
        rcm.setRowHeight(9, 50);
        rcm.resetSize(5, 3);
        expect(rcm.allocatedRowCount).toBe(5);
        expect(rcm.allocatedColCount).toBe(3);
    });

    it("ensureSize after resetSize should still expand arrays but not override usedRows/usedCols", () => {
        const rcm = new RowColManager();
        rcm.resetSize(5, 3);
        rcm.ensureSize(10, 10);
        expect(rcm.rowCount).toBe(5);
        expect(rcm.colCount).toBe(3);
    });
});

describe("RowColManager - Row/Col Height/Width", () => {
    it("should return default height/width for unallocated rows/cols", () => {
        const rcm = new RowColManager();
        expect(rcm.getRowHeight(100)).toBe(CONFIG.DEFAULT_ROW_HEIGHT);
        expect(rcm.getColWidth(100)).toBe(CONFIG.DEFAULT_COL_WIDTH);
    });

    it("should set and get custom row height", () => {
        const rcm = new RowColManager();
        rcm.setRowHeight(2, 50);
        expect(rcm.getRowHeight(2)).toBe(50);
    });

    it("should set and get custom col width", () => {
        const rcm = new RowColManager();
        rcm.setColWidth(3, 200);
        expect(rcm.getColWidth(3)).toBe(200);
    });

    it("setRowHeight should auto-ensureSize", () => {
        const rcm = new RowColManager();
        rcm.setRowHeight(20, 40);
        expect(rcm.getRowHeight(20)).toBe(40);
    });

    it("setColWidth should auto-ensureSize", () => {
        const rcm = new RowColManager();
        rcm.setColWidth(30, 150);
        expect(rcm.getColWidth(30)).toBe(150);
    });

    it("should not mark dirty if value unchanged", () => {
        const rcm = new RowColManager();
        rcm.setRowHeight(0, CONFIG.DEFAULT_ROW_HEIGHT);
        expect(rcm.getRowHeight(0)).toBe(CONFIG.DEFAULT_ROW_HEIGHT);
    });
});

describe("RowColManager - Coordinate Calculation", () => {
    it("getRowY should return 0 for row 0", () => {
        const rcm = new RowColManager();
        expect(rcm.getRowY(0)).toBe(0);
    });

    it("getColX should return 0 for col 0", () => {
        const rcm = new RowColManager();
        expect(rcm.getColX(0)).toBe(0);
    });

    it("getRowY should accumulate heights", () => {
        const rcm = new RowColManager();
        rcm.setRowHeight(0, 30);
        rcm.setRowHeight(1, 40);
        expect(rcm.getRowY(1)).toBe(30);
        expect(rcm.getRowY(2)).toBe(70);
    });

    it("getColX should accumulate widths", () => {
        const rcm = new RowColManager();
        rcm.setColWidth(0, 80);
        rcm.setColWidth(1, 120);
        expect(rcm.getColX(1)).toBe(80);
        expect(rcm.getColX(2)).toBe(200);
    });

    it("getRowY for unallocated rows should use default height", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(2, 2);
        rcm.setRowHeight(0, 30);
        rcm.setRowHeight(1, 40);
        expect(rcm.getRowY(10)).toBe(30 + 40 + 8 * CONFIG.DEFAULT_ROW_HEIGHT);
    });

    it("getColX for negative col should return 0", () => {
        const rcm = new RowColManager();
        expect(rcm.getColX(-1)).toBe(0);
    });
});

describe("RowColManager - rowAt / colAt (reverse lookup)", () => {
    it("rowAt(0) should return 0", () => {
        const rcm = new RowColManager();
        expect(rcm.rowAt(0)).toBe(0);
    });

    it("rowAt negative should return 0", () => {
        const rcm = new RowColManager();
        expect(rcm.rowAt(-10)).toBe(0);
    });

    it("colAt negative should return 0", () => {
        const rcm = new RowColManager();
        expect(rcm.colAt(-10)).toBe(0);
    });

    it("rowAt should find correct row for given y", () => {
        const rcm = new RowColManager();
        rcm.setRowHeight(0, 30);
        rcm.setRowHeight(1, 40);
        rcm.setRowHeight(2, 50);
        expect(rcm.rowAt(0)).toBe(0);
        expect(rcm.rowAt(29)).toBe(0);
        expect(rcm.rowAt(30)).toBe(1);
        expect(rcm.rowAt(69)).toBe(1);
        expect(rcm.rowAt(70)).toBe(2);
    });

    it("colAt should find correct col for given x", () => {
        const rcm = new RowColManager();
        rcm.setColWidth(0, 80);
        rcm.setColWidth(1, 120);
        expect(rcm.colAt(0)).toBe(0);
        expect(rcm.colAt(79)).toBe(0);
        expect(rcm.colAt(80)).toBe(1);
        expect(rcm.colAt(199)).toBe(1);
    });

    it("rowAt for y beyond allocated should use default height", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(10, 10);
        rcm.setRowHeight(0, 30);
        rcm.setRowHeight(1, 40);
        const y = 30 + 40 + 10;
        expect(rcm.rowAt(y)).toBe(2);
    });
});

describe("RowColManager - totalHeight / totalWidth", () => {
    it("should compute totalHeight correctly", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(3, 0);
        rcm.setRowHeight(0, 30);
        rcm.setRowHeight(1, 40);
        rcm.setRowHeight(2, 50);
        expect(rcm.totalHeight).toBe(120);
    });

    it("should compute totalWidth correctly", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 2);
        rcm.setColWidth(0, 80);
        rcm.setColWidth(1, 120);
        expect(rcm.totalWidth).toBe(200);
    });

    it("should include default rows beyond allocated", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(2, 0);
        rcm.setRowHeight(0, 30);
        rcm.setRowHeight(1, 40);
        expect(rcm.totalHeight).toBe(70);
    });
});

describe("RowColManager - Insert Row/Col", () => {
    it("insertRow should shift heights down", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(3, 0);
        rcm.setRowHeight(0, 10);
        rcm.setRowHeight(1, 20);
        rcm.setRowHeight(2, 30);
        rcm.insertRow(1);
        expect(rcm.getRowHeight(0)).toBe(10);
        expect(rcm.getRowHeight(1)).toBe(CONFIG.DEFAULT_ROW_HEIGHT);
        expect(rcm.getRowHeight(2)).toBe(20);
        expect(rcm.getRowHeight(3)).toBe(30);
    });

    it("insertCol should shift widths right", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 3);
        rcm.setColWidth(0, 50);
        rcm.setColWidth(1, 60);
        rcm.setColWidth(2, 70);
        rcm.insertCol(1);
        expect(rcm.getColWidth(0)).toBe(50);
        expect(rcm.getColWidth(1)).toBe(CONFIG.DEFAULT_COL_WIDTH);
        expect(rcm.getColWidth(2)).toBe(60);
        expect(rcm.getColWidth(3)).toBe(70);
    });

    it("insertRow should shift hidden rows", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(5, 0);
        rcm.hideRow(3);
        rcm.insertRow(2);
        expect(rcm.isRowHidden(4)).toBe(true);
        expect(rcm.isRowHidden(3)).toBe(false);
    });

    it("insertCol should shift hidden cols", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 5);
        rcm.hideColumn(3);
        rcm.insertCol(2);
        expect(rcm.isColumnHidden(4)).toBe(true);
        expect(rcm.isColumnHidden(3)).toBe(false);
    });
});

describe("RowColManager - Delete Row/Col", () => {
    it("deleteRow should shift heights up", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(3, 0);
        rcm.setRowHeight(0, 10);
        rcm.setRowHeight(1, 20);
        rcm.setRowHeight(2, 30);
        rcm.deleteRow(1);
        expect(rcm.getRowHeight(0)).toBe(10);
        expect(rcm.getRowHeight(1)).toBe(30);
    });

    it("deleteCol should shift widths left", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 3);
        rcm.setColWidth(0, 50);
        rcm.setColWidth(1, 60);
        rcm.setColWidth(2, 70);
        rcm.deleteCol(1);
        expect(rcm.getColWidth(0)).toBe(50);
        expect(rcm.getColWidth(1)).toBe(70);
    });

    it("deleteRow should remove hidden row at deleted index", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(5, 0);
        rcm.hideRow(2);
        rcm.deleteRow(2);
        expect(rcm.isRowHidden(2)).toBe(false);
    });

    it("deleteRow should shift hidden rows up", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(5, 0);
        rcm.hideRow(3);
        rcm.deleteRow(1);
        expect(rcm.isRowHidden(2)).toBe(true);
    });

    it("deleteCol out of bounds should be no-op", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 3);
        rcm.deleteCol(10);
        expect(rcm.allocatedColCount).toBe(3);
    });

    it("deleteRow negative index should be no-op", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(3, 0);
        rcm.deleteRow(-1);
        expect(rcm.allocatedRowCount).toBe(3);
    });
});

describe("RowColManager - Move Row/Col", () => {
    it("moveRow should swap row heights", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(3, 0);
        rcm.setRowHeight(0, 10);
        rcm.setRowHeight(1, 20);
        rcm.setRowHeight(2, 30);
        rcm.moveRow(0, 2);
        expect(rcm.getRowHeight(0)).toBe(20);
        expect(rcm.getRowHeight(1)).toBe(30);
        expect(rcm.getRowHeight(2)).toBe(10);
    });

    it("moveCol should swap col widths", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 3);
        rcm.setColWidth(0, 50);
        rcm.setColWidth(1, 60);
        rcm.setColWidth(2, 70);
        rcm.moveCol(2, 0);
        expect(rcm.getColWidth(0)).toBe(70);
        expect(rcm.getColWidth(1)).toBe(50);
        expect(rcm.getColWidth(2)).toBe(60);
    });

    it("moveRow same index should be no-op", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(3, 0);
        rcm.setRowHeight(1, 20);
        rcm.moveRow(1, 1);
        expect(rcm.getRowHeight(1)).toBe(20);
    });

    it("moveCol same index should be no-op", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 3);
        rcm.setColWidth(1, 60);
        rcm.moveCol(1, 1);
        expect(rcm.getColWidth(1)).toBe(60);
    });

    it("moveRow should shift hidden rows", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(5, 0);
        rcm.hideRow(1);
        rcm.moveRow(1, 3);
        expect(rcm.isRowHidden(3)).toBe(true);
    });

    it("moveCol should shift hidden cols", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 5);
        rcm.hideColumn(1);
        rcm.moveCol(1, 3);
        expect(rcm.isColumnHidden(3)).toBe(true);
    });
});

describe("RowColManager - Hide/Show Rows", () => {
    it("hideRow should set height to 0", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(5, 0);
        rcm.setRowHeight(2, 50);
        rcm.hideRow(2);
        expect(rcm.getRowHeight(2)).toBe(0);
        expect(rcm.isRowHidden(2)).toBe(true);
    });

    it("showRow should restore original height", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(5, 0);
        rcm.setRowHeight(2, 50);
        rcm.hideRow(2);
        rcm.showRow(2);
        expect(rcm.getRowHeight(2)).toBe(50);
        expect(rcm.isRowHidden(2)).toBe(false);
    });

    it("showRow on non-hidden row should be no-op", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(5, 0);
        rcm.setRowHeight(2, 50);
        rcm.showRow(2);
        expect(rcm.getRowHeight(2)).toBe(50);
    });

    it("hideRow negative should be no-op", () => {
        const rcm = new RowColManager();
        rcm.hideRow(-1);
        expect(rcm.hasHiddenRows).toBe(false);
    });

    it("hideRow duplicate should be no-op", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(5, 0);
        rcm.hideRow(2);
        rcm.hideRow(2);
        expect(rcm.getHiddenRows()).toEqual([2]);
    });

    it("getHiddenRows should return sorted array", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(10, 0);
        rcm.hideRow(5);
        rcm.hideRow(2);
        rcm.hideRow(8);
        expect(rcm.getHiddenRows()).toEqual([2, 5, 8]);
    });

    it("clearHiddenRows should restore all heights", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(5, 0);
        rcm.setRowHeight(1, 40);
        rcm.setRowHeight(3, 60);
        rcm.hideRow(1);
        rcm.hideRow(3);
        rcm.clearHiddenRows();
        expect(rcm.getRowHeight(1)).toBe(40);
        expect(rcm.getRowHeight(3)).toBe(60);
        expect(rcm.hasHiddenRows).toBe(false);
    });

    it("visibleRowCount should exclude hidden rows", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(10, 0);
        rcm.hideRow(2);
        rcm.hideRow(5);
        expect(rcm.visibleRowCount).toBe(10 - 2);
    });
});

describe("RowColManager - Hide/Show Columns", () => {
    it("hideColumn should set width to 0", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 5);
        rcm.setColWidth(2, 150);
        rcm.hideColumn(2);
        expect(rcm.getColWidth(2)).toBe(0);
        expect(rcm.isColumnHidden(2)).toBe(true);
    });

    it("showColumn should restore original width", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 5);
        rcm.setColWidth(2, 150);
        rcm.hideColumn(2);
        rcm.showColumn(2);
        expect(rcm.getColWidth(2)).toBe(150);
    });

    it("clearHiddenColumns should restore all widths", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 5);
        rcm.setColWidth(1, 80);
        rcm.setColWidth(3, 120);
        rcm.hideColumn(1);
        rcm.hideColumn(3);
        rcm.clearHiddenColumns();
        expect(rcm.getColWidth(1)).toBe(80);
        expect(rcm.getColWidth(3)).toBe(120);
        expect(rcm.hasHiddenColumns).toBe(false);
    });

    it("visibleColCount should exclude hidden cols", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 10);
        rcm.hideColumn(1);
        rcm.hideColumn(4);
        expect(rcm.visibleColCount).toBe(10 - 2);
    });

    it("colAt should skip hidden columns", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 5);
        rcm.setColWidth(0, 100);
        rcm.setColWidth(1, 100);
        rcm.hideColumn(1);
        rcm.setColWidth(2, 100);
        expect(rcm.colAt(100)).toBe(2);
    });

    it("rowAt should skip hidden rows", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(5, 0);
        rcm.setRowHeight(0, 28);
        rcm.setRowHeight(1, 28);
        rcm.hideRow(1);
        rcm.setRowHeight(2, 28);
        expect(rcm.rowAt(28)).toBe(2);
    });
});

describe("RowColManager - getVisibleRange", () => {
    it("should return visible range for given viewport", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(100, 100);
        const range = rcm.getVisibleRange(0, 0, 500, 500);
        expect(range.topRow).toBe(0);
        expect(range.topCol).toBe(0);
        expect(range.bottomRow).toBeGreaterThan(0);
        expect(range.bottomCol).toBeGreaterThan(0);
    });

    it("should handle scrolled viewport", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(100, 100);
        const range = rcm.getVisibleRange(500, 500, 500, 500);
        expect(range.topRow).toBeGreaterThan(0);
        expect(range.topCol).toBeGreaterThan(0);
    });
});

describe("RowColManager - Pagination", () => {
    it.skip("setPaginationBounds should affect rowCount (功能已移除)", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(100, 10);
        rcm.setPaginationBounds(10, 30);
        expect(rcm.rowCount).toBe(20);
    });

    it.skip("clearPaginationBounds should restore normal rowCount (功能已移除)", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(100, 10);
        rcm.setPaginationBounds(10, 30);
        rcm.clearPaginationBounds();
        expect(rcm.rowCount).toBe(100);
    });
});

describe("RowColManager - Edge Cases", () => {
    it("ensureSize should clamp to MAX_ROWS", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(CONFIG.MAX_ROWS + 100, 0);
        expect(rcm.rowCount).toBeLessThanOrEqual(CONFIG.MAX_ROWS);
    });

    it("ensureSize should clamp to MAX_COLS", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, CONFIG.MAX_COLS + 100);
        expect(rcm.colCount).toBeLessThanOrEqual(CONFIG.MAX_COLS);
    });

    it("resetSize should clamp to MAX_ROWS", () => {
        const rcm = new RowColManager();
        rcm.resetSize(CONFIG.MAX_ROWS + 100, 10);
        expect(rcm.rowCount).toBeLessThanOrEqual(CONFIG.MAX_ROWS);
    });

    it("getRowHeight for hidden row should return 0", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(5, 0);
        rcm.setRowHeight(2, 50);
        rcm.hideRow(2);
        expect(rcm.getRowHeight(2)).toBe(0);
    });

    it("getColWidth for hidden col should return 0", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(0, 5);
        rcm.setColWidth(2, 150);
        rcm.hideColumn(2);
        expect(rcm.getColWidth(2)).toBe(0);
    });

    it("insertRow at end should append default row", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(3, 0);
        rcm.insertRow(3);
        expect(rcm.getRowHeight(3)).toBe(CONFIG.DEFAULT_ROW_HEIGHT);
    });

    it("deleteRow then insertRow round-trip", () => {
        const rcm = new RowColManager();
        rcm.ensureSize(5, 0);
        rcm.setRowHeight(2, 50);
        rcm.deleteRow(2);
        rcm.insertRow(2);
        expect(rcm.getRowHeight(2)).toBe(CONFIG.DEFAULT_ROW_HEIGHT);
    });
});