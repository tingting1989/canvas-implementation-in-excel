 import { describe, it, expect, vi, beforeEach } from "vitest";
import { TileRenderer } from "../../src/render/TileRenderer.js";
import { TileCache } from "../../src/render/TileCache.js";
import { CellRenderContext } from "../../src/types/CellRenderContext.js";
import { BaseColumnType } from "../../src/types/BaseColumnType.js";
import { CONFIG } from "../../src/constants/config.js";

describe("TileRenderer - Custom Renderer Integration", () => {
    let tileCache;
    let renderer;

    beforeEach(() => {
        tileCache = new TileCache();
        renderer = new TileRenderer(tileCache);
    });

    function createMockSheet(cellTypeInstance) {
        return {
            rowColManager: {
                rowAt: vi.fn((y) => Math.floor(y / 24)),
                colAt: vi.fn((x) => Math.floor(x / 80)),
                rowCount: 100,
                colCount: 26,
                getRowY: vi.fn((r) => r * 24),
                getRowHeight: vi.fn(() => 24),
                getColX: vi.fn((c) => c * 80),
                getColWidth: vi.fn(() => 80),
                getRealRowY: vi.fn((r) => r * 24),
                getRealRowHeight: vi.fn(() => 24),
            },
            cellStore: {
                get: vi.fn((r, c) => ({ value: r * 26 + c })),
            },
            resolveStyle: vi.fn(() => ({
                backgroundColor: "#fff",
                color: "#222",
                fontSize: 12,
                fontFamily: "Segoe UI",
                textAlign: "left",
                fontStyle: "normal",
                fontWeight: "normal",
            })),
            formatCellValue: vi.fn((_r, _c, v) => String(v ?? "")),
            getCellTypeInstance: vi.fn(() => cellTypeInstance),
            getMerge: vi.fn(() => null),
            isMergedCell: vi.fn(() => false),
            toRealRow: vi.fn((r) => r),
            getHeaderWidth: vi.fn(() => 50),
            getHeaderHeight: vi.fn(() => 25),
            cellPadding: 6,
            textOverflowEllipsis: true,
            fixedRowsTop: 0,
            fixedColumnsStart: 0,
            bus: {
                emit: vi.fn(() => null),
            },
        };
    }

    it("should call custom renderer when hasCustomRenderer is true", () => {
        const renderSpy = vi.fn();
        const customType = new BaseColumnType();
        vi.spyOn(customType, "hasCustomRenderer", "get").mockReturnValue(true);
        vi.spyOn(customType, "render").mockImplementation(renderSpy);

        const sheet = createMockSheet(customType);
        const ctx = {
            drawImage: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
        };

        tileCache.markAllDirty();
        renderer.render(ctx, sheet, 0, 0, 800, 600);

        expect(renderSpy).toHaveBeenCalled();
        expect(renderSpy.mock.calls[0][0]).toBeInstanceOf(CellRenderContext);
    });

    it("should pass correct cell value to custom renderer", () => {
        const renderSpy = vi.fn();
        const customType = new BaseColumnType();
        vi.spyOn(customType, "hasCustomRenderer", "get").mockReturnValue(true);
        vi.spyOn(customType, "render").mockImplementation(renderSpy);

        const sheet = createMockSheet(customType);
        sheet.cellStore.get = vi.fn((_r, _c) => ({ value: 75 }));

        const ctx = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn() };
        tileCache.markAllDirty();
        renderer.render(ctx, sheet, 0, 0, 800, 600);

        const context = renderSpy.mock.calls[0][0];
        expect(context.value).toBe(75);
    });

    it("should pass displayValue from formatCellValue", () => {
        const renderSpy = vi.fn();
        const customType = new BaseColumnType();
        vi.spyOn(customType, "hasCustomRenderer", "get").mockReturnValue(true);
        vi.spyOn(customType, "render").mockImplementation(renderSpy);

        const sheet = createMockSheet(customType);
        sheet.cellStore.get = vi.fn(() => ({ value: 0.75 }));
        sheet.formatCellValue = vi.fn(() => "75%");

        const ctx = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn() };
        tileCache.markAllDirty();
        renderer.render(ctx, sheet, 0, 0, 800, 600);

        const context = renderSpy.mock.calls[0][0];
        expect(context.displayValue).toBe("75%");
    });

    it("should pass style from resolveStyle", () => {
        const renderSpy = vi.fn();
        const customType = new BaseColumnType();
        vi.spyOn(customType, "hasCustomRenderer", "get").mockReturnValue(true);
        vi.spyOn(customType, "render").mockImplementation(renderSpy);

        const sheet = createMockSheet(customType);
        sheet.resolveStyle = vi.fn(() => ({
            backgroundColor: "#ff0",
            color: "#f00",
            fontSize: 14,
            fontFamily: "Arial",
            textAlign: "center",
        }));

        const ctx = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn() };
        tileCache.markAllDirty();
        renderer.render(ctx, sheet, 0, 0, 800, 600);

        const context = renderSpy.mock.calls[0][0];
        expect(context.style.color).toBe("#f00");
        expect(context.style.fontSize).toBe(14);
    });

    it("should pass pageInfo with frozen area info", () => {
        const renderSpy = vi.fn();
        const customType = new BaseColumnType();
        vi.spyOn(customType, "hasCustomRenderer", "get").mockReturnValue(true);
        vi.spyOn(customType, "render").mockImplementation(renderSpy);

        const sheet = createMockSheet(customType);
        sheet.fixedRowsTop = 2;
        sheet.fixedColumnsStart = 1;

        const ctx = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn() };
        tileCache.markAllDirty();
        renderer.render(ctx, sheet, 0, 0, 800, 600);

        const context = renderSpy.mock.calls[0][0];
        expect(context.pageInfo.frozenRowCount).toBe(2);
        expect(context.pageInfo.frozenColCount).toBe(1);
    });

    it("should fall back to drawCellText when hasCustomRenderer is false", () => {
        const defaultType = new BaseColumnType();
        vi.spyOn(defaultType, "hasCustomRenderer", "get").mockReturnValue(false);

        const sheet = createMockSheet(defaultType);
        const ctx = {
            drawImage: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
        };

        tileCache.markAllDirty();
        renderer.render(ctx, sheet, 0, 0, 800, 600);

        expect(ctx.drawImage).toHaveBeenCalled();
        expect(sheet.getCellTypeInstance).toHaveBeenCalled();
    });

    it("should pass isDisabled for disabled cells", () => {
        const renderSpy = vi.fn();
        const customType = new BaseColumnType();
        vi.spyOn(customType, "hasCustomRenderer", "get").mockReturnValue(true);
        vi.spyOn(customType, "render").mockImplementation(renderSpy);

        const sheet = createMockSheet(customType);
        sheet.cellStore.get = vi.fn(() => ({ value: 42, disabled: true }));

        const ctx = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn() };
        tileCache.markAllDirty();
        renderer.render(ctx, sheet, 0, 0, 800, 600);

        const context = renderSpy.mock.calls[0][0];
        expect(context.isDisabled).toBe(true);
    });

    it("should pass isMerged and mergeInfo for merged cells", () => {
        const renderSpy = vi.fn();
        const customType = new BaseColumnType();
        vi.spyOn(customType, "hasCustomRenderer", "get").mockReturnValue(true);
        vi.spyOn(customType, "render").mockImplementation(renderSpy);

        const mergeInfo = { topRow: 0, topCol: 0, bottomRow: 1, bottomCol: 1 };
        const sheet = createMockSheet(customType);
        sheet.getMerge = vi.fn(() => mergeInfo);
        sheet.isMergedCell = vi.fn(() => false);

        const ctx = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn() };
        tileCache.markAllDirty();
        renderer.render(ctx, sheet, 0, 0, 800, 600);

        const context = renderSpy.mock.calls[0][0];
        expect(context.isMerged).toBe(true);
        expect(context.mergeInfo).toBe(mergeInfo);
    });

    it("should pass correct row/col coordinates (dual-track)", () => {
        const renderSpy = vi.fn();
        const customType = new BaseColumnType();
        vi.spyOn(customType, "hasCustomRenderer", "get").mockReturnValue(true);
        vi.spyOn(customType, "render").mockImplementation(renderSpy);

        const sheet = createMockSheet(customType);
        sheet.toRealRow = vi.fn((r) => r + 10);

        const ctx = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn() };
        tileCache.markAllDirty();
        renderer.render(ctx, sheet, 0, 0, 800, 600);

        const context = renderSpy.mock.calls[0][0];
        expect(context.realRow).toBe(context.row + 10);
        expect(context.realCol).toBe(context.col);
    });

    it("should use getCellTypeInstance from sheet for type resolution", () => {
        const customType = new BaseColumnType();
        vi.spyOn(customType, "hasCustomRenderer", "get").mockReturnValue(true);
        vi.spyOn(customType, "render").mockImplementation(vi.fn());

        const sheet = createMockSheet(customType);
        const getCellTypeInstanceSpy = sheet.getCellTypeInstance;

        const ctx = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn() };
        tileCache.markAllDirty();
        renderer.render(ctx, sheet, 0, 0, 800, 600);

        expect(getCellTypeInstanceSpy).toHaveBeenCalled();
    });

    it("should mark all tiles spanned by a wide cell as dirty", () => {
        // 模拟列 A 宽 120，列 B 宽 200；瓦片大小 256。
        // 单元格 B2 占据 x=120..320，跨越瓦片列 0 与 1。
        const rc = {
            pageContext: {
                getPageRowY: vi.fn(() => 0),
                getPageRowHeight: vi.fn(() => 24),
                getColX: vi.fn((c) => (c === 1 ? 120 : 0)),
                getColWidth: vi.fn((c) => (c === 1 ? 200 : 120)),
            },
        };

        // 预创建两个瓦片并清脏，模拟已缓存状态
        tileCache.getOrCreate(0, 0).dirty = false;
        tileCache.getOrCreate(0, 1).dirty = false;

        renderer.invalidateCell(0, 1, rc);

        expect(tileCache.get(0, 0)?.dirty).toBe(true);
        expect(tileCache.get(0, 1)?.dirty).toBe(true);
    });

    it("should mark only the single tile for a cell within one tile", () => {
        const rc = {
            pageContext: {
                getPageRowY: vi.fn(() => 0),
                getPageRowHeight: vi.fn(() => 24),
                getColX: vi.fn((c) => c * 80),
                getColWidth: vi.fn(() => 80),
            },
        };

        tileCache.getOrCreate(0, 0).dirty = false;
        tileCache.getOrCreate(0, 1).dirty = false;

        renderer.invalidateCell(0, 0, rc);

        expect(tileCache.get(0, 0)?.dirty).toBe(true);
        expect(tileCache.get(0, 1)?.dirty).toBe(false);
    });
});
