import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaginationPlugin } from "../../src/plugins/PaginationPlugin.js";
import { createMockWorkbook } from "./BasePlugin.test.js";

describe("PaginationPlugin", () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new PaginationPlugin(workbook);
    });

    describe("Static Properties", () => {
        it("should have correct PLUGIN_NAME", () => {
            expect(PaginationPlugin.PLUGIN_NAME).toBe("pagination");
        });
    });

    describe("Constructor & Initialization", () => {
        it("should initialize with default options", () => {
            plugin.init();

            expect(plugin.initialized).toBe(true);
            expect(plugin.active).toBe(true);
            expect(plugin.pageSize).toBe(50);
            expect(plugin.currentPage).toBe(1);
        });

        it("should use custom pageSize from options", () => {
            plugin.init({ pageSize: 100 });

            expect(plugin.pageSize).toBe(100);
        });

        it("should use custom pageSizeList from options", () => {
            const customList = [20, 50, 100];
            plugin.init({ pageSizeList: customList });

            expect(plugin.pageSizeList).toEqual(customList);
        });

        it("should set autoPageSize flag", () => {
            plugin.init({ autoPageSize: true });

            expect(plugin.autoPageSize).toBe(true);
        });

        it("should apply pagination bounds on init", () => {
            plugin.init();

            expect(workbook.activeSheet.rowColManager.setPaginationBounds).toHaveBeenCalled();
        });
    });

    describe("Property Getters", () => {
        beforeEach(() => {
            plugin.init();
            workbook.activeSheet.rowColManager.rowCount = 200;
            workbook.activeSheet.cellStore.getMaxRow.mockReturnValue(199);
            plugin.refresh();
        });

        it("should return current pageSize", () => {
            expect(plugin.pageSize).toBe(50);
        });

        it("should return currentPage (1-based)", () => {
            expect(plugin.currentPage).toBe(1);
        });

        it("should return copy of pageSizeList", () => {
            const list = plugin.pageSizeList;
            list.push(999);

            expect(plugin.pageSizeList.length).not.toBe(6);
        });

        it("should calculate totalPages correctly", () => {
            workbook.activeSheet.rowColManager.rowCount = 150;
            workbook.activeSheet.cellStore.getMaxRow.mockReturnValue(149);
            plugin.refresh();

            expect(plugin.totalPages).toBe(3); // 150 / 50 = 3
        });

        it("should return at least 1 total page even with 0 rows", () => {
            expect(plugin.totalPages).toBeGreaterThanOrEqual(1);
        });

        it("should calculate rowOffset correctly", () => {
            expect(plugin.rowOffset).toBe(0); // page 1: (1-1) * 50 = 0
        });

        it("should calculate pageRowCount for full page", () => {
            expect(plugin.pageRowCount).toBe(50); // 200 rows, page 1 has 50 rows
        });

        it("should calculate pageRowCount for last partial page", () => {
            workbook.activeSheet.rowColManager.rowCount = 75;
            workbook.activeSheet.cellStore.getMaxRow.mockReturnValue(74);
            plugin.refresh();

            plugin.setPage(2);

            expect(plugin.pageRowCount).toBe(25); // 75 - 50
        });
    });

    describe("setPage()", () => {
        beforeEach(() => {
            plugin.init();
            workbook.activeSheet.rowColManager.rowCount = 200;
            workbook.activeSheet.cellStore.getMaxRow.mockReturnValue(199);
            plugin.refresh();
        });

        it("should change to specified page", () => {
            plugin.setPage(2);

            expect(plugin.currentPage).toBe(2);
        });

        it("should clamp page to minimum 1", () => {
            plugin.setPage(-5);

            expect(plugin.currentPage).toBe(1);
        });

        it("should clamp page to maximum totalPages", () => {
            plugin.setPage(10);

            expect(plugin.currentPage).toBe(4); // 200 rows / 50 per page
        });

        it("should not trigger update if same page", () => {
            const renderSpy = vi.spyOn(workbook, "render");
            renderSpy.mockClear(); // Clear calls from init/refresh
            plugin.setPage(1);

            expect(renderSpy).not.toHaveBeenCalled();
            renderSpy.mockRestore();
        });

        it("should apply pagination bounds on change", () => {
            plugin.setPage(2);

            expect(workbook.activeSheet.rowColManager.setPaginationBounds).toHaveBeenCalled();
        });

        it("should fire AFTER_PAGE_CHANGE hook", () => {
            plugin.setPage(2);

            expect(workbook.eventHandler.hooks.runHooks).toHaveBeenCalledWith(
                expect.any(String),
                1,
                2
            );
        });
    });

    describe("setPageSize()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should change pageSize and reset to page 1", () => {
            plugin.setPageSize(100);

            expect(plugin.pageSize).toBe(100);
            expect(plugin.currentPage).toBe(1);
        });

        it("should reject non-positive size", () => {
            plugin.setPageSize(0);
            expect(plugin.pageSize).toBe(50);

            plugin.setPageSize(-10);
            expect(plugin.pageSize).toBe(50);
        });

        it("should reject same size", () => {
            const renderSpy = vi.spyOn(workbook, "render");
            renderSpy.mockClear(); // Clear calls from init/refresh
            plugin.setPageSize(50);

            expect(renderSpy).not.toHaveBeenCalled();
            renderSpy.mockRestore();
        });
    });

    describe("Navigation Methods", () => {
        beforeEach(() => {
            plugin.init();
            workbook.activeSheet.rowColManager.rowCount = 200;
            workbook.activeSheet.cellStore.getMaxRow.mockReturnValue(199);
            plugin.refresh();
        });

        it("nextPage() should increment page", () => {
            plugin.nextPage();

            expect(plugin.currentPage).toBe(2);
        });

        it("prevPage() should decrement page", () => {
            plugin.setPage(3);
            plugin.prevPage();

            expect(plugin.currentPage).toBe(2);
        });

        it("firstPage() should go to page 1", () => {
            plugin.setPage(3);
            plugin.firstPage();

            expect(plugin.currentPage).toBe(1);
        });

        it("lastPage() should go to last page", () => {
            plugin.lastPage();

            expect(plugin.currentPage).toBe(4);
        });

        it("prevPage() should not go below page 1", () => {
            plugin.prevPage();

            expect(plugin.currentPage).toBe(1);
        });

        it("nextPage() should not exceed totalPages", () => {
            for (let i = 0; i < 20; i++) {
                plugin.nextPage();
            }

            expect(plugin.currentPage).toBe(4);
        });
    });

    describe("refresh()", () => {
        it("should recalculate totalRows and reapply bounds", () => {
            plugin.init();

            plugin.refresh();

            expect(workbook.activeSheet.rowColManager.setPaginationBounds).toHaveBeenCalled();
        });

        it("should adjust currentPage if exceeds new totalPages", () => {
            plugin.init();
            workbook.activeSheet.rowColManager.rowCount = 30; // Only enough for 1 page
            plugin.setPage(3);

            plugin.refresh();

            expect(plugin.currentPage).toBe(1);
        });
    });

    describe("getCurrentPageData()", () => {
        it("should return array of row arrays", () => {
            plugin.init();
            workbook.activeSheet.cellStore.get.mockReturnValue({ value: "test" });
            workbook.activeSheet.cellStore.getMaxCol.mockReturnValue(2);

            const data = plugin.getCurrentPageData();

            expect(Array.isArray(data)).toBe(true);
            expect(data.length).toBeGreaterThan(0);
        });

        it("should return empty array when no sheet", () => {
            const wb = createMockWorkbook({ activeSheet: null });
            const p = new PaginationPlugin(wb);
            p.init();

            expect(p.getCurrentPageData()).toEqual([]);
        });
    });

    describe("getPaginationData()", () => {
        it("should return complete state snapshot", () => {
            plugin.init();
            workbook.activeSheet.rowColManager.rowCount = 150;
            workbook.activeSheet.cellStore.getMaxRow.mockReturnValue(149);
            plugin.refresh();

            const data = plugin.getPaginationData();

            expect(data).toHaveProperty("currentPage");
            expect(data).toHaveProperty("totalPages");
            expect(data).toHaveProperty("pageSize");
            expect(data).toHaveProperty("totalRows");
            expect(data).toHaveProperty("rowOffset");
            expect(data).toHaveProperty("pageRowCount");
            expect(data).toHaveProperty("pageSizeList");
            expect(data).toHaveProperty("autoPageSize");

            expect(data.totalPages).toBe(3);
        });
    });

    describe("enable() / disable()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should enable and apply pagination bounds", () => {
            plugin.disable();
            plugin.enable();

            expect(plugin.enabled).toBe(true);
            expect(plugin.active).toBe(true);
            expect(workbook.activeSheet.rowColManager.setPaginationBounds).toHaveBeenCalled();
        });

        it("should disable and clear pagination bounds", () => {
            plugin.disable();

            expect(plugin.enabled).toBe(false);
            expect(plugin.active).toBe(false);
            expect(workbook.activeSheet.rowColManager.clearPaginationBounds).toHaveBeenCalled();
        });
    });

    describe("destroy()", () => {
        it("should disable then call super.destroy()", () => {
            plugin.init();

            plugin.destroy();

            expect(plugin.initialized).toBe(false);
            expect(plugin.enabled).toBe(false);
            expect(plugin.active).toBe(false);
        });
    });
});