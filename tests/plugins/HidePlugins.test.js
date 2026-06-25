import { describe, it, expect, vi, beforeEach } from "vitest";
import { HiddenColumnsPlugin } from "../../src/plugins/HiddenColumnsPlugin.js";
import { HiddenRowsPlugin } from "../../src/plugins/HiddenRowsPlugin.js";
import { createMockWorkbook } from "./BasePlugin.test.js";

describe("HiddenColumnsPlugin", () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new HiddenColumnsPlugin(workbook);
    });

    describe("Static Properties", () => {
        it("should have correct PLUGIN_NAME", () => {
            expect(HiddenColumnsPlugin.PLUGIN_NAME).toBe("hiddenColumns");
        });

        it("should have correct AXIS (col)", () => {
            expect(HiddenColumnsPlugin.AXIS).toBe("col");
        });
    });

    describe("Constructor & Initialization", () => {
        it("should initialize with default options", () => {
            plugin.init();

            expect(plugin.initialized).toBe(true);
            expect(plugin.active).toBe(true);
        });

        it("should hide columns from options on init", () => {
            plugin.init({ columns: [1, 3, 5] });

            expect(workbook.activeSheet.rowColManager.hideColumn).toHaveBeenCalledWith(1);
            expect(workbook.activeSheet.rowColManager.hideColumn).toHaveBeenCalledWith(3);
            expect(workbook.activeSheet.rowColManager.hideColumn).toHaveBeenCalledWith(5);
        });
    });

    describe("hideColumn() / hideColumns()", () => {
        beforeEach(() => {
            plugin.init();
            workbook.activeSheet.rowColManager.isColumnHidden.mockReturnValue(false);
        });

        it("should hide a single column", () => {
            plugin.hideColumn(2);

            expect(workbook.activeSheet.rowColManager.hideColumn).toHaveBeenCalledWith(2);
        });

        it("should hide multiple columns", () => {
            plugin.hideColumns([0, 2, 4]);

            expect(workbook.activeSheet.rowColManager.hideColumn).toHaveBeenCalledTimes(3);
        });

        it("should not hide already hidden column", () => {
            workbook.activeSheet.rowColManager.isColumnHidden.mockReturnValue(true);

            plugin.hideColumn(2);

            expect(workbook.activeSheet.rowColManager.hideColumn).not.toHaveBeenCalled();
        });

        it("should not hide negative index", () => {
            plugin.hideColumn(-1);

            expect(workbook.activeSheet.rowColManager.hideColumn).not.toHaveBeenCalled();
        });
    });

    describe("showColumn() / showColumns()", () => {
        beforeEach(() => {
            plugin.init();
            workbook.activeSheet.rowColManager.isColumnHidden.mockReturnValue(true); // 模拟已隐藏状态
        });

        it("should show a single column", () => {
            plugin.showColumn(2);

            expect(workbook.activeSheet.rowColManager.showColumn).toHaveBeenCalledWith(2);
        });

        it("should show multiple columns", () => {
            plugin.showColumns([0, 2, 4]);

            expect(workbook.activeSheet.rowColManager.showColumn).toHaveBeenCalledTimes(3);
        });

        it("should not show already visible column", () => {
            workbook.activeSheet.rowColManager.isColumnHidden.mockReturnValue(false);

            plugin.showColumn(2);

            expect(workbook.activeSheet.rowColManager.showColumn).not.toHaveBeenCalled();
        });
    });

    describe("isHidden()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should return true for hidden column", () => {
            workbook.activeSheet.rowColManager.isColumnHidden.mockReturnValue(true);

            expect(plugin.isHidden(2)).toBe(true);
        });

        it("should return false for visible column", () => {
            workbook.activeSheet.rowColManager.isColumnHidden.mockReturnValue(false);

            expect(plugin.isHidden(2)).toBe(false);
        });

        it("should return false when no sheet", () => {
            const wb = createMockWorkbook({ activeSheet: null });
            const p = new HiddenColumnsPlugin(wb);
            p.init();

            expect(p.isHidden(2)).toBe(false);
        });
    });

    describe("getHiddenColumns()", () => {
        beforeEach(() => {
            plugin.init();
            workbook.activeSheet.rowColManager.getHiddenColumns.mockReturnValue([1, 3, 5]);
        });

        it("should return array of hidden column indices", () => {
            const hidden = plugin.getHiddenColumns();

            expect(hidden).toEqual([1, 3, 5]);
        });
    });

    describe("Property Getters", () => {
        beforeEach(() => {
            plugin.init();
            workbook.activeSheet.rowColManager.getHiddenColumns.mockReturnValue([1, 3]);
            workbook.activeSheet.rowColManager.visibleColCount = 24; // 直接设置值
        });

        it("should return hiddenItems", () => {
            expect(plugin.hiddenItems).toEqual([1, 3]);
        });

        it("should return hiddenCount", () => {
            expect(plugin.hiddenCount).toBe(2);
        });

        it("should return visibleColCount", () => {
            expect(plugin.visibleColCount).toBe(24);
        });
    });

    describe("enable() / disable()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should enable and restore active state", () => {
            plugin.disable();
            plugin.enable();

            expect(plugin.active).toBe(true);
            expect(plugin.enabled).toBe(true);
        });

        it("should disable and clear all hidden columns", () => {
            plugin.disable();

            expect(plugin.enabled).toBe(false);
            expect(plugin.active).toBe(false);
            expect(workbook.activeSheet.rowColManager.clearHiddenColumns).toHaveBeenCalled();
        });
    });

    describe("destroy()", () => {
        it("should disable then call super.destroy()", () => {
            plugin.init();

            plugin.destroy();

            expect(plugin.initialized).toBe(false);
            expect(plugin.enabled).toBe(false);
        });
    });
});

