import { describe, it, expect } from "vitest";
import { HeaderLabelManager } from "@/workbook/managers/HeaderLabelManager";

function createMockSheet() {
    return {
        rowColManager: {
            rowCount: 100,
            colCount: 26,
        },
    };
}

describe("HeaderLabelManager - Default Column Labels", () => {
    it("should generate A for column 0", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        expect(hlm.getColHeader(0)).toBe("A");
    });

    it("should generate Z for column 25", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        expect(hlm.getColHeader(25)).toBe("Z");
    });

    it("should generate AA for column 26", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        expect(hlm.getColHeader(26)).toBe("AA");
    });

    it("should generate AZ for column 51", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        expect(hlm.getColHeader(51)).toBe("AZ");
    });

    it("should generate BA for column 52", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        expect(hlm.getColHeader(52)).toBe("BA");
    });
});

describe("HeaderLabelManager - Default Row Labels", () => {
    it("should generate 1 for row 0", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        expect(hlm.getRowHeader(0)).toBe("1");
    });

    it("should generate 10 for row 9", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        expect(hlm.getRowHeader(9)).toBe("10");
    });
});

describe("HeaderLabelManager - Custom Array Headers", () => {
    it("should use custom column headers from array", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        hlm.colHeaders = ["Name", "Age", "City"];
        expect(hlm.getColHeader(0)).toBe("Name");
        expect(hlm.getColHeader(1)).toBe("Age");
        expect(hlm.getColHeader(2)).toBe("City");
    });

    it("should fall back to default for index beyond array length", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        hlm.colHeaders = ["Name", "Age"];
        expect(hlm.getColHeader(0)).toBe("Name");
        expect(hlm.getColHeader(5)).toBe("F");
    });

    it("should use custom row headers from array", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        hlm.rowHeaders = ["Row1", "Row2", "Row3"];
        expect(hlm.getRowHeader(0)).toBe("Row1");
        expect(hlm.getRowHeader(2)).toBe("Row3");
    });
});

describe("HeaderLabelManager - Function Headers", () => {
    it("should use function for column headers", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        hlm.colHeaders = (col) => `Col_${col}`;
        expect(hlm.getColHeader(0)).toBe("Col_0");
        expect(hlm.getColHeader(5)).toBe("Col_5");
    });

    it("should use function for row headers", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        hlm.rowHeaders = (row) => `R${row + 100}`;
        expect(hlm.getRowHeader(0)).toBe("R100");
        expect(hlm.getRowHeader(5)).toBe("R105");
    });
});

describe("HeaderLabelManager - Nested Headers", () => {
    it("should return 0 nested header rows when not configured", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        expect(hlm.getNestedHeaderRowCount()).toBe(0);
    });

    it("should return nested header row count", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        hlm.nestedHeaders = [["A", "B"], ["C", "D"]];
        expect(hlm.getNestedHeaderRowCount()).toBe(2);
    });

    it("should get nested column header info", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        hlm.nestedHeaders = [[{ label: "Group", colspan: 2 }, "C"]];
        const info = hlm.getNestedColHeader(0, 0);
        expect(info).toEqual({ label: "Group", colspan: 2, style: null });
    });

    it("should return null for out-of-range layer", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        hlm.nestedHeaders = [["A", "B"]];
        expect(hlm.getNestedColHeader(5, 0)).toBeNull();
    });

    it("should return null for column beyond all items", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        hlm.nestedHeaders = [["A", "B"]];
        expect(hlm.getNestedColHeader(0, 10)).toBeNull();
    });

    it("should handle string items as label with colspan 1", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        hlm.nestedHeaders = [["A", "B", "C"]];
        const info = hlm.getNestedColHeader(0, 1);
        expect(info).toEqual({ label: "B", colspan: 1, style: null });
    });

    it("should find column within a colspan range", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        hlm.nestedHeaders = [[{ label: "Wide", colspan: 3 }, "D"]];
        const info0 = hlm.getNestedColHeader(0, 0);
        const info1 = hlm.getNestedColHeader(0, 1);
        const info2 = hlm.getNestedColHeader(0, 2);
        expect(info0).toEqual({ label: "Wide", colspan: 3, style: null });
        expect(info1).toEqual({ label: "Wide", colspan: 3, style: null });
        expect(info2).toEqual({ label: "Wide", colspan: 3, style: null });
    });
});

describe("HeaderLabelManager - Header Size", () => {
    it("should return default header height", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        expect(hlm.getHeaderHeight()).toBeGreaterThan(0);
    });

    it("should return multiplied height for nested headers", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        const singleH = hlm.getHeaderHeight();
        hlm.nestedHeaders = [["A"], ["B"]];
        const nestedH = hlm.getHeaderHeight();
        expect(nestedH).toBe(singleH * 2);
    });

    it("should return default header width", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        expect(hlm.getHeaderWidth()).toBeGreaterThan(0);
    });

    it("should use custom rowHeaderWidth", () => {
        const hlm = new HeaderLabelManager(createMockSheet());
        hlm.rowHeaderWidth = 80;
        expect(hlm.getHeaderWidth()).toBe(80);
    });
});