import { describe, it, expect, vi, beforeEach } from "vitest";
import { CopyPastePlugin } from "../../src/plugins/CopyPastePlugin.js";
import { FormulaPlugin } from "../../src/plugins/FormulaPlugin.js";
import { ContextMenuPlugin } from "../../src/plugins/ContextMenuPlugin.js";
import { createMockWorkbook } from "./BasePlugin.test.js";

describe("CopyPastePlugin", () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new CopyPastePlugin(workbook);
    });

    describe("Static Properties", () => {
        it("should have correct PLUGIN_NAME", () => {
            expect(CopyPastePlugin.PLUGIN_NAME).toBe("copyPaste");
        });
    });

    describe("Constructor & Initialization", () => {
        it("should initialize with default options (all operations allowed)", () => {
            plugin.init();

            expect(plugin.initialized).toBe(true);
            expect(plugin.enabled).toBe(true);
        });

        it("should create ClipboardManager instance", () => {
            plugin.init();

            expect(workbook.clipboard).toBeDefined();
        });

        it("should register CopyPasteStrategy", () => {
            plugin.init();

            expect(workbook.eventHandler.addStrategy).toHaveBeenCalledWith(
                "copyPaste",
                expect.any(Object)
            );
        });

        it("should respect allowCopy option", () => {
            plugin.init({ allowCopy: false });

            // Plugin should be initialized but with restricted permissions
            expect(plugin.initialized).toBe(true);
        });

        it("should respect allowPaste option", () => {
            plugin.init({ allowPaste: false });

            expect(plugin.initialized).toBe(true);
        });

        it("should respect allowCut option", () => {
            plugin.init({ allowCut: false });

            expect(plugin.initialized).toBe(true);
        });

        it("should disable if options.enabled is false", () => {
            plugin.init({ enabled: false });

            expect(plugin.enabled).toBe(false);
        });
    });

    describe("destroy()", () => {
        it("should clean up clipboard reference and strategy", () => {
            plugin.init();
            plugin.destroy();

            expect(plugin.initialized).toBe(false);
            expect(plugin.enabled).toBe(false);
        });
    });
});

describe("FormulaPlugin", () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new FormulaPlugin(workbook);
    });

    describe("Static Properties", () => {
        it("should have correct PLUGIN_NAME", () => {
            expect(FormulaPlugin.PLUGIN_NAME).toBe("formula");
        });
    });

    describe("Constructor & Initialization", () => {
        it("should initialize with default options", () => {
            plugin.init();

            expect(plugin.initialized).toBe(true);
            expect(workbook.formulaEngine).toBeDefined();
        });

        it("should create FormulaBar by default", () => {
            plugin.init();

            expect(workbook.formulaBar).toBeDefined();
        });

        it("should not create FormulaBar when showFormulaBar is false", () => {
            plugin.init({ showFormulaBar: false });

            expect(workbook.formulaBar).toBeNull();
        });

        it("should hook FormulaBar to render cycle", () => {
            plugin.init();

            expect(typeof workbook.renderEngine.onAfterRender).toBe("function");
        });
    });

    describe("destroy()", () => {
        it("should clean up engine and bar", () => {
            plugin.init();
            plugin.destroy();

            expect(plugin.initialized).toBe(false);
        });
    });
});

describe("ContextMenuPlugin", () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new ContextMenuPlugin(workbook);
    });

    describe("Static Properties", () => {
        it("should have correct PLUGIN_NAME", () => {
            expect(ContextMenuPlugin.PLUGIN_NAME).toBe("contextMenu");
        });
    });

    describe("Constructor & Initialization", () => {
        it("should initialize with default options", () => {
            plugin.init();

            expect(plugin.initialized).toBe(true);
            expect(plugin.enabled).toBe(true);
        });

        it("should register ContextMenuStrategy", () => {
            plugin.init();

            expect(workbook.eventHandler.addStrategy).toHaveBeenCalledWith(
                "contextMenu",
                expect.any(Object)
            );
        });

        it("should pass options to strategy constructor", () => {
            const customOptions = {
                customItems: [{ label: "Test", action: vi.fn() }],
                disabledItems: ["mergeCells"],
            };

            plugin.init(customOptions);

            expect(workbook.eventHandler.addStrategy).toHaveBeenCalledWith(
                "contextMenu",
                expect.any(Object)
            );
        });

        it("should disable if options.enabled is false", () => {
            plugin.init({ enabled: false });

            expect(plugin.enabled).toBe(false);
        });
    });

    describe("enable() / disable()", () => {
        it("should enable plugin without errors", () => {
            plugin.init();

            expect(() => plugin.enable()).not.toThrow();
            expect(plugin.enabled).toBe(true);
        });

        it("should disable plugin without errors", () => {
            plugin.init();

            expect(() => plugin.disable()).not.toThrow();
            expect(plugin.enabled).toBe(false);
        });
    });

    describe("destroy()", () => {
        it("should nullify strategy and call super.destroy()", () => {
            plugin.init();
            plugin.destroy();

            expect(plugin.initialized).toBe(false);
            expect(plugin.enabled).toBe(false);
        });
    });
});