describe("HiddenRowsPlugin", () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new HiddenRowsPlugin(workbook);
    });

    describe("Static Properties", () => {
        it("should have correct PLUGIN_NAME", () => {
            expect(HiddenRowsPlugin.PLUGIN_NAME).toBe("hiddenRows");
        });

        it("should have correct AXIS (row)", () => {
            expect(HiddenRowsPlugin.AXIS).toBe("row");
        });
    });

    describe("Constructor & Initialization", () => {
        it("should initialize with default options", () => {
            plugin.init();

            expect(plugin.initialized).toBe(true);
            expect(plugin.active).toBe(true);
        });

        it("should hide rows from options on init", () => {
            plugin.init({ rows: [2, 5, 8] });

            expect(workbook.activeSheet.rowColManager.hideRow).toHaveBeenCalledWith(2);
            expect(workbook.activeSheet.rowColManager.hideRow).toHaveBeenCalledWith(5);
            expect(workbook.activeSheet.rowColManager.hideRow).toHaveBeenCalledWith(8);
        });
    });

    describe("hideRow() / hideRows()", () => {
        beforeEach(() => {
            plugin.init();
            workbook.activeSheet.rowColManager.isRowHidden.mockReturnValue(false);
        });

        it("should hide a single row", () => {
            plugin.hideRow(3);

            expect(workbook.activeSheet.rowColManager.hideRow).toHaveBeenCalledWith(3);
        });

        it("should hide multiple rows", () => {
            plugin.hideRows([1, 3, 5]);

            expect(workbook.activeSheet.rowColManager.hideRow).toHaveBeenCalledTimes(3);
        });

        it("should not hide negative index", () => {
            plugin.hideRow(-1);

            expect(workbook.activeSheet.rowColManager.hideRow).not.toHaveBeenCalled();
        });
    });

    describe("showRow() / showRows()", () => {
        beforeEach(() => {
            plugin.init();
             workbook.activeSheet.rowColManager.isRowHidden.mockReturnValue(true); // 模拟已隐藏状态
        });

        it("should show a single row", () => {
            plugin.showRow(3);

            expect(workbook.activeSheet.rowColManager.showRow).toHaveBeenCalledWith(3);
        });

        it("should show multiple rows", () => {
            plugin.showRows([1, 3, 5]);

            expect(workbook.activeSheet.rowColManager.showRow).toHaveBeenCalledTimes(3);
        });
    });

    describe("isHidden()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should return true for hidden row", () => {
            workbook.activeSheet.rowColManager.isRowHidden.mockReturnValue(true);

            expect(plugin.isHidden(3)).toBe(true);
        });

        it("should return false for visible row", () => {
            workbook.activeSheet.rowColManager.isRowHidden.mockReturnValue(false);

            expect(plugin.isHidden(3)).toBe(false);
        });
    });

    describe("getHiddenRows()", () => {
        beforeEach(() => {
            plugin.init();
            workbook.activeSheet.rowColManager.getHiddenRows.mockReturnValue([2, 5]);
        });

        it("should return array of hidden row indices", () => {
            const hidden = plugin.getHiddenRows();

            expect(hidden).toEqual([2, 5]);
        });
    });

    describe("Property Getters", () => {
        beforeEach(() => {
            plugin.init();
            workbook.activeSheet.rowColManager.getHiddenRows.mockReturnValue([2, 5]);
            workbook.activeSheet.rowColManager.visibleRowCount = 98; // 直接设置值
        });

        it("should return hiddenItems", () => {
            expect(plugin.hiddenItems).toEqual([2, 5]);
        });

        it("should return hiddenCount", () => {
            expect(plugin.hiddenCount).toBe(2);
        });

        it("should return visibleRowCount", () => {
            expect(plugin.visibleCount).toBe(98);
        });
    });

    describe("enable() / disable()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should disable and clear all hidden rows", () => {
            plugin.disable();

            expect(workbook.activeSheet.rowColManager.clearHiddenRows).toHaveBeenCalled();
        });
    });
});