import { describe, it, expect, vi, beforeEach } from "vitest";
import { ColumnMovePlugin } from "../../src/plugins/ColumnMovePlugin.js";
import { RowMovePlugin } from "../../src/plugins/RowMovePlugin.js";

function createMockWorkbook(overrides = {}) {
    return {
        activeSheet: overrides.activeSheet || {
            fixedRowsTop: 0,
            fixedColumnsStart: 0,
            rowColManager: {
                hideRow: vi.fn(),
                showRow: vi.fn(),
                isRowHidden: vi.fn(() => false),
                getHiddenRows: vi.fn(() => []),
                clearHiddenRows: vi.fn(),
                visibleRowCount: vi.fn(() => 100),
                hideColumn: vi.fn(),
                showColumn: vi.fn(),
                isColumnHidden: vi.fn(() => false),
                getHiddenColumns: vi.fn(() => []),
                clearHiddenColumns: vi.fn(),
                visibleColCount: vi.fn(() => 26),
            },
            selection: {
                getRange: vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 9, bottomCol: 25 })),
                getFocus: vi.fn(() => [0, 0]),
                setRange: vi.fn(),
                setActive: vi.fn(),
            },
            cellStore: {
                getMaxRow: vi.fn(() => -1),
                getMaxCol: vi.fn(() => -1),
                get: vi.fn(() => null),
            },
        },
        renderEngine: overrides.renderEngine || {
            invalidateAll: vi.fn(),
            scrollMgr: {
                setScrollPosition: vi.fn(),
            },
            viewH: 600,
            outerWrap: document.createElement("div"),
            onAfterRender: null,
        },
        eventHandler: overrides.eventHandler || {
            hooks: {
                addHook: vi.fn(),
                removeHook: vi.fn(),
                runHooks: vi.fn(),
            },
            addStrategy: vi.fn(),
            removeStrategy: vi.fn(),
        },
        editor: overrides.editor || {},
        clipboard: overrides.clipboard || null,
        formulaEngine: overrides.formulaEngine || null,
        formulaBar: overrides.formulaBar || null,
        render: vi.fn(),
        getPlugin: vi.fn(),
    };
}

describe("ColumnMovePlugin", () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new ColumnMovePlugin(workbook);
    });

    describe("Constructor & Static Properties", () => {
        it("should have correct PLUGIN_NAME", () => {
            expect(ColumnMovePlugin.PLUGIN_NAME).toBe("columnMove");
        });

        it("should store workbook reference", () => {
            expect(plugin.workbook).toBe(workbook);
        });

        it("should not be initialized by default", () => {
            expect(plugin.initialized).toBe(false);
        });
    });

    describe("init()", () => {
        it("should initialize plugin successfully", () => {
            plugin.init();

            expect(plugin.initialized).toBe(true);
            expect(plugin.enabled).toBe(true);
        });

        it("should register columnMove strategy", () => {
            plugin.init();

            expect(workbook.eventHandler.addStrategy).toHaveBeenCalledWith(
                "columnMove",
                expect.any(Object)
            );
        });

        it("should be enabled by default", () => {
            plugin.init();

            expect(plugin.enabled).toBe(true);
        });

        it("should accept options.enabled = false to disable initially", () => {
            plugin.init({ enabled: false });

            expect(plugin.initialized).toBe(true);
            expect(plugin.enabled).toBe(false);
        });
    });

    describe("enable() / disable()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should enable the plugin and strategy", () => {
            plugin.disable();
            
            const strategyEnableSpy = vi.fn();
            const originalStrategy = plugin._strategy;
            if (originalStrategy) {
                originalStrategy.enable = strategyEnableSpy;
            }

            plugin.enable();

            expect(plugin.enabled).toBe(true);
            if (originalStrategy) {
                expect(strategyEnableSpy).toHaveBeenCalled();
            }
        });

        it("should disable the plugin and strategy", () => {
            const strategyDisableSpy = vi.fn();
            const originalStrategy = plugin._strategy;
            if (originalStrategy) {
                originalStrategy.disable = strategyDisableSpy;
            }

            plugin.disable();

            expect(plugin.enabled).toBe(false);
            if (originalStrategy) {
                expect(strategyDisableSpy).toHaveBeenCalled();
            }
        });
    });

    describe("destroy()", () => {
        it("should clean up and destroy plugin", () => {
            plugin.init();
            plugin.destroy();

            expect(plugin.initialized).toBe(false);
            expect(plugin.enabled).toBe(false);
        });

        it("should remove registered strategy", () => {
            plugin.init();
            plugin.destroy();

            expect(workbook.eventHandler.removeStrategy).toHaveBeenCalledWith("columnMove");
        });
    });
});

describe("RowMovePlugin", () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new RowMovePlugin(workbook);
    });

    describe("Constructor & Static Properties", () => {
        it("should have correct PLUGIN_NAME", () => {
            expect(RowMovePlugin.PLUGIN_NAME).toBe("rowMove");
        });

        it("should store workbook reference", () => {
            expect(plugin.workbook).toBe(workbook);
        });

        it("should not be initialized by default", () => {
            expect(plugin.initialized).toBe(false);
        });
    });

    describe("init()", () => {
        it("should initialize plugin successfully", () => {
            plugin.init();

            expect(plugin.initialized).toBe(true);
            expect(plugin.enabled).toBe(true);
        });

        it("should register rowMove strategy", () => {
            plugin.init();

            expect(workbook.eventHandler.addStrategy).toHaveBeenCalledWith(
                "rowMove",
                expect.any(Object)
            );
        });

        it("should be enabled by default", () => {
            plugin.init();

            expect(plugin.enabled).toBe(true);
        });

        it("should accept options.enabled = false to disable initially", () => {
            plugin.init({ enabled: false });

            expect(plugin.initialized).toBe(true);
            expect(plugin.enabled).toBe(false);
        });
    });

    describe("enable() / disable()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should enable the plugin and strategy", () => {
            plugin.disable();
            
            const strategyEnableSpy = vi.fn();
            const originalStrategy = plugin._strategy;
            if (originalStrategy) {
                originalStrategy.enable = strategyEnableSpy;
            }

            plugin.enable();

            expect(plugin.enabled).toBe(true);
            if (originalStrategy) {
                expect(strategyEnableSpy).toHaveBeenCalled();
            }
        });

        it("should disable the plugin and strategy", () => {
            const strategyDisableSpy = vi.fn();
            const originalStrategy = plugin._strategy;
            if (originalStrategy) {
                originalStrategy.disable = strategyDisableSpy;
            }

            plugin.disable();

            expect(plugin.enabled).toBe(false);
            if (originalStrategy) {
                expect(strategyDisableSpy).toHaveBeenCalled();
            }
        });
    });

    describe("destroy()", () => {
        it("should clean up and destroy plugin", () => {
            plugin.init();
            plugin.destroy();

            expect(plugin.initialized).toBe(false);
            expect(plugin.enabled).toBe(false);
        });

        it("should remove registered strategy", () => {
            plugin.init();
            plugin.destroy();

            expect(workbook.eventHandler.removeStrategy).toHaveBeenCalledWith("rowMove");
        });
    });
});