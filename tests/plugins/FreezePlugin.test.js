import { describe, it, expect, vi, beforeEach } from "vitest";
import { FreezePlugin } from "../../src/plugins/FreezePlugin.js";
import { createMockWorkbook } from "./BasePlugin.test.js";

describe("FreezePlugin", () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new FreezePlugin(workbook);
    });

    describe("Static Properties", () => {
        it("should have correct PLUGIN_NAME", () => {
            expect(FreezePlugin.PLUGIN_NAME).toBe("freeze");
        });
    });

    describe("Constructor & Initialization", () => {
        it("should initialize with default options", () => {
            plugin.init();

            expect(plugin.initialized).toBe(true);
            expect(plugin.active).toBe(true);
            expect(workbook.renderEngine.invalidateAll).toHaveBeenCalled();
        });

        it("should apply frozen rows from options", () => {
            plugin.init({ fixedRowsTop: 3 });

            expect(workbook.activeSheet.fixedRowsTop).toBe(3);
        });

        it("should apply frozen columns from options", () => {
            plugin.init({ fixedColumnsStart: 2 });

            expect(workbook.activeSheet.fixedColumnsStart).toBe(2);
        });

        it("should ignore non-positive frozen values", () => {
            plugin.init({ fixedRowsTop: -1, fixedColumnsStart: 0 });

            expect(workbook.activeSheet.fixedRowsTop).toBe(0);
            expect(workbook.activeSheet.fixedColumnsStart).toBe(0);
        });
    });

    describe("Property Getters", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should return current fixedRowsTop", () => {
            workbook.activeSheet.fixedRowsTop = 5;
            expect(plugin.fixedRowsTop).toBe(5);
        });

        it("should return current fixedColumnsStart", () => {
            workbook.activeSheet.fixedColumnsStart = 3;
            expect(plugin.fixedColumnsStart).toBe(3);
        });

        it("should return 0 when no sheet", () => {
            const wb = createMockWorkbook({ activeSheet: null });
            const p = new FreezePlugin(wb);
            p.init();

            expect(p.fixedRowsTop).toBe(0);
            expect(p.fixedColumnsStart).toBe(0);
        });
    });

    describe("setFixedRowsTop()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should set frozen row count", () => {
            plugin.setFixedRowsTop(4);

            expect(workbook.activeSheet.fixedRowsTop).toBe(4);
        });

        it("should clamp negative values to 0", () => {
            plugin.setFixedRowsTop(-5);

            expect(workbook.activeSheet.fixedRowsTop).toBe(0);
        });

        it("should floor decimal values", () => {
            plugin.setFixedRowsTop(4.7);

            expect(workbook.activeSheet.fixedRowsTop).toBe(4);
        });

        it("should trigger render and hooks", () => {
            plugin.setFixedRowsTop(2);

            expect(workbook.renderEngine.invalidateAll).toHaveBeenCalled();
            expect(workbook.render).toHaveBeenCalled();
            expect(workbook.eventHandler.hooks.runHooks).toHaveBeenCalled();
        });
    });

    describe("setFixedColumnsStart()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should set frozen column count", () => {
            plugin.setFixedColumnsStart(3);

            expect(workbook.activeSheet.fixedColumnsStart).toBe(3);
        });

        it("should clamp negative values to 0", () => {
            plugin.setFixedColumnsStart(-1);

            expect(workbook.activeSheet.fixedColumnsStart).toBe(0);
        });
    });

    describe("freeze()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should set both rows and columns simultaneously", () => {
            plugin.freeze(2, 1);

            expect(workbook.activeSheet.fixedRowsTop).toBe(2);
            expect(workbook.activeSheet.fixedColumnsStart).toBe(1);
        });

        it("should handle zero values (unfreeze)", () => {
            workbook.activeSheet.fixedRowsTop = 3;
            workbook.activeSheet.fixedColumnsStart = 2;

            plugin.freeze(0, 0);

            expect(workbook.activeSheet.fixedRowsTop).toBe(0);
            expect(workbook.activeSheet.fixedColumnsStart).toBe(0);
        });

        it("should always trigger AFTER_FREEZE hook", () => {
            plugin.freeze(1, 1);

            expect(workbook.eventHandler.hooks.runHooks).toHaveBeenCalled();
        });

        it("should trigger AFTER_UNFREEZE when going to zero with previous freeze", () => {
            workbook.activeSheet.fixedRowsTop = 2;
            workbook.activeSheet.fixedColumnsStart = 1;

            plugin.unfreeze();

            expect(workbook.eventHandler.hooks.runHooks).toHaveBeenCalledWith(
                expect.any(String)
            );
        });
    });

    describe("unfreeze()", () => {
        beforeEach(() => {
            plugin.init();
            workbook.activeSheet.fixedRowsTop = 3;
            workbook.activeSheet.fixedColumnsStart = 2;
        });

        it("should clear all freezing", () => {
            plugin.unfreeze();

            expect(workbook.activeSheet.fixedRowsTop).toBe(0);
            expect(workbook.activeSheet.fixedColumnsStart).toBe(0);
        });

        it("should not trigger hook when already unfrozen", () => {
            workbook.activeSheet.fixedRowsTop = 0;
            workbook.activeSheet.fixedColumnsStart = 0;
            workbook.eventHandler.hooks.runHooks.mockClear();

            plugin.unfreeze();

            expect(workbook.eventHandler.hooks.runHooks).not.toHaveBeenCalled();
        });
    });

    describe("isFrozen()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should return true when rows are frozen", () => {
            workbook.activeSheet.fixedRowsTop = 2;

            expect(plugin.isFrozen()).toBe(true);
        });

        it("should return true when columns are frozen", () => {
            workbook.activeSheet.fixedColumnsStart = 1;

            expect(plugin.isFrozen()).toBe(true);
        });

        it("should return false when nothing is frozen", () => {
            expect(plugin.isFrozen()).toBe(false);
        });

        it("should return false when no sheet", () => {
            const wb = createMockWorkbook({ activeSheet: null });
            const p = new FreezePlugin(wb);
            p.init();

            expect(p.isFrozen()).toBe(false);
        });
    });

    describe("enable() / disable()", () => {
        beforeEach(() => {
            plugin.init();
            workbook.activeSheet.fixedRowsTop = 2;
            workbook.activeSheet.fixedColumnsStart = 1;
        });

        it("should enable and restore active state", () => {
            plugin.disable();
            expect(plugin.active).toBe(false);

            plugin.enable();
            expect(plugin.active).toBe(true);
        });

        it("should disable and clear all freezing", () => {
            plugin.disable();

            expect(plugin.enabled).toBe(false);
            expect(plugin.active).toBe(false);
            expect(workbook.activeSheet.fixedRowsTop).toBe(0);
            expect(workbook.activeSheet.fixedColumnsStart).toBe(0);
        });
    });

    describe("destroy()", () => {
        it("should disable then call super.destroy()", () => {
            plugin.init();
            workbook.activeSheet.fixedRowsTop = 2;

            plugin.destroy();

            expect(plugin.initialized).toBe(false);
            expect(plugin.enabled).toBe(false);
            expect(plugin.active).toBe(false);
            expect(workbook.activeSheet.fixedRowsTop).toBe(0);
        });
    });
});