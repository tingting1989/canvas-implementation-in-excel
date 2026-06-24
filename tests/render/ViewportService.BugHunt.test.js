import { describe, it, expect, vi, beforeEach } from "vitest";
import { ViewportService } from "../../src/render/ViewportService.js";
import { RenderEngineViewportService } from "../../src/render/RenderEngineViewportService.js";

function createMockRenderEngine(overrides = {}) {
    const {
        scrollX = 0,
        scrollY = 0,
        viewW = 800,
        viewH = 600,
        maxScrollX = 5000,
        maxScrollY = 3000,
    } = overrides;

    return {
        scrollX,
        scrollY,
        viewW,
        viewH,
        maxScrollX,
        maxScrollY,
        canvas: {
            width: viewW * 2,
            height: viewH * 2,
            style: {},
            parentElement: { appendChild: vi.fn(), removeChild: vi.fn() },
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            getBoundingClientRect: () => ({ left: 0, top: 0, right: viewW, bottom: viewH }),
        },
        currentSheet: overrides.currentSheet ?? null,
        getCellRect: vi.fn((row, col) => ({ x: col * 100 + 46, y: row * 28 + 28, w: 100, h: 28 })),
        hitTest: vi.fn(() => null),
        headerHitTest: vi.fn(() => null),
        fillHandleHitTest: vi.fn(() => false),
        scrollToCell: vi.fn(),
        setResizeLine: vi.fn(),
        clearResizeLine: vi.fn(),
        invalidateAll: vi.fn(),
        render: vi.fn(),
    };
}

function createMockSheet(options = {}) {
    const {
        headerW = 46,
        headerH = 28,
        fixedCols = 0,
        fixedRows = 0,
        frozenColsW = 0,
        frozenRowsH = 0,
        colWidths = {},
        rowHeights = {},
        defaultColWidth = 100,
        defaultRowHeight = 28,
    } = options;

    const colXCache = {};
    const rowYCache = {};

    function getColX(col) {
        if (colXCache[col] !== undefined) return colXCache[col];
        if (col === 0) return 0;
        let x = 0;
        for (let c = 0; c < col; c++) x += colWidths[c] ?? defaultColWidth;
        colXCache[col] = x;
        return x;
    }

    function getRowY(row) {
        if (rowYCache[row] !== undefined) return rowYCache[row];
        if (row === 0) return 0;
        let y = 0;
        for (let r = 0; r < row; r++) y += rowHeights[r] ?? defaultRowHeight;
        rowYCache[row] = y;
        return y;
    }

    function getColWidth(col) { return colWidths[col] ?? defaultColWidth; }
    function getRowHeight(row) { return rowHeights[row] ?? defaultRowHeight; }

    function colAt(dataX) {
        let x = 0, col = 0;
        while (x + getColWidth(col) <= dataX && col < 1000) { x += getColWidth(col); col++; }
        return col;
    }

    function rowAt(dataY) {
        let y = 0, row = 0;
        while (y + getRowHeight(row) <= dataY && row < 1000) { y += getRowHeight(row); row++; }
        return row;
    }

    return {
        getHeaderWidth: () => headerW,
        getHeaderHeight: () => headerH,
        fixedColumnsStart: fixedCols,
        fixedRowsTop: fixedRows,
        frozenColsWidth: frozenColsW,
        frozenRowsHeight: frozenRowsH,
        rowColManager: { getColX, getRowY, getColWidth, getRowHeight, colAt, rowAt },
    };
}

describe("ViewportService - BugHunt", () => {
    describe("RenderEngineViewportService - boundary inputs", () => {
        let mockEngine;
        let service;

        beforeEach(() => {
            mockEngine = createMockRenderEngine();
            service = new RenderEngineViewportService(mockEngine);
        });

        it("should handle negative row/col in getCellRect", () => {
            service.getCellRect(-1, -1);
            expect(mockEngine.getCellRect).toHaveBeenCalledWith(-1, -1, null);
        });

        it("should handle zero row/col in getCellRect", () => {
            service.getCellRect(0, 0);
            expect(mockEngine.getCellRect).toHaveBeenCalledWith(0, 0, null);
        });

        it("should handle very large row/col in getCellRect", () => {
            service.getCellRect(999999, 999999);
            expect(mockEngine.getCellRect).toHaveBeenCalledWith(999999, 999999, null);
        });

        it("should handle Infinity row/col in getCellRect", () => {
            service.getCellRect(Infinity, Infinity);
            expect(mockEngine.getCellRect).toHaveBeenCalledWith(Infinity, Infinity, null);
        });

        it("should handle NaN row/col in getCellRect", () => {
            service.getCellRect(NaN, NaN);
            expect(mockEngine.getCellRect).toHaveBeenCalledWith(NaN, NaN, null);
        });

        it("should handle negative client coordinates in hitTest", () => {
            service.hitTest(-100, -200);
            expect(mockEngine.hitTest).toHaveBeenCalledWith(-100, -200);
        });

        it("should handle zero-size canvas in isCellVisible", () => {
            const sheet = createMockSheet();
            mockEngine.currentSheet = sheet;
            expect(() => service.isCellVisible(0, 0, 0, 0, 0)).not.toThrow();
        });

        it("should handle negative canvas dimensions in isCellVisible", () => {
            const sheet = createMockSheet();
            mockEngine.currentSheet = sheet;
            expect(() => service.isCellVisible(0, 0, -100, -200, 0)).not.toThrow();
        });

        it("should handle NaN canvas dimensions in isCellVisible", () => {
            const sheet = createMockSheet();
            mockEngine.currentSheet = sheet;
            expect(() => service.isCellVisible(0, 0, NaN, NaN, 0)).not.toThrow();
        });

        it("should handle very large canvas dimensions in isCellVisible", () => {
            const sheet = createMockSheet();
            mockEngine.currentSheet = sheet;
            expect(service.isCellVisible(0, 0, 1e8, 1e8, 0)).toBe(true);
        });

        it("should handle negative tab height in isCellVisible", () => {
            const sheet = createMockSheet();
            mockEngine.currentSheet = sheet;
            expect(() => service.isCellVisible(0, 0, 800, 600, -30)).not.toThrow();
        });

        it("should handle scrollToCell with negative values", () => {
            service.scrollToCell(-1, -1);
            expect(mockEngine.scrollToCell).toHaveBeenCalledWith(-1, -1);
        });

        it("should handle scrollToCell with zero values", () => {
            service.scrollToCell(0, 0);
            expect(mockEngine.scrollToCell).toHaveBeenCalledWith(0, 0);
        });

        it("should handle scrollToCell with very large values", () => {
            service.scrollToCell(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
            expect(mockEngine.scrollToCell).toHaveBeenCalledWith(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
        });

        it("should handle setResizeLine with empty type string", () => {
            service.setResizeLine("", 0, 0);
            expect(mockEngine.setResizeLine).toHaveBeenCalledWith("", 0, 0);
        });

        it("should handle setResizeLine with negative index", () => {
            service.setResizeLine("col", -5, 100);
            expect(mockEngine.setResizeLine).toHaveBeenCalledWith("col", -5, 100);
        });

        it("should handle setResizeLine with negative position", () => {
            service.setResizeLine("col", 0, -100);
            expect(mockEngine.setResizeLine).toHaveBeenCalledWith("col", 0, -100);
        });
    });

    describe("isCellVisible - edge cases", () => {
        it("should return false when currentSheet is null", () => {
            const engine = createMockRenderEngine({ currentSheet: null });
            const service = new RenderEngineViewportService(engine);
            expect(service.isCellVisible(0, 0, 800, 600)).toBe(false);
        });

        it("should return false when currentSheet is undefined", () => {
            const engine = createMockRenderEngine();
            engine.currentSheet = undefined;
            const service = new RenderEngineViewportService(engine);
            expect(service.isCellVisible(0, 0, 800, 600)).toBe(false);
        });

        it("should handle cell at exact boundary of visible area", () => {
            const sheet = createMockSheet();
            const engine = createMockRenderEngine({ currentSheet: sheet, scrollX: 0, scrollY: 0 });
            const service = new RenderEngineViewportService(engine);
            const visible = service.isCellVisible(0, 0, 146, 56, 0);
            expect(typeof visible).toBe("boolean");
        });

        it("should handle cell just outside visible area", () => {
            const sheet = createMockSheet();
            const engine = createMockRenderEngine({ currentSheet: sheet, scrollX: 0, scrollY: 0 });
            const service = new RenderEngineViewportService(engine);
            expect(service.isCellVisible(0, 7, 800, 600, 0)).toBe(true);
            expect(service.isCellVisible(0, 100, 800, 600, 0)).toBe(false);
        });

        it("should handle frozen columns at scroll boundary", () => {
            const sheet = createMockSheet({ fixedCols: 1, frozenColsW: 100 });
            const engine = createMockRenderEngine({ currentSheet: sheet, scrollX: 1000, scrollY: 0 });
            const service = new RenderEngineViewportService(engine);
            expect(service.isCellVisible(0, 0, 800, 600, 0)).toBe(true);
        });

        it("should handle frozen rows at scroll boundary", () => {
            const sheet = createMockSheet({ fixedRows: 1, frozenRowsH: 28 });
            const engine = createMockRenderEngine({ currentSheet: sheet, scrollX: 0, scrollY: 1000 });
            const service = new RenderEngineViewportService(engine);
            expect(service.isCellVisible(0, 0, 800, 600, 0)).toBe(true);
        });

        it("should handle both frozen rows and columns simultaneously", () => {
            const sheet = createMockSheet({ fixedCols: 1, fixedRows: 1, frozenColsW: 100, frozenRowsH: 28 });
            const engine = createMockRenderEngine({ currentSheet: sheet, scrollX: 500, scrollY: 500 });
            const service = new RenderEngineViewportService(engine);
            expect(service.isCellVisible(0, 0, 800, 600, 0)).toBe(true);
        });

        it("should handle extremely large scroll values", () => {
            const sheet = createMockSheet();
            const engine = createMockRenderEngine({ currentSheet: sheet, scrollX: 1e8, scrollY: 1e8 });
            const service = new RenderEngineViewportService(engine);
            expect(service.isCellVisible(0, 0, 800, 600, 0)).toBe(false);
        });

        it("should handle negative scroll values gracefully", () => {
            const sheet = createMockSheet();
            const engine = createMockRenderEngine({ currentSheet: sheet, scrollX: -100, scrollY: -100 });
            const service = new RenderEngineViewportService(engine);
            expect(() => service.isCellVisible(0, 0, 800, 600, 0)).not.toThrow();
        });

        it("should handle NaN scroll values", () => {
            const sheet = createMockSheet();
            const engine = createMockRenderEngine({ currentSheet: sheet });
            engine.scrollX = NaN;
            engine.scrollY = NaN;
            const service = new RenderEngineViewportService(engine);
            expect(() => service.isCellVisible(0, 0, 800, 600, 0)).not.toThrow();
        });
    });

    describe("ViewportService abstract class - abuse cases", () => {
        it("should throw for every property access on raw ViewportService", () => {
            const svc = new ViewportService();
            const props = ["scrollX", "scrollY", "viewW", "viewH", "maxScrollX", "maxScrollY", "canvasParent", "canvas"];
            for (const prop of props) {
                expect(() => svc[prop]).toThrow("must be implemented");
            }
        });

        it("should throw for every method call on raw ViewportService", () => {
            const svc = new ViewportService();
            const methods = [
                () => svc.getCellRect(0, 0),
                () => svc.hitTest(0, 0),
                () => svc.headerHitTest(0, 0),
                () => svc.fillHandleHitTest(0, 0),
                () => svc.scrollToCell(0, 0),
                () => svc.isCellVisible(0, 0, 800, 600),
                () => svc.setResizeLine("col", 0, 0),
                () => svc.clearResizeLine(),
                () => svc.invalidateAll(),
                () => svc.render(null),
            ];
            for (const fn of methods) {
                expect(fn).toThrow("must be implemented");
            }
        });

        it("should not throw when subclass correctly overrides all abstract members", () => {
            class CompleteImpl extends ViewportService {
                get scrollX() { return 0; }
                get scrollY() { return 0; }
                get viewW() { return 800; }
                get viewH() { return 600; }
                get maxScrollX() { return 0; }
                get maxScrollY() { return 0; }
                get canvasParent() { return null; }
                get canvas() { return null; }
                getCellRect() { return { x: 0, y: 0, w: 0, h: 0 }; }
                hitTest() { return null; }
                headerHitTest() { return null; }
                fillHandleHitTest() { return false; }
                scrollToCell() {}
                isCellVisible() { return false; }
                setResizeLine() {}
                clearResizeLine() {}
                invalidateAll() {}
                render() {}
            }

            const impl = new CompleteImpl();
            expect(impl.scrollX).toBe(0);
            expect(impl.isCellVisible(0, 0, 800, 600)).toBe(false);
        });
    });

    describe("RenderEngineViewportService - stress tests", () => {
        it("should handle rapid sequential scrollToCell calls", () => {
            const engine = createMockRenderEngine();
            const service = new RenderEngineViewportService(engine);
            for (let i = 0; i < 1000; i++) {
                service.scrollToCell(i, i);
            }
            expect(engine.scrollToCell).toHaveBeenCalledTimes(1000);
            expect(engine.scrollToCell).toHaveBeenLastCalledWith(999, 999);
        });

        it("should handle rapid sequential invalidateAll calls", () => {
            const engine = createMockRenderEngine();
            const service = new RenderEngineViewportService(engine);
            for (let i = 0; i < 1000; i++) {
                service.invalidateAll();
            }
            expect(engine.invalidateAll).toHaveBeenCalledTimes(1000);
        });

        it("should handle alternating setResizeLine and clearResizeLine", () => {
            const engine = createMockRenderEngine();
            const service = new RenderEngineViewportService(engine);
            for (let i = 0; i < 500; i++) {
                service.setResizeLine("col", i, i * 100);
                service.clearResizeLine();
            }
            expect(engine.setResizeLine).toHaveBeenCalledTimes(500);
            expect(engine.clearResizeLine).toHaveBeenCalledTimes(500);
        });

        it("should handle rapid getCellRect calls with varying parameters", () => {
            const engine = createMockRenderEngine();
            const service = new RenderEngineViewportService(engine);
            for (let r = 0; r < 100; r++) {
                for (let c = 0; c < 100; c++) {
                    service.getCellRect(r, c);
                }
            }
            expect(engine.getCellRect).toHaveBeenCalledTimes(10000);
        });

        it("should handle isCellVisible with many different cells", () => {
            const sheet = createMockSheet();
            const engine = createMockRenderEngine({ currentSheet: sheet, scrollX: 0, scrollY: 0 });
            const service = new RenderEngineViewportService(engine);
            let visibleCount = 0;
            for (let r = 0; r < 50; r++) {
                for (let c = 0; c < 50; c++) {
                    if (service.isCellVisible(r, c, 800, 600, 0)) visibleCount++;
                }
            }
            expect(visibleCount).toBeGreaterThan(0);
            expect(visibleCount).toBeLessThan(2500);
        });
    });

    describe("RenderEngineViewportService - null/undefined safety", () => {
        it("should handle null canvas gracefully for canvasParent", () => {
            const engine = createMockRenderEngine();
            engine.canvas = null;
            const service = new RenderEngineViewportService(engine);
            expect(service.canvasParent).toBeNull();
        });

        it("should handle null canvas gracefully for canvas", () => {
            const engine = createMockRenderEngine();
            engine.canvas = null;
            const service = new RenderEngineViewportService(engine);
            expect(service.canvas).toBeNull();
        });

        it("should handle undefined mergeInfo in getCellRect", () => {
            const engine = createMockRenderEngine();
            const service = new RenderEngineViewportService(engine);
            service.getCellRect(0, 0, undefined);
            expect(engine.getCellRect).toHaveBeenCalledWith(0, 0, null);
        });

        it("should handle null mergeInfo in getCellRect", () => {
            const engine = createMockRenderEngine();
            const service = new RenderEngineViewportService(engine);
            service.getCellRect(0, 0, null);
            expect(engine.getCellRect).toHaveBeenCalledWith(0, 0, null);
        });

        it("should handle missing tabH parameter in isCellVisible", () => {
            const sheet = createMockSheet();
            const engine = createMockRenderEngine({ currentSheet: sheet });
            const service = new RenderEngineViewportService(engine);
            expect(() => service.isCellVisible(0, 0, 800, 600)).not.toThrow();
        });
    });

    describe("RenderEngineViewportService - type coercion", () => {
        it("should pass string row/col to getCellRect without validation", () => {
            const engine = createMockRenderEngine();
            const service = new RenderEngineViewportService(engine);
            service.getCellRect("5", "3");
            expect(engine.getCellRect).toHaveBeenCalledWith("5", "3", null);
        });

        it("should pass float row/col to getCellRect without validation", () => {
            const engine = createMockRenderEngine();
            const service = new RenderEngineViewportService(engine);
            service.getCellRect(2.5, 3.7);
            expect(engine.getCellRect).toHaveBeenCalledWith(2.5, 3.7, null);
        });

        it("should pass boolean row/col to scrollToCell without validation", () => {
            const engine = createMockRenderEngine();
            const service = new RenderEngineViewportService(engine);
            service.scrollToCell(true, false);
            expect(engine.scrollToCell).toHaveBeenCalledWith(true, false);
        });
    });

    describe("ViewportService subclass contract enforcement", () => {
        it("should enforce that partial implementation still throws for missing methods", () => {
            class PartialImpl extends ViewportService {
                get scrollX() { return 0; }
                get scrollY() { return 0; }
            }

            const impl = new PartialImpl();
            expect(impl.scrollX).toBe(0);
            expect(impl.scrollY).toBe(0);
            expect(() => impl.viewW).toThrow("must be implemented");
            expect(() => impl.getCellRect(0, 0)).toThrow("must be implemented");
            expect(() => impl.hitTest(0, 0)).toThrow("must be implemented");
        });

        it("should allow subclass to override only needed methods for testing", () => {
            class MinimalTestImpl extends ViewportService {
                get scrollX() { return 0; }
                get scrollY() { return 0; }
                get viewW() { return 800; }
                get viewH() { return 600; }
                get maxScrollX() { return 0; }
                get maxScrollY() { return 0; }
                get canvasParent() { return null; }
                get canvas() { return null; }
                hitTest() { return { type: "cell", row: 0, col: 0 }; }
                getCellRect() { return { x: 0, y: 0, w: 100, h: 28 }; }
                scrollToCell() {}
                isCellVisible() { return true; }
                setResizeLine() {}
                clearResizeLine() {}
                invalidateAll() {}
                render() {}
                fillHandleHitTest() { return false; }
                headerHitTest() { return null; }
            }

            const impl = new MinimalTestImpl();
            expect(impl.hitTest(0, 0)).toEqual({ type: "cell", row: 0, col: 0 });
            expect(impl.isCellVisible(0, 0, 800, 600)).toBe(true);
        });
    });
});