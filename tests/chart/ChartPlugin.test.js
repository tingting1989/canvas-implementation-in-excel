import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChartPlugin } from "@/plugins/ChartPlugin";
import { CHART_TYPE } from "@/model/chart/ChartModel";

function createMockBus() {
    const listeners = {};
    return {
        on: vi.fn((event, cb) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(cb);
            return vi.fn();
        }),
        emit: vi.fn(),
        off: vi.fn(),
        _listeners: listeners,
    };
}

function createMockSheet(name) {
    return {
        name,
        bus: createMockBus(),
        chartManager: null,
        cellStore: { on: vi.fn() },
        reactiveStore: { on: vi.fn() },
        rowColManager: {
            isHiddenRow: vi.fn(() => false),
            isHiddenCol: vi.fn(() => false),
            rowCount: 100,
            colCount: 26,
        },
        cellDataAccessor: {
            get: vi.fn(() => null),
        },
    };
}

function createMockWorkbook() {
    const sheets = new Map();
    const sheet1 = createMockSheet("Sheet1");
    const sheet2 = createMockSheet("Sheet2");
    sheets.set("Sheet1", sheet1);
    sheets.set("Sheet2", sheet2);

    const workbook = {
        sheets,
        activeSheet: sheet1,
        bus: createMockBus(),
        render: vi.fn(),
        getPlugin: vi.fn(),
        eventHandler: { hooks: { runHooks: vi.fn(), addHook: vi.fn() }, addStrategy: vi.fn() },
        renderEngine: null,
        editor: null,
        clipboard: null,
    };
    return workbook;
}

const mockCtx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    clip: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    font: "12px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    globalAlpha: 1,
};

describe("ChartPlugin", () => {
    let plugin;
    let workbook;
    let origCreateElement;

    beforeEach(() => {
        origCreateElement = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation((tag) => {
            const el = origCreateElement(tag);
            if (tag === "canvas") {
                el.getContext = vi.fn(() => mockCtx);
                el.toDataURL = vi.fn(() => "data:image/png;base64,mock");
            }
            return el;
        });

        workbook = createMockWorkbook();
        plugin = new ChartPlugin(workbook);
        plugin.init();
    });

    afterEach(() => {
        if (plugin) {
            plugin.destroy();
        }
        document.createElement.mockRestore();
    });

    describe("init", () => {
        it("should attach ChartManager to all sheets", () => {
            for (const sheet of workbook.sheets.values()) {
                expect(sheet.chartManager).toBeDefined();
                expect(sheet.chartManager).not.toBeNull();
            }
        });
    });

    describe("addChart", () => {
        it("should create and add a bar chart", () => {
            const chart = plugin.addChart(CHART_TYPE.BAR, {
                startRow: 0,
                startCol: 0,
                endRow: 5,
                endCol: 3,
            });
            expect(chart).toBeDefined();
            expect(chart.type).toBe(CHART_TYPE.BAR);
            expect(chart.dataRange).toEqual({
                startRow: 0,
                startCol: 0,
                endRow: 5,
                endCol: 3,
            });
        });

        it("should return null when no active sheet", () => {
            workbook.activeSheet = null;
            const result = plugin.addChart(CHART_TYPE.BAR, {
                startRow: 0,
                startCol: 0,
                endRow: 5,
                endCol: 3,
            });
            expect(result).toBeNull();
        });

        it("should enforce minimum width and height", () => {
            const chart = plugin.addChart(
                CHART_TYPE.BAR,
                { startRow: 0, startCol: 0, endRow: 5, endCol: 3 },
                { width: 10, height: 10 },
            );
            expect(chart.width).toBeGreaterThanOrEqual(100);
            expect(chart.height).toBeGreaterThanOrEqual(80);
        });
    });

    describe("addBarChart / addLineChart / addPieChart / addAreaChart / addScatterChart", () => {
        it("should add bar chart via shortcut", () => {
            const chart = plugin.addBarChart({ startRow: 0, startCol: 0, endRow: 5, endCol: 3 });
            expect(chart.type).toBe("bar");
        });

        it("should add line chart via shortcut", () => {
            const chart = plugin.addLineChart({ startRow: 0, startCol: 0, endRow: 5, endCol: 3 });
            expect(chart.type).toBe("line");
        });

        it("should add pie chart via shortcut", () => {
            const chart = plugin.addPieChart({ startRow: 0, startCol: 0, endRow: 5, endCol: 3 });
            expect(chart.type).toBe("pie");
        });

        it("should add area chart via shortcut", () => {
            const chart = plugin.addAreaChart({ startRow: 0, startCol: 0, endRow: 5, endCol: 3 });
            expect(chart.type).toBe("area");
        });

        it("should add scatter chart via shortcut", () => {
            const chart = plugin.addScatterChart({ startRow: 0, startCol: 0, endRow: 5, endCol: 3 });
            expect(chart.type).toBe("scatter");
        });
    });

    describe("removeChart", () => {
        it("should remove chart by id", () => {
            const chart = plugin.addChart(CHART_TYPE.BAR, {
                startRow: 0,
                startCol: 0,
                endRow: 5,
                endCol: 3,
            });
            const removed = plugin.removeChart(chart.id);
            expect(removed).toBeDefined();
            expect(removed.id).toBe(chart.id);
            expect(plugin.getChart(chart.id)).toBeNull();
        });

        it("should return null for non-existent chart", () => {
            const result = plugin.removeChart("non-existent");
            expect(result).toBeNull();
        });
    });

    describe("updateChartStyle", () => {
        it("should update chart style", () => {
            const chart = plugin.addChart(CHART_TYPE.BAR, {
                startRow: 0,
                startCol: 0,
                endRow: 5,
                endCol: 3,
            });
            const updated = plugin.updateChartStyle(chart.id, { title: "Updated" });
            expect(updated.style.title).toBe("Updated");
        });
    });

    describe("updateChartDataRange", () => {
        it("should update chart data range", () => {
            const chart = plugin.addChart(CHART_TYPE.BAR, {
                startRow: 0,
                startCol: 0,
                endRow: 5,
                endCol: 3,
            });
            const newRange = { startRow: 1, startCol: 1, endRow: 10, endCol: 5 };
            const updated = plugin.updateChartDataRange(chart.id, newRange);
            expect(updated.dataRange).toEqual(newRange);
        });
    });

    describe("moveChart", () => {
        it("should update chart position", () => {
            const chart = plugin.addChart(CHART_TYPE.BAR, {
                startRow: 0,
                startCol: 0,
                endRow: 5,
                endCol: 3,
            });
            const moved = plugin.moveChart(chart.id, 100, 200);
            expect(moved.offsetX).toBe(100);
            expect(moved.offsetY).toBe(200);
        });
    });

    describe("resizeChart", () => {
        it("should update chart size", () => {
            const chart = plugin.addChart(CHART_TYPE.BAR, {
                startRow: 0,
                startCol: 0,
                endRow: 5,
                endCol: 3,
            });
            const resized = plugin.resizeChart(chart.id, 600, 400);
            expect(resized.width).toBe(600);
            expect(resized.height).toBe(400);
        });

        it("should enforce minimum size on resize", () => {
            const chart = plugin.addChart(CHART_TYPE.BAR, {
                startRow: 0,
                startCol: 0,
                endRow: 5,
                endCol: 3,
            });
            const resized = plugin.resizeChart(chart.id, 10, 10);
            expect(resized.width).toBeGreaterThanOrEqual(100);
            expect(resized.height).toBeGreaterThanOrEqual(80);
        });
    });

    describe("getChart", () => {
        it("should return chart by id", () => {
            const chart = plugin.addChart(CHART_TYPE.BAR, {
                startRow: 0,
                startCol: 0,
                endRow: 5,
                endCol: 3,
            });
            expect(plugin.getChart(chart.id)).toBe(chart);
        });

        it("should return null for non-existent chart", () => {
            expect(plugin.getChart("no-id")).toBeNull();
        });
    });

    describe("destroy", () => {
        it("should clean up all chart managers", () => {
            plugin.addChart(CHART_TYPE.BAR, { startRow: 0, startCol: 0, endRow: 5, endCol: 3 });
            plugin.destroy();
            for (const sheet of workbook.sheets.values()) {
                expect(sheet.chartManager).toBeNull();
            }
        });
    });
});