import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExportFilePlugin } from "../../src/plugins/ExportFilePlugin.js";

function createMockWorkbook(overrides = {}) {
    const mockSheet = {
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
            getRange: vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 2 })),
            getFocus: vi.fn(() => [0, 0]),
            setRange: vi.fn(),
            setActive: vi.fn(),
        },
        cellStore: {
            getMaxRow: vi.fn(() => 2),
            getMaxCol: vi.fn(() => 2),
            get: vi.fn((row, col) => {
                const data = [
                    ["Name", "Age", "City"],
                    ["Alice", "30", "NYC"],
                    ["Bob", "25", "LA"],
                ];
                return { value: data[row]?.[col] || "" };
            }),
            chunks: vi.fn(() => [
                {
                    iterate: vi.fn(function* () {
                        yield { row: 0, col: 0 };
                        yield { row: 0, col: 1 };
                        yield { row: 0, col: 2 };
                        yield { row: 1, col: 0 };
                        yield { row: 1, col: 1 };
                        yield { row: 1, col: 2 };
                        yield { row: 2, col: 0 };
                        yield { row: 2, col: 1 };
                        yield { row: 2, col: 2 };
                    }),
                },
            ]),
        },
        colHeaders: ["Name", "Age", "City"],
        rowHeaders: ["1", "2", "3"],
        getColHeader: vi.fn((col) => ["Name", "Age", "City"][col]),
        getRowHeader: vi.fn((row) => String(row + 1)),
    };

    return {
        activeSheet: overrides.activeSheet === undefined ? mockSheet : overrides.activeSheet,
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

describe("ExportFilePlugin", () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new ExportFilePlugin(workbook);
    });

    describe("Constructor & Static Properties", () => {
        it("should have correct PLUGIN_NAME", () => {
            expect(ExportFilePlugin.PLUGIN_NAME).toBe("exportFile");
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

        it("should accept empty options", () => {
            plugin.init({});

            expect(plugin.initialized).toBe(true);
        });
    });

    describe("exportAsString()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should export data as CSV string by default", () => {
            const result = plugin.exportAsString();

            expect(result).toContain("Name,Age,City");
            expect(result).toContain("Alice,30,NYC");
            expect(result).toContain("Bob,25,LA");
        });

        it("should export as TSV when format is 'tsv'", () => {
            const result = plugin.exportAsString("tsv");

            expect(result).toContain("Name\tAge\tCity");
            expect(result.split("\t").length).toBeGreaterThanOrEqual(3);
        });

        it("should return empty string when sheet is null", () => {
            const wb = createMockWorkbook({ activeSheet: null });
            const p = new ExportFilePlugin(wb);
            p.init();

            const result = p.exportAsString();

            expect(result).toBe("");
        });

        it("should support custom separator option", () => {
            const result = plugin.exportAsString("csv", { separator: "|" });

            expect(result).toContain("Name|Age|City");
        });

        it("should support columnHeaders option", () => {
            const result = plugin.exportAsString("csv", { columnHeaders: true });

            expect(result.startsWith("Name,Age,City"));
        });

        it("should handle empty data range", () => {
            workbook.activeSheet.cellStore.chunks = vi.fn(() => []);
            const result = plugin.exportAsString();

            expect(result).toBe("");
        });

        it("should use default format csv when invalid format provided", () => {
            const result = plugin.exportAsString("invalid_format");

            expect(result).toContain(",");
        });
    });

    describe("exportAsBlob()", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should export data as Blob object", () => {
            const result = plugin.exportAsBlob();

            expect(result).toBeInstanceOf(Blob);
            expect(result.type).toContain("text/csv");
        });

        it("should export as TSV Blob when format is 'tsv'", () => {
            const result = plugin.exportAsBlob("tsv");

            expect(result).toBeInstanceOf(Blob);
            expect(result.type).toContain("text/tab-separated-values");
        });

        it("should return null when sheet is null", () => {
            const wb = createMockWorkbook({ activeSheet: null });
            const p = new ExportFilePlugin(wb);
            p.init();

            const result = p.exportAsBlob();

            expect(result).toBeNull();
        });
    });

    describe("downloadFile()", () => {
        let originalCreateObjectURL;
        let originalRevokeObjectURL;

        beforeEach(() => {
            plugin.init();
            
            originalCreateObjectURL = URL.createObjectURL;
            originalRevokeObjectURL = URL.revokeObjectURL;
            
            URL.createObjectURL = vi.fn(() => "blob:mock-url");
            URL.revokeObjectURL = vi.fn();
        });

        afterEach(() => {
            URL.createObjectURL = originalCreateObjectURL;
            URL.revokeObjectURL = originalRevokeObjectURL;
        });

        it("should call createObjectURL to generate blob URL", () => {
            plugin.downloadFile("csv", { filename: "test" });

            expect(URL.createObjectURL).toHaveBeenCalled();
        });

        it("should call revokeObjectURL after download (async)", async () => {
            plugin.downloadFile();

            await new Promise(resolve => setTimeout(resolve, 150));

            expect(URL.revokeObjectURL).toHaveBeenCalled();
        });

        it("should not throw when sheet is null", () => {
            const wb = createMockWorkbook({ activeSheet: null });
            const p = new ExportFilePlugin(wb);
            p.init();

            expect(() => p.downloadFile()).not.toThrow();
        });
    });

    describe("Edge Cases & Error Handling", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should escape fields containing commas", () => {
            workbook.activeSheet.cellStore.get = vi.fn((row, col) => ({
                value: 'Hello, World',
            }));

            const result = plugin.exportAsString();

            expect(result).toContain('"Hello, World"');
        });

        it("should escape fields containing double quotes", () => {
            workbook.activeSheet.cellStore.get = vi.fn((row, col) => ({
                value: 'Say "Hello"',
            }));

            const result = plugin.exportAsString();

            expect(result).toContain('"Say ""Hello"""');
        });

        it("should escape fields containing newlines", () => {
            workbook.activeSheet.cellStore.get = vi.fn((row, col) => ({
                value: 'Line1\nLine2',
            }));

            const result = plugin.exportAsString();

            expect(result).toContain('"Line1\nLine2"');
        });

        it("should handle null/undefined cell values", () => {
            workbook.activeSheet.cellStore.get = vi.fn(() => null);

            const result = plugin.exportAsString();

            expect(result).toBeDefined();
        });

        it("should handle custom range option", () => {
            const result = plugin.exportAsString("csv", {
                range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 }
            });

            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });

        it("should detect custom headers automatically", () => {
            const result = plugin.exportAsString();

            expect(result).toContain("Name,Age,City");
        });

        it("should handle empty headers array gracefully", () => {
            workbook.activeSheet.colHeaders = [];
            workbook.activeSheet.rowHeaders = [];

            const result = plugin.exportAsString("csv", { columnHeaders: true, rowHeaders: false });

            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });
    });

    describe("destroy()", () => {
        it("should clean up and destroy plugin", () => {
            plugin.init();
            plugin.destroy();

            expect(plugin.initialized).toBe(false);
            expect(plugin.enabled).toBe(false);
        });
    });
});