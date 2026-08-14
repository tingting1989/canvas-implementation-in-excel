import { describe, it, expect } from "vitest";
import { RowColManager } from "@/model/grid/RowColManager";

describe("RowColManager - basic sizing", () => {
    it("should have default row height and col width", () => {
        const mgr = new RowColManager();
        expect(mgr.getRowHeight(0)).toBe(28);
        expect(mgr.getColWidth(0)).toBe(100);
    });

    it("should set and get row height", () => {
        const mgr = new RowColManager();
        mgr.setRowHeight(0, 50);
        expect(mgr.getRowHeight(0)).toBe(50);
    });

    it("should set and get col width", () => {
        const mgr = new RowColManager();
        mgr.setColWidth(0, 200);
        expect(mgr.getColWidth(0)).toBe(200);
    });
});

describe("RowColManager - resetSize / ensureSize", () => {
    it("should reset size explicitly", () => {
        const mgr = new RowColManager();
        mgr.resetSize(100, 26);
        expect(mgr.rowCount).toBe(100);
        expect(mgr.colCount).toBe(26);
        expect(mgr.isExplicitlySized).toBe(true);
    });

    it("should ensure size grows arrays", () => {
        const mgr = new RowColManager();
        mgr.ensureSize(50, 10);
        expect(mgr.rowCount).toBeGreaterThanOrEqual(50);
        expect(mgr.colCount).toBeGreaterThanOrEqual(10);
    });

    it("should not shrink with ensureSize", () => {
        const mgr = new RowColManager();
        mgr.ensureSize(100, 20);
        mgr.ensureSize(50, 10);
        expect(mgr.rowCount).toBeGreaterThanOrEqual(100);
        expect(mgr.colCount).toBeGreaterThanOrEqual(20);
    });
});

describe("RowColManager - coordinate conversion", () => {
    it("should get row Y coordinate", () => {
        const mgr = new RowColManager();
        mgr.setRowHeight(0, 30);
        expect(mgr.getRowY(0)).toBe(0);
        expect(mgr.getRowY(1)).toBe(30);
    });

    it("should get col X coordinate", () => {
        const mgr = new RowColManager();
        mgr.setColWidth(0, 120);
        expect(mgr.getColX(0)).toBe(0);
        expect(mgr.getColX(1)).toBe(120);
    });

    it("should find row at Y pixel", () => {
        const mgr = new RowColManager();
        mgr.setRowHeight(0, 30);
        mgr.setRowHeight(1, 30);
        expect(mgr.rowAt(0)).toBe(0);
        expect(mgr.rowAt(30)).toBe(1);
    });

    it("should find col at X pixel", () => {
        const mgr = new RowColManager();
        mgr.setColWidth(0, 100);
        mgr.setColWidth(1, 100);
        expect(mgr.colAt(0)).toBe(0);
        expect(mgr.colAt(100)).toBe(1);
    });
});

describe("RowColManager - insertRow / insertCol", () => {
    it("should insert row and shift heights", () => {
        const mgr = new RowColManager();
        mgr.setRowHeight(0, 50);
        mgr.setRowHeight(1, 60);
        mgr.insertRow(0);
        expect(mgr.getRowHeight(0)).toBe(28);
        expect(mgr.getRowHeight(1)).toBe(50);
        expect(mgr.getRowHeight(2)).toBe(60);
    });

    it("should insert col and shift widths", () => {
        const mgr = new RowColManager();
        mgr.setColWidth(0, 120);
        mgr.setColWidth(1, 150);
        mgr.insertCol(0);
        expect(mgr.getColWidth(0)).toBe(100);
        expect(mgr.getColWidth(1)).toBe(120);
        expect(mgr.getColWidth(2)).toBe(150);
    });
});

describe("RowColManager - deleteRow / deleteCol", () => {
    it("should delete row and shift heights up", () => {
        const mgr = new RowColManager();
        mgr.setRowHeight(0, 50);
        mgr.setRowHeight(1, 60);
        mgr.setRowHeight(2, 70);
        mgr.deleteRow(1);
        expect(mgr.getRowHeight(0)).toBe(50);
        expect(mgr.getRowHeight(1)).toBe(70);
    });

    it("should delete col and shift widths left", () => {
        const mgr = new RowColManager();
        mgr.setColWidth(0, 120);
        mgr.setColWidth(1, 150);
        mgr.setColWidth(2, 180);
        mgr.deleteCol(1);
        expect(mgr.getColWidth(0)).toBe(120);
        expect(mgr.getColWidth(1)).toBe(180);
    });
});

describe("RowColManager - moveRow / moveCol", () => {
    it("should move row to new position", () => {
        const mgr = new RowColManager();
        mgr.setRowHeight(0, 50);
        mgr.setRowHeight(1, 60);
        mgr.setRowHeight(2, 70);
        mgr.moveRow(0, 2);
        expect(mgr.getRowHeight(0)).toBe(60);
        expect(mgr.getRowHeight(1)).toBe(70);
        expect(mgr.getRowHeight(2)).toBe(50);
    });

    it("should move col to new position", () => {
        const mgr = new RowColManager();
        mgr.setColWidth(0, 120);
        mgr.setColWidth(1, 150);
        mgr.setColWidth(2, 180);
        mgr.moveCol(0, 2);
        expect(mgr.getColWidth(0)).toBe(150);
        expect(mgr.getColWidth(1)).toBe(180);
        expect(mgr.getColWidth(2)).toBe(120);
    });
});

describe("RowColManager - hide/show column", () => {
    it("should hide and show column", () => {
        const mgr = new RowColManager();
        mgr.setColWidth(2, 150);
        mgr.hideColumn(2);
        expect(mgr.isColumnHidden(2)).toBe(true);
        expect(mgr.getColWidth(2)).toBe(0);
        mgr.showColumn(2);
        expect(mgr.isColumnHidden(2)).toBe(false);
        expect(mgr.getColWidth(2)).toBe(150);
    });

    it("should report hasHiddenColumns", () => {
        const mgr = new RowColManager();
        expect(mgr.hasHiddenColumns).toBe(false);
        mgr.hideColumn(0);
        expect(mgr.hasHiddenColumns).toBe(true);
    });

    it("should get hidden columns list", () => {
        const mgr = new RowColManager();
        mgr.hideColumn(3);
        mgr.hideColumn(1);
        expect(mgr.getHiddenColumns()).toEqual([1, 3]);
    });

    it("should clear all hidden columns", () => {
        const mgr = new RowColManager();
        mgr.hideColumn(1);
        mgr.hideColumn(3);
        mgr.clearHiddenColumns();
        expect(mgr.hasHiddenColumns).toBe(false);
    });
});

describe("RowColManager - hide/show row", () => {
    it("should hide and show row", () => {
        const mgr = new RowColManager();
        mgr.setRowHeight(2, 50);
        mgr.hideRow(2);
        expect(mgr.isRowHidden(2)).toBe(true);
        expect(mgr.getRowHeight(2)).toBe(0);
        mgr.showRow(2);
        expect(mgr.isRowHidden(2)).toBe(false);
        expect(mgr.getRowHeight(2)).toBe(50);
    });

    it("should report hasHiddenRows", () => {
        const mgr = new RowColManager();
        expect(mgr.hasHiddenRows).toBe(false);
        mgr.hideRow(0);
        expect(mgr.hasHiddenRows).toBe(true);
    });

    it("should clear all hidden rows", () => {
        const mgr = new RowColManager();
        mgr.hideRow(1);
        mgr.hideRow(3);
        mgr.clearHiddenRows();
        expect(mgr.hasHiddenRows).toBe(false);
    });
});

describe("RowColManager - getVisibleRange", () => {
    it("should compute visible range from viewport", () => {
        const mgr = new RowColManager();
        mgr.ensureSize(100, 26);
        const range = mgr.getVisibleRange(0, 0, 500, 500);
        expect(range.topRow).toBe(0);
        expect(range.topCol).toBe(0);
        expect(range.bottomRow).toBeGreaterThan(0);
        expect(range.bottomCol).toBeGreaterThan(0);
    });
});

describe("RowColManager - visible count", () => {
    it("should count visible rows excluding hidden", () => {
        const mgr = new RowColManager();
        mgr.ensureSize(10, 10);
        const totalBefore = mgr.visibleRowCount;
        mgr.hideRow(5);
        expect(mgr.visibleRowCount).toBe(totalBefore - 1);
    });

    it("should count visible cols excluding hidden", () => {
        const mgr = new RowColManager();
        mgr.ensureSize(10, 10);
        const totalBefore = mgr.visibleColCount;
        mgr.hideColumn(5);
        expect(mgr.visibleColCount).toBe(totalBefore - 1);
    });
});