import { describe, it, expect } from "vitest";
import { RowColSync } from "@/model/grid/RowColSync";

interface MockSheet {
    rowHeaders: string[];
    colHeaders: string[];
    rowStyles: Map<number, unknown>;
    columnsConfig: Map<number, unknown>;
    colStyles: Map<number, unknown>;
    dataBindings: Map<number, unknown>;
    cellTypes: Map<string, unknown>;
    nestedHeaders: (string | Record<string, unknown>)[][];
}

function createMockSheet(): MockSheet {
    return {
        rowHeaders: ["1", "2", "3", "4", "5"],
        colHeaders: ["A", "B", "C", "D", "E"],
        rowStyles: new Map([[1, { bold: true }]]),
        columnsConfig: new Map([[2, { width: 200 }]]),
        colStyles: new Map(),
        dataBindings: new Map(),
        cellTypes: new Map([["1,2", { type: "number" }]]),
        nestedHeaders: [],
    };
}

describe("RowColSync - insert (row axis)", () => {
    it("should insert a row header and shift map keys", () => {
        const sheet = createMockSheet();
        const sync = new RowColSync(sheet, "row");
        sync.insert(1);
        expect(sheet.rowHeaders[1]).toBe("");
        expect(sheet.rowStyles.has(1)).toBe(false);
        expect(sheet.rowStyles.has(2)).toBe(true);
    });
});

describe("RowColSync - delete (row axis)", () => {
    it("should delete a row header and shift map keys", () => {
        const sheet = createMockSheet();
        const sync = new RowColSync(sheet, "row");
        sync.delete(1);
        expect(sheet.rowHeaders.length).toBe(4);
        expect(sheet.rowStyles.has(1)).toBe(false);
    });
});

describe("RowColSync - move (row axis)", () => {
    it("should move a row header and remap keys", () => {
        const sheet = createMockSheet();
        const sync = new RowColSync(sheet, "row");
        sync.move(1, 3);
        expect(sheet.rowHeaders[3]).toBe("2");
    });
});

describe("RowColSync - insert (col axis)", () => {
    it("should insert a col header and shift map keys", () => {
        const sheet = createMockSheet();
        const sync = new RowColSync(sheet, "col");
        sync.insert(2);
        expect(sheet.colHeaders[2]).toBe("");
        expect(sheet.columnsConfig.has(2)).toBe(false);
        expect(sheet.columnsConfig.has(3)).toBe(true);
    });
});

describe("RowColSync - delete (col axis)", () => {
    it("should delete a col header and shift map keys", () => {
        const sheet = createMockSheet();
        const sync = new RowColSync(sheet, "col");
        sync.delete(2);
        expect(sheet.colHeaders.length).toBe(4);
        expect(sheet.columnsConfig.has(2)).toBe(false);
    });
});

describe("RowColSync - cellTypes remapping", () => {
    it("should remap cellTypes keys on row insert", () => {
        const sheet = createMockSheet();
        const sync = new RowColSync(sheet, "row");
        sync.insert(1);
        expect(sheet.cellTypes.has("1,2")).toBe(false);
        expect(sheet.cellTypes.has("2,2")).toBe(true);
    });

    it("should delete cellTypes entries on row delete", () => {
        const sheet = createMockSheet();
        const sync = new RowColSync(sheet, "row");
        sync.delete(1);
        expect(sheet.cellTypes.has("1,2")).toBe(false);
    });
});