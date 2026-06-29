import { describe, it, expect, vi, beforeEach } from "vitest";
import { Sheet } from "@/workbook/Sheet";
import { Cell } from "@/model/store/Cell";

describe("Sheet - Construction", () => {
    it("should create sheet with name", () => {
        const sheet = new Sheet("TestSheet");
        expect(sheet.name).toBe("TestSheet");
    });

    it("should have cellStore", () => {
        const sheet = new Sheet("Test");
        expect(sheet.cellStore).toBeDefined();
    });

    it("should have selection manager", () => {
        const sheet = new Sheet("Test");
        expect(sheet.selection).toBeDefined();
    });

    it("should have history stack", () => {
        const sheet = new Sheet("Test");
        expect(sheet.history).toBeDefined();
    });

    it("should have merge manager", () => {
        const sheet = new Sheet("Test");
        expect(sheet.mergeManager).toBeDefined();
    });

    it("should have rowColManager", () => {
        const sheet = new Sheet("Test");
        expect(sheet.rowColManager).toBeDefined();
    });

    it("should be visible by default", () => {
        const sheet = new Sheet("Test");
        expect(sheet.visible).toBe(true);
    });
});

describe("Sheet - setCell / getCell", () => {
    it("should set and get cell value", () => {
        const sheet = new Sheet("Test");
        sheet.setCell(0, 0, "hello");
        const cell = sheet.cellStore.get(0, 0);
        expect(cell).toBeDefined();
        expect(cell.value).toBe("hello");
    });

    it("should set cell with style", () => {
        const sheet = new Sheet("Test");
        sheet.setCell(0, 0, "styled", 5);
        const cell = sheet.cellStore.get(0, 0);
        expect(cell.styleId).toBe(5);
    });

    it("should set cell as disabled", () => {
        const sheet = new Sheet("Test");
        sheet.setCell(0, 0, "disabled", 0, true);
        const cell = sheet.cellStore.get(0, 0);
        expect(cell.disabled).toBe(true);
    });

    it("should not set cell when readOnly", () => {
        const sheet = new Sheet("Test");
        sheet.readOnly = true;
        sheet.setCell(0, 0, "should not work");
        const cell = sheet.cellStore.get(0, 0);
        expect(cell).toBeUndefined();
    });
});

describe("Sheet - ReadOnly Mode", () => {
    it("should default to not read-only", () => {
        const sheet = new Sheet("Test");
        expect(sheet.readOnly).toBe(false);
    });

    it("should set readOnly mode", () => {
        const sheet = new Sheet("Test");
        sheet.readOnly = true;
        expect(sheet.readOnly).toBe(true);
    });

    it("should coerce readOnly to boolean", () => {
        const sheet = new Sheet("Test");
        sheet.readOnly = 1;
        expect(sheet.readOnly).toBe(true);
        sheet.readOnly = 0;
        expect(sheet.readOnly).toBe(false);
    });
});

describe("Sheet - Freeze", () => {
    it("should default to 0 frozen rows and cols", () => {
        const sheet = new Sheet("Test");
        expect(sheet.fixedRowsTop).toBe(0);
        expect(sheet.fixedColumnsStart).toBe(0);
    });

    it("should set frozen rows", () => {
        const sheet = new Sheet("Test");
        sheet.fixedRowsTop = 3;
        expect(sheet.fixedRowsTop).toBe(3);
    });

    it("should set frozen cols", () => {
        const sheet = new Sheet("Test");
        sheet.fixedColumnsStart = 2;
        expect(sheet.fixedColumnsStart).toBe(2);
    });

    it("should return 0 frozen height when no frozen rows", () => {
        const sheet = new Sheet("Test");
        expect(sheet.frozenRowsHeight).toBe(0);
    });

    it("should return 0 frozen width when no frozen cols", () => {
        const sheet = new Sheet("Test");
        expect(sheet.frozenColsWidth).toBe(0);
    });

    it("should compute frozen rows height", () => {
        const sheet = new Sheet("Test");
        sheet.fixedRowsTop = 2;
        expect(sheet.frozenRowsHeight).toBeGreaterThan(0);
    });

    it("should compute frozen cols width", () => {
        const sheet = new Sheet("Test");
        sheet.fixedColumnsStart = 2;
        expect(sheet.frozenColsWidth).toBeGreaterThan(0);
    });

    it("should invalidate freeze cache on invalidateFreezeCache()", () => {
        const sheet = new Sheet("Test");
        sheet.fixedRowsTop = 2;
        const h1 = sheet.frozenRowsHeight;
        sheet.invalidateFreezeCache();
        const h2 = sheet.frozenRowsHeight;
        expect(h1).toBe(h2);
    });
});

describe("Sheet - Row Number Conversion", () => {
    it("should convert page row to real row", () => {
        const sheet = new Sheet("Test");
        expect(sheet.toRealRow(0)).toBe(0);
        expect(sheet.toRealRow(5)).toBe(5);
    });

    it("should convert real row to page row", () => {
        const sheet = new Sheet("Test");
        expect(sheet.toPageRow(0)).toBe(0);
        expect(sheet.toPageRow(5)).toBe(5);
    });

    it("should convert column numbers (identity for visible/real)", () => {
        const sheet = new Sheet("Test");
        expect(sheet.toRealCol(3)).toBe(3);
        expect(sheet.toVisibleCol(3)).toBe(3);
    });
});

describe("Sheet - bus events (replaces onChange)", () => {
    it("should emit INVALIDATE_CELL event on setCell", () => {
        const sheet = new Sheet("Test");
        const handler = vi.fn();
        sheet.bus.on("sheet:invalidate-cell", handler);
        sheet.setCell(0, 0, "test");
        expect(handler).toHaveBeenCalled();
    });
});

describe("Sheet - Header Labels", () => {
    it("should return default column header", () => {
        const sheet = new Sheet("Test");
        expect(sheet.getColHeader(0)).toBe("A");
        expect(sheet.getColHeader(25)).toBe("Z");
    });

    it("should return default row header", () => {
        const sheet = new Sheet("Test");
        expect(sheet.getRowHeader(0)).toBe("1");
    });

    it("should use custom column headers", () => {
        const sheet = new Sheet("Test");
        sheet.colHeaders = ["Name", "Age", "City"];
        expect(sheet.getColHeader(0)).toBe("Name");
        expect(sheet.getColHeader(1)).toBe("Age");
    });

    it("should use custom row headers", () => {
        const sheet = new Sheet("Test");
        sheet.rowHeaders = (r) => `R${r + 1}`;
        expect(sheet.getRowHeader(0)).toBe("R1");
    });
});

describe("Sheet - Header Size", () => {
    it("should return header height", () => {
        const sheet = new Sheet("Test");
        expect(sheet.getHeaderHeight()).toBeGreaterThan(0);
    });

    it("should return header width", () => {
        const sheet = new Sheet("Test");
        expect(sheet.getHeaderWidth()).toBeGreaterThan(0);
    });
});

describe("Sheet - Merge Operations", () => {
    it("should merge cells", () => {
        const sheet = new Sheet("Test");
        sheet.mergeCells(0, 0, 2, 3);
        expect(sheet.mergeManager.getCount()).toBe(1);
    });

    it("should unmerge cells", () => {
        const sheet = new Sheet("Test");
        sheet.mergeCells(0, 0, 2, 3);
        sheet.unmergeCells(0, 0);
        expect(sheet.mergeManager.getCount()).toBe(0);
    });

    it("should check if cell is merged", () => {
        const sheet = new Sheet("Test");
        sheet.mergeCells(0, 0, 2, 3);
        expect(sheet.isMergedCell(0, 0)).toBe(false);
        expect(sheet.isMergedCell(1, 1)).toBe(true);
    });
});

describe("Sheet - Undo/Redo", () => {
    it("should undo setCell", () => {
        const sheet = new Sheet("Test");
        sheet.setCell(0, 0, "original");
        sheet.setCell(0, 0, "modified");
        sheet.history.undo();
        const cell = sheet.cellStore.get(0, 0);
        expect(cell.value).toBe("original");
    });

    it("should redo setCell", () => {
        const sheet = new Sheet("Test");
        sheet.setCell(0, 0, "original");
        sheet.setCell(0, 0, "modified");
        sheet.history.undo();
        sheet.history.redo();
        const cell = sheet.cellStore.get(0, 0);
        expect(cell.value).toBe("modified");
    });
});

describe("Sheet - setRowStyle / setColStyle type validation", () => {
    it("should throw TypeError when setRowStyle receives number", () => {
        const sheet = new Sheet("Test");
        expect(() => sheet.setRowStyle(0, 5)).toThrow(TypeError);
    });

    it("should throw TypeError when setColStyle receives number", () => {
        const sheet = new Sheet("Test");
        expect(() => sheet.setColStyle(0, 5)).toThrow(TypeError);
    });

    it("should throw TypeError when setRowStyle receives null", () => {
        const sheet = new Sheet("Test");
        expect(() => sheet.setRowStyle(0, null)).toThrow(TypeError);
    });

    it("should throw TypeError when setRowStyle receives undefined", () => {
        const sheet = new Sheet("Test");
        expect(() => sheet.setRowStyle(0, undefined)).toThrow(TypeError);
    });

    it("should accept styleObj in setRowStyle", () => {
        const sheet = new Sheet("Test");
        sheet.setRowStyle(0, { backgroundColor: "yellow" });
        const style = sheet.resolveStyle(0, 0);
        expect(style.backgroundColor).toBe("yellow");
    });

    it("should accept styleObj in setColStyle", () => {
        const sheet = new Sheet("Test");
        sheet.setColStyle(0, { textAlign: "right" });
        const style = sheet.resolveStyle(0, 0);
        expect(style.textAlign).toBe("right");
    });
});

describe("Sheet - batchStyleUpdate", () => {
    it("should apply all style changes after batch ends", () => {
        const sheet = new Sheet("Test");
        sheet.batchStyleUpdate((s) => {
            s.setCellStyle(0, 0, { fontWeight: "bold" });
            s.setCellStyle(0, 1, { fontWeight: "bold" });
            s.setCellStyle(0, 2, { fontWeight: "bold" });
        });

        expect(sheet.resolveStyle(0, 0).fontWeight).toBe("bold");
        expect(sheet.resolveStyle(0, 1).fontWeight).toBe("bold");
        expect(sheet.resolveStyle(0, 2).fontWeight).toBe("bold");
    });

    it("should still apply changes if error occurs in callback", () => {
        const sheet = new Sheet("Test");
        try {
            sheet.batchStyleUpdate((s) => {
                s.setCellStyle(0, 0, { fontWeight: "bold" });
                throw new Error("test error");
            });
        } catch (e) {
            // expected
        }

        expect(sheet.resolveStyle(0, 0).fontWeight).toBe("bold");
    });
});