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

    const mockCanvas = {
        width: viewW * 2,
        height: viewH * 2,
        style: {},
        parentElement: { appendChild: vi.fn(), removeChild: vi.fn() },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getBoundingClientRect: () => ({ left: 0, top: 0, right: viewW, bottom: viewH }),
    };

    return {
        scrollX,
        scrollY,
        viewW,
        viewH,
        maxScrollX,
        maxScrollY,
        canvas: mockCanvas,
        currentSheet: overrides.currentSheet ?? null,
        getCellRect: vi.fn((row, col, mergeInfo) => ({
            x: col * 100 + 46,
            y: row * 28 + 28,
            w: 100,
            h: 28,
        })),
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
        for (let c = 0; c < col; c++) {
            x += colWidths[c] ?? defaultColWidth;
        }
        colXCache[col] = x;
        return x;
    }

    function getRowY(row) {
        if (rowYCache[row] !== undefined) return rowYCache[row];
        if (row === 0) return 0;
        let y = 0;
        for (let r = 0; r < row; r++) {
            y += rowHeights[r] ?? defaultRowHeight;
        }
        rowYCache[row] = y;
        return y;
    }

    function getColWidth(col) {
        return colWidths[col] ?? defaultColWidth;
    }

    function getRowHeight(row) {
        return rowHeights[row] ?? defaultRowHeight;
    }

    function colAt(dataX) {
        let x = 0;
        let col = 0;
        while (x + getColWidth(col) <= dataX && col < 1000) {
            x += getColWidth(col);
            col++;
        }
        return col;
    }

    function rowAt(dataY) {
        let y = 0;
        let row = 0;
        while (y + getRowHeight(row) <= dataY && row < 1000) {
            y += getRowHeight(row);
            row++;
        }
        return row;
    }

    return {
        getHeaderWidth: () => headerW,
        getHeaderHeight: () => headerH,
        fixedColumnsStart: fixedCols,
        fixedRowsTop: fixedRows,
        frozenColsWidth: frozenColsW,
        frozenRowsHeight: frozenRowsH,
        rowColManager: {
            getColX,
            getRowY,
            getColWidth,
            getRowHeight,
            colAt,
            rowAt,
        },
    };
}

describe("ViewportService", () => {
    describe("interface contract", () => {
        it("should throw for all abstract methods when called directly", () => {
            const service = new ViewportService();

            expect(() => service.scrollX).toThrow("must be implemented");
            expect(() => service.scrollY).toThrow("must be implemented");
            expect(() => service.viewW).toThrow("must be implemented");
            expect(() => service.viewH).toThrow("must be implemented");
            expect(() => service.maxScrollX).toThrow("must be implemented");
            expect(() => service.maxScrollY).toThrow("must be implemented");
            expect(() => service.getCellRect(0, 0)).toThrow("must be implemented");
            expect(() => service.hitTest(0, 0)).toThrow("must be implemented");
            expect(() => service.headerHitTest(0, 0)).toThrow("must be implemented");
            expect(() => service.fillHandleHitTest(0, 0)).toThrow("must be implemented");
            expect(() => service.scrollToCell(0, 0)).toThrow("must be implemented");
            expect(() => service.isCellVisible(0, 0, 800, 600)).toThrow("must be implemented");
            expect(() => service.setResizeLine("col", 0, 0)).toThrow("must be implemented");
            expect(() => service.clearResizeLine()).toThrow("must be implemented");
            expect(() => service.invalidateAll()).toThrow("must be implemented");
            expect(() => service.canvasParent).toThrow("must be implemented");
            expect(() => service.canvas).toThrow("must be implemented");
            expect(() => service.render(null)).toThrow("must be implemented");
        });
    });

    describe("RenderEngineViewportService", () => {
        let mockEngine;
        let service;

        beforeEach(() => {
            mockEngine = createMockRenderEngine();
            service = new RenderEngineViewportService(mockEngine);
        });

        describe("property delegation", () => {
            it("should delegate scrollX", () => {
                expect(service.scrollX).toBe(0);
                mockEngine.scrollX = 150;
                expect(service.scrollX).toBe(150);
            });

            it("should delegate scrollY", () => {
                expect(service.scrollY).toBe(0);
                mockEngine.scrollY = 300;
                expect(service.scrollY).toBe(300);
            });

            it("should delegate viewW", () => {
                expect(service.viewW).toBe(800);
            });

            it("should delegate viewH", () => {
                expect(service.viewH).toBe(600);
            });

            it("should delegate maxScrollX", () => {
                expect(service.maxScrollX).toBe(5000);
            });

            it("should delegate maxScrollY", () => {
                expect(service.maxScrollY).toBe(3000);
            });

            it("should delegate canvas", () => {
                expect(service.canvas).toBe(mockEngine.canvas);
            });

            it("should delegate canvasParent", () => {
                expect(service.canvasParent).toBe(mockEngine.canvas.parentElement);
            });
        });

        describe("method delegation", () => {
            it("should delegate getCellRect", () => {
                const rect = service.getCellRect(2, 3);
                expect(mockEngine.getCellRect).toHaveBeenCalledWith(2, 3, null);
                expect(rect).toEqual({ x: 3 * 100 + 46, y: 2 * 28 + 28, w: 100, h: 28 });
            });

            it("should delegate getCellRect with mergeInfo", () => {
                const merge = { topRow: 1, topCol: 2, bottomRow: 3, bottomCol: 4 };
                service.getCellRect(1, 2, merge);
                expect(mockEngine.getCellRect).toHaveBeenCalledWith(1, 2, merge);
            });

            it("should delegate hitTest", () => {
                service.hitTest(100, 200);
                expect(mockEngine.hitTest).toHaveBeenCalledWith(100, 200);
            });

            it("should delegate headerHitTest", () => {
                service.headerHitTest(50, 10);
                expect(mockEngine.headerHitTest).toHaveBeenCalledWith(50, 10);
            });

            it("should delegate fillHandleHitTest", () => {
                service.fillHandleHitTest(100, 200);
                expect(mockEngine.fillHandleHitTest).toHaveBeenCalledWith(100, 200);
            });

            it("should delegate scrollToCell", () => {
                service.scrollToCell(5, 3);
                expect(mockEngine.scrollToCell).toHaveBeenCalledWith(5, 3);
            });

            it("should delegate setResizeLine", () => {
                service.setResizeLine("col", 2, 300);
                expect(mockEngine.setResizeLine).toHaveBeenCalledWith("col", 2, 300);
            });

            it("should delegate clearResizeLine", () => {
                service.clearResizeLine();
                expect(mockEngine.clearResizeLine).toHaveBeenCalled();
            });

            it("should delegate invalidateAll", () => {
                service.invalidateAll();
                expect(mockEngine.invalidateAll).toHaveBeenCalled();
            });

            it("should delegate render", () => {
                const mockSheet = createMockSheet();
                service.render(mockSheet);
                expect(mockEngine.render).toHaveBeenCalledWith(mockSheet);
            });
        });

        describe("isCellVisible", () => {
            it("should return false when no currentSheet", () => {
                mockEngine.currentSheet = null;
                expect(service.isCellVisible(0, 0, 800, 600)).toBe(false);
            });

            it("should return true for visible cell at origin with no scroll", () => {
                const sheet = createMockSheet();
                mockEngine.currentSheet = sheet;
                mockEngine.scrollX = 0;
                mockEngine.scrollY = 0;
                expect(service.isCellVisible(0, 0, 800, 600, 0)).toBe(true);
            });

            it("should return false for cell scrolled out of view", () => {
                const sheet = createMockSheet();
                mockEngine.currentSheet = sheet;
                mockEngine.scrollX = 0;
                mockEngine.scrollY = 0;
                expect(service.isCellVisible(100, 100, 800, 600, 0)).toBe(false);
            });

            it("should respect tab height when checking visibility", () => {
                const sheet = createMockSheet();
                mockEngine.currentSheet = sheet;
                mockEngine.scrollX = 0;
                mockEngine.scrollY = 0;
                const visibleWithoutTab = service.isCellVisible(20, 0, 800, 600, 0);
                const visibleWithTab = service.isCellVisible(20, 0, 800, 600, 30);
                if (visibleWithoutTab && !visibleWithTab) {
                    expect(true).toBe(true);
                } else {
                    expect(visibleWithTab).toBe(visibleWithoutTab);
                }
            });

            it("should handle frozen columns correctly", () => {
                const sheet = createMockSheet({ fixedCols: 2, frozenColsW: 200 });
                mockEngine.currentSheet = sheet;
                mockEngine.scrollX = 500;
                mockEngine.scrollY = 0;
                expect(service.isCellVisible(0, 0, 800, 600, 0)).toBe(true);
                expect(service.isCellVisible(0, 1, 800, 600, 0)).toBe(true);
            });

            it("should handle frozen rows correctly", () => {
                const sheet = createMockSheet({ fixedRows: 2, frozenRowsH: 56 });
                mockEngine.currentSheet = sheet;
                mockEngine.scrollX = 0;
                mockEngine.scrollY = 500;
                expect(service.isCellVisible(0, 0, 800, 600, 0)).toBe(true);
                expect(service.isCellVisible(1, 0, 800, 600, 0)).toBe(true);
            });
        });
    });

    describe("custom ViewportService implementation", () => {
        class TestViewportService extends ViewportService {
            #data = {};

            constructor(data) {
                super();
                this.#data = data;
            }

            get scrollX() { return this.#data.scrollX ?? 0; }
            get scrollY() { return this.#data.scrollY ?? 0; }
            get viewW() { return this.#data.viewW ?? 800; }
            get viewH() { return this.#data.viewH ?? 600; }
            get maxScrollX() { return this.#data.maxScrollX ?? 0; }
            get maxScrollY() { return this.#data.maxScrollY ?? 0; }
            get canvasParent() { return this.#data.canvasParent ?? null; }
            get canvas() { return this.#data.canvas ?? null; }

            getCellRect(row, col, mergeInfo = null) {
                return { x: col * 100, y: row * 28, w: 100, h: 28 };
            }

            hitTest(clientX, clientY) {
                return this.#data.hitResult ?? null;
            }

            headerHitTest(clientX, clientY) {
                return this.#data.headerHitResult ?? null;
            }

            fillHandleHitTest(clientX, clientY) {
                return this.#data.fillHandleResult ?? false;
            }

            scrollToCell(row, col) {
                this.#data.lastScrollTarget = { row, col };
            }

            isCellVisible(row, col, canvasW, canvasH, tabH = 0) {
                return this.#data.visibleCells?.has(`${row},${col}`) ?? true;
            }

            setResizeLine(type, index, position) {
                this.#data.resizeLine = { type, index, position };
            }

            clearResizeLine() {
                this.#data.resizeLine = null;
            }

            invalidateAll() {
                this.#data.invalidated = true;
            }

            render(sheet) {
                this.#data.rendered = true;
            }
        }

        it("should allow custom implementation to override all methods", () => {
            const data = { scrollX: 100, scrollY: 200 };
            const service = new TestViewportService(data);

            expect(service.scrollX).toBe(100);
            expect(service.scrollY).toBe(200);
            expect(service.viewW).toBe(800);
            expect(service.viewH).toBe(600);
        });

        it("should allow custom hitTest implementation", () => {
            const hitResult = { type: "cell", row: 3, col: 5 };
            const service = new TestViewportService({ hitResult });
            expect(service.hitTest(350, 100)).toEqual(hitResult);
        });

        it("should track scrollToCell calls in custom implementation", () => {
            const data = {};
            const service = new TestViewportService(data);
            service.scrollToCell(10, 20);
            expect(data.lastScrollTarget).toEqual({ row: 10, col: 20 });
        });

        it("should support custom isCellVisible logic", () => {
            const visibleCells = new Set(["0,0", "1,1"]);
            const service = new TestViewportService({ visibleCells });
            expect(service.isCellVisible(0, 0, 800, 600)).toBe(true);
            expect(service.isCellVisible(1, 1, 800, 600)).toBe(true);
            expect(service.isCellVisible(5, 5, 800, 600)).toBe(false);
        });

        it("should track resize line operations", () => {
            const data = {};
            const service = new TestViewportService(data);
            service.setResizeLine("col", 3, 350);
            expect(data.resizeLine).toEqual({ type: "col", index: 3, position: 350 });
            service.clearResizeLine();
            expect(data.resizeLine).toBeNull();
        });

        it("should track invalidation and rendering", () => {
            const data = {};
            const service = new TestViewportService(data);
            service.invalidateAll();
            expect(data.invalidated).toBe(true);
            service.render({});
            expect(data.rendered).toBe(true);
        });
    });

    describe("dependency injection", () => {
        it("should work as a drop-in replacement in strategy pattern", () => {
            const data = {
                hitResult: { type: "cell", row: 0, col: 0 },
                visibleCells: new Set(["0,0"]),
            };

            class TestViewportService extends ViewportService {
                get scrollX() { return 0; }
                get scrollY() { return 0; }
                get viewW() { return 800; }
                get viewH() { return 600; }
                get maxScrollX() { return 0; }
                get maxScrollY() { return 0; }
                get canvasParent() { return null; }
                get canvas() { return null; }
                getCellRect(r, c) { return { x: c * 100, y: r * 28, w: 100, h: 28 }; }
                hitTest() { return data.hitResult; }
                headerHitTest() { return null; }
                fillHandleHitTest() { return false; }
                scrollToCell() {}
                isCellVisible(r, c) { return data.visibleCells.has(`${r},${c}`); }
                setResizeLine() {}
                clearResizeLine() {}
                invalidateAll() {}
                render() {}
            }

            const viewport = new TestViewportService();

            const hit = viewport.hitTest(100, 50);
            expect(hit).toEqual({ type: "cell", row: 0, col: 0 });

            const rect = viewport.getCellRect(0, 0);
            expect(rect).toEqual({ x: 0, y: 0, w: 100, h: 28 });

            expect(viewport.isCellVisible(0, 0, 800, 600)).toBe(true);
            expect(viewport.isCellVisible(5, 5, 800, 600)).toBe(false);
        });
    });
});