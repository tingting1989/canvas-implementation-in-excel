import { describe, it, expect } from "vitest";
import { RowColSync } from "@/model/grid/RowColSync";
import { CONFIG } from "@/constants/config";

function createMockSheet(axis) {
    const rowHeaders = ["R0", "R1", "R2", "R3", "R4", "R5"];
    const colHeaders = ["C0", "C1", "C2", "C3", "C4", "C5"];
    const rowStyles = new Map();
    const colStyles = new Map();
    const columnsConfig = new Map();
    const dataBindings = new Map();
    const cellTypes = new Map();

    return {
        rowHeaders,
        colHeaders,
        rowStyles,
        colStyles,
        columnsConfig,
        dataBindings,
        cellTypes,
        nestedHeaders: null,
    };
}

describe("RowColSync - Row Insert", () => {
    it("should insert element into row headers", () => {
        const sheet = createMockSheet("row");
        const sync = new RowColSync(sheet, CONFIG.AXIS_ROW);
        sync.insert(2);
        expect(sheet.rowHeaders[2]).toBe("");
        expect(sheet.rowHeaders[3]).toBe("R2");
        expect(sheet.rowHeaders.length).toBe(7);
    });

    it("should shift rowStyles keys after insert position", () => {
        const sheet = createMockSheet("row");
        sheet.rowStyles.set(3, { color: "red" });
        sheet.rowStyles.set(1, { color: "blue" });
        const sync = new RowColSync(sheet, CONFIG.AXIS_ROW);
        sync.insert(2);
        expect(sheet.rowStyles.get(4)).toEqual({ color: "red" });
        expect(sheet.rowStyles.get(1)).toEqual({ color: "blue" });
        expect(sheet.rowStyles.has(3)).toBe(false);
    });

    it("should shift cellTypes keys for row axis", () => {
        const sheet = createMockSheet("row");
        sheet.cellTypes.set("3,0", { name: "numeric" });
        sheet.cellTypes.set("1,0", { name: "text" });
        const sync = new RowColSync(sheet, CONFIG.AXIS_ROW);
        sync.insert(2);
        expect(sheet.cellTypes.get("4,0")).toEqual({ name: "numeric" });
        expect(sheet.cellTypes.get("1,0")).toEqual({ name: "text" });
        expect(sheet.cellTypes.has("3,0")).toBe(false);
    });
});

describe("RowColSync - Row Delete", () => {
    it("should delete element from row headers", () => {
        const sheet = createMockSheet("row");
        const sync = new RowColSync(sheet, CONFIG.AXIS_ROW);
        sync.delete(2);
        expect(sheet.rowHeaders[2]).toBe("R3");
        expect(sheet.rowHeaders.length).toBe(5);
    });

    it("should remove and shift rowStyles keys", () => {
        const sheet = createMockSheet("row");
        sheet.rowStyles.set(2, { color: "red" });
        sheet.rowStyles.set(4, { color: "blue" });
        const sync = new RowColSync(sheet, CONFIG.AXIS_ROW);
        sync.delete(2);
        expect(sheet.rowStyles.has(2)).toBe(false);
        expect(sheet.rowStyles.get(3)).toEqual({ color: "blue" });
    });

    it("should delete cellTypes at deleted row", () => {
        const sheet = createMockSheet("row");
        sheet.cellTypes.set("2,0", { name: "numeric" });
        sheet.cellTypes.set("4,0", { name: "text" });
        const sync = new RowColSync(sheet, CONFIG.AXIS_ROW);
        sync.delete(2);
        expect(sheet.cellTypes.has("2,0")).toBe(false);
        expect(sheet.cellTypes.get("3,0")).toEqual({ name: "text" });
    });
});

describe("RowColSync - Column Insert", () => {
    it("should insert element into col headers", () => {
        const sheet = createMockSheet("col");
        const sync = new RowColSync(sheet, CONFIG.AXIS_COL);
        sync.insert(1);
        expect(sheet.colHeaders[1]).toBe("");
        expect(sheet.colHeaders[2]).toBe("C1");
        expect(sheet.colHeaders.length).toBe(7);
    });

    it("should shift columnsConfig keys", () => {
        const sheet = createMockSheet("col");
        sheet.columnsConfig.set(2, { type: "numeric" });
        const sync = new RowColSync(sheet, CONFIG.AXIS_COL);
        sync.insert(1);
        expect(sheet.columnsConfig.get(3)).toEqual({ type: "numeric" });
        expect(sheet.columnsConfig.has(2)).toBe(false);
    });

    it("should shift colStyles keys", () => {
        const sheet = createMockSheet("col");
        sheet.colStyles.set(3, 5);
        const sync = new RowColSync(sheet, CONFIG.AXIS_COL);
        sync.insert(2);
        expect(sheet.colStyles.get(4)).toBe(5);
    });

    it("should shift dataBindings keys", () => {
        const sheet = createMockSheet("col");
        const fn = () => {};
        sheet.dataBindings.set(2, fn);
        const sync = new RowColSync(sheet, CONFIG.AXIS_COL);
        sync.insert(1);
        expect(sheet.dataBindings.has(3)).toBe(true);
    });

    it("should shift cellTypes keys for col axis", () => {
        const sheet = createMockSheet("col");
        sheet.cellTypes.set("0,2", { name: "numeric" });
        const sync = new RowColSync(sheet, CONFIG.AXIS_COL);
        sync.insert(1);
        expect(sheet.cellTypes.get("0,3")).toEqual({ name: "numeric" });
    });
});

describe("RowColSync - Column Delete", () => {
    it("should delete element from col headers", () => {
        const sheet = createMockSheet("col");
        const sync = new RowColSync(sheet, CONFIG.AXIS_COL);
        sync.delete(1);
        expect(sheet.colHeaders[1]).toBe("C2");
        expect(sheet.colHeaders.length).toBe(5);
    });

    it("should remove and shift columnsConfig keys", () => {
        const sheet = createMockSheet("col");
        sheet.columnsConfig.set(1, { type: "numeric" });
        sheet.columnsConfig.set(3, { type: "date" });
        const sync = new RowColSync(sheet, CONFIG.AXIS_COL);
        sync.delete(1);
        expect(sheet.columnsConfig.has(1)).toBe(false);
        expect(sheet.columnsConfig.get(2)).toEqual({ type: "date" });
    });
});

describe("RowColSync - Move", () => {
    it("should move element in row headers from lower to higher", () => {
        const sheet = createMockSheet("row");
        const sync = new RowColSync(sheet, CONFIG.AXIS_ROW);
        sync.move(1, 4);
        expect(sheet.rowHeaders[4]).toBe("R1");
        expect(sheet.rowHeaders[1]).toBe("R2");
    });

    it("should move element in row headers from higher to lower", () => {
        const sheet = createMockSheet("row");
        const sync = new RowColSync(sheet, CONFIG.AXIS_ROW);
        sync.move(4, 1);
        expect(sheet.rowHeaders[1]).toBe("R4");
        expect(sheet.rowHeaders[2]).toBe("R1");
    });

    it("should remap rowStyles keys on move", () => {
        const sheet = createMockSheet("row");
        sheet.rowStyles.set(1, { color: "red" });
        sheet.rowStyles.set(3, { color: "blue" });
        const sync = new RowColSync(sheet, CONFIG.AXIS_ROW);
        sync.move(1, 3);
        expect(sheet.rowStyles.get(3)).toEqual({ color: "red" });
        expect(sheet.rowStyles.get(2)).toEqual({ color: "blue" });
    });

    it("should be no-op when from === to", () => {
        const sheet = createMockSheet("row");
        const sync = new RowColSync(sheet, CONFIG.AXIS_ROW);
        sync.move(2, 2);
        expect(sheet.rowHeaders[2]).toBe("R2");
    });
});