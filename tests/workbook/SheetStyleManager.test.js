import { describe, it, expect, vi, beforeEach } from "vitest";
import { SheetStyleManager } from "@/workbook/managers/SheetStyleManager";
import { stylePool } from "@/model/styles";
import { Cell } from "@/model/store/Cell";
import { ChunkedCellStore } from "@/model/store/ChunkedCellStore";
import { RowColManager } from "@/model/grid/RowColManager";

function createMockSheet() {
    const store = new ChunkedCellStore();
    const rc = new RowColManager();
    return {
        cellStore: store,
        rowColManager: rc,
        isDisabled: () => false,
        cellsFn: null,
        columnsConfig: new Map(),
        hasConditionalRules: () => false,
        hasDataBindings: () => false,
        matchConditionalStyle: () => null,
        getDataBindStyle: () => null,
        getCellTypeInstance: () => null,
        resolveCellProperties: () => null,
        // v2.0+ 重构：添加 CellDataAccessor 支持
        cellDataAccessor: {
            forEach: (topRow, topCol, bottomRow, bottomCol, callback) => {
                for (let r = topRow; r <= bottomRow; r++) {
                    for (let c = topCol; c <= bottomCol; c++) {
                        callback(r, c);
                    }
                }
            },
            get: (row, col) => store.get(row, col),
        },
    };
}

describe("SheetStyleManager - Default Style", () => {
    it("should return default style initially", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        const style = ssm.getDefaultStyle();
        expect(style).toBeDefined();
        expect(typeof style).toBe("object");
    });

    it("should set and get default style", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        ssm.setDefaultStyle({ color: "red", fontSize: 14 });
        const style = ssm.getDefaultStyle();
        expect(style.color).toBe("red");
        expect(style.fontSize).toBe(14);
    });
});

describe("SheetStyleManager - Row/Column Styles", () => {
    it("should set and retrieve row style", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        const styleId = stylePool.getStyleId({ fontWeight: "bold" });
        ssm.setRowStyle(0, styleId);
        expect(ssm.rowStyles.get(0)).toBe(styleId);
    });

    it("should set and retrieve column style", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        const styleId = stylePool.getStyleId({ textAlign: "center" });
        ssm.setColStyle(2, styleId);
        expect(ssm.colStyles.get(2)).toBe(styleId);
    });

    it("should clear row style", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        const styleId = stylePool.getStyleId({ fontWeight: "bold" });
        ssm.setRowStyle(0, styleId);
        ssm.clearRowStyle(0);
        expect(ssm.rowStyles.has(0)).toBe(false);
    });

    it("should clear column style", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        const styleId = stylePool.getStyleId({ textAlign: "center" });
        ssm.setColStyle(2, styleId);
        ssm.clearColStyle(2);
        expect(ssm.colStyles.has(2)).toBe(false);
    });

    it("should not fail when clearing non-existent row style", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        expect(() => ssm.clearRowStyle(99)).not.toThrow();
    });
});

describe("SheetStyleManager - Cell Styles", () => {
    it("should set cell style with incremental merge", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        sheet.cellStore.set(0, 0, new Cell("test", 0, false));
        ssm.setCellStyle(0, 0, { color: "blue" });
        const cell = sheet.cellStore.get(0, 0);
        expect(cell.styleId).toBeGreaterThan(0);
        const style = stylePool.getStyle(cell.styleId);
        expect(style.color).toBe("blue");
    });

    it("should merge new style with existing cell style", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        const existingStyleId = stylePool.getStyleId({ color: "red" });
        sheet.cellStore.set(0, 0, new Cell("test", existingStyleId, false));
        ssm.setCellStyle(0, 0, { fontSize: 16 });
        const cell = sheet.cellStore.get(0, 0);
        const style = stylePool.getStyle(cell.styleId);
        expect(style.color).toBe("red");
        expect(style.fontSize).toBe(16);
    });

    it("should clear cell style", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        const styleId = stylePool.getStyleId({ color: "red" });
        sheet.cellStore.set(0, 0, new Cell("test", styleId, false));
        ssm.clearCellStyle(0, 0);
        const cell = sheet.cellStore.get(0, 0);
        expect(cell.styleId).toBe(0);
    });

    it("should not fail when clearing style of cell with no custom style", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        expect(() => ssm.clearCellStyle(0, 0)).not.toThrow();
    });
});

describe("SheetStyleManager - Cache Invalidation", () => {
    it("should invalidate cache on style change", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        const versionBefore = ssm.defaultStyleId;
        ssm.setDefaultStyle({ color: "green" });
        expect(ssm.defaultStyleId).not.toBe(versionBefore);
    });
});

describe("SheetStyleManager - resolveStyle", () => {
    it("should return default style when no custom styles exist", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        const style = ssm.resolveStyle(0, 0);
        expect(style).toBeDefined();
    });

    it("should merge column style over default", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        ssm.setColStyle(0, stylePool.getStyleId({ textAlign: "right" }));
        const style = ssm.resolveStyle(0, 0);
        expect(style.textAlign).toBe("right");
    });

    it("should merge row style over column style", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        ssm.setColStyle(0, stylePool.getStyleId({ textAlign: "right" }));
        ssm.setRowStyle(0, stylePool.getStyleId({ textAlign: "center" }));
        const style = ssm.resolveStyle(0, 0);
        expect(style.textAlign).toBe("center");
    });

    it("should merge cell style over row style", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        ssm.setRowStyle(0, stylePool.getStyleId({ color: "red" }));
        const cellStyleId = stylePool.getStyleId({ color: "blue" });
        sheet.cellStore.set(0, 0, new Cell("test", cellStyleId, false));
        const style = ssm.resolveStyle(0, 0);
        expect(style.color).toBe("blue");
    });
});

describe("SheetStyleManager - setRangeStyle", () => {
    it("should set row style for full-row range", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        const range = { topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 999 };
        ssm.setRangeStyle(range, { fontWeight: "bold" });
        expect(ssm.rowStyles.has(0)).toBe(true);
        expect(ssm.rowStyles.has(1)).toBe(true);
        expect(ssm.rowStyles.has(2)).toBe(true);
    });

    it("should set column style for full-column range", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        const range = { topRow: 0, topCol: 1, bottomRow: 999, bottomCol: 3 };
        ssm.setRangeStyle(range, { textAlign: "center" });
        expect(ssm.colStyles.has(1)).toBe(true);
        expect(ssm.colStyles.has(2)).toBe(true);
        expect(ssm.colStyles.has(3)).toBe(true);
    });

    it("should set individual cell styles for partial range", () => {
        const sheet = createMockSheet();
        sheet.rowColManager.ensureSize(10, 10);
        const ssm = new SheetStyleManager(sheet);
        const range = { topRow: 0, topCol: 0, bottomRow: 1, bottomCol: 1 };
        ssm.setRangeStyle(range, { color: "green" });
        const cell00 = sheet.cellStore.get(0, 0);
        const cell01 = sheet.cellStore.get(0, 1);
        expect(cell00).toBeDefined();
        expect(cell01).toBeDefined();
    });
});

describe("SheetStyleManager - API parameter unification", () => {
    it("should accept styleObj in setRowStyle", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        ssm.setRowStyle(0, stylePool.getStyleId({ backgroundColor: "yellow" }));
        const styleId = ssm.rowStyles.get(0);
        expect(styleId).toBeDefined();
        const style = stylePool.getStyle(styleId);
        expect(style.backgroundColor).toBe("yellow");
    });

    it("should accept styleObj in setColStyle", () => {
        const sheet = createMockSheet();
        const ssm = new SheetStyleManager(sheet);
        ssm.setColStyle(2, stylePool.getStyleId({ textAlign: "right" }));
        const styleId = ssm.colStyles.get(2);
        expect(styleId).toBeDefined();
        const style = stylePool.getStyle(styleId);
        expect(style.textAlign).toBe("right");
    });
});

describe("SheetStyleManager - merge semantics unification", () => {
    it("should merge row style in setRangeStyle for full-row range", () => {
        const sheet = createMockSheet();
        sheet.rowColManager.ensureSize(5, 10);
        const ssm = new SheetStyleManager(sheet);

        ssm.setRowStyle(0, stylePool.getStyleId({ backgroundColor: "yellow" }));
        ssm.setRangeStyle(
            { topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 9 },
            { fontWeight: "bold" }
        );

        const styleId = ssm.rowStyles.get(0);
        const style = stylePool.getStyle(styleId);
        expect(style.backgroundColor).toBe("yellow");
        expect(style.fontWeight).toBe("bold");
    });

    it("should merge column style in setRangeStyle for full-column range", () => {
        const sheet = createMockSheet();
        sheet.rowColManager.ensureSize(10, 5);
        const ssm = new SheetStyleManager(sheet);

        ssm.setColStyle(0, stylePool.getStyleId({ textAlign: "left" }));
        ssm.setRangeStyle(
            { topRow: 0, topCol: 0, bottomRow: 9, bottomCol: 0 },
            { fontWeight: "bold" }
        );

        const styleId = ssm.colStyles.get(0);
        const style = stylePool.getStyle(styleId);
        expect(style.textAlign).toBe("left");
        expect(style.fontWeight).toBe("bold");
    });

    it("should merge individual cell styles in setRangeStyle for partial range", () => {
        const sheet = createMockSheet();
        sheet.rowColManager.ensureSize(10, 10);
        const ssm = new SheetStyleManager(sheet);

        ssm.setCellStyle(0, 0, { backgroundColor: "red" });
        ssm.setRangeStyle(
            { topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 1 },
            { fontWeight: "bold" }
        );

        const cell = sheet.cellStore.get(0, 0);
        const style = stylePool.getStyle(cell.styleId);
        expect(style.backgroundColor).toBe("red");
        expect(style.fontWeight).toBe("bold");
    });
});