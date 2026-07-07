import { describe, it, expect, vi } from "vitest";
import { HeaderLayoutBuilder } from "../../../src/render/header/HeaderLayoutBuilder.js";
import { BorderMask } from "../../../src/render/header/models/BorderMask.js";
import { FrozenBoundaryInfo } from "../../../src/render/header/models/FrozenBoundaryInfo.js";

function createMockSheet(nestedHeaders = []) {
    return {
        rowColManager: {
            getColWidth: vi.fn((c) => 100),
            colAt: vi.fn((x) => Math.floor(x / 100)),
            colCount: 10,
        },
        cellPadding: 6,
        getDefaultStyle: vi.fn(() => ({})),
        getColHeader: vi.fn((c) => String.fromCharCode(65 + c)),
        getColHeaderStyle: vi.fn(() => null),
        getNestedHeaderRowCount: vi.fn(() => nestedHeaders.length),
        nestedHeaders,
    };
}

function createMockVt(opts = {}) {
    return {
        headerW: 40,
        headerH: 28,
        frozenColsW: opts.frozenColsW ?? 0,
        fixedCols: opts.fixedCols ?? 0,
        scrollX: opts.scrollX ?? 0,
        colToViewX: vi.fn((c) => 40 + c * 100),
        colRightToViewX: vi.fn((c) => 40 + (c + 1) * 100),
        ...opts,
    };
}

describe("HeaderLayoutBuilder", () => {
    let builder;

    beforeEach(() => {
        builder = new HeaderLayoutBuilder();
    });

    describe("buildSimpleLayerFragments", () => {
        it("应为每个可见列生成一个 Fragment", () => {
            const sheet = createMockSheet();
            const vt = createMockVt();

            const fragments = builder.buildSimpleLayerFragments({
                sc: 0, ec: 3, layerY: 0, rowH: 28, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments).toHaveLength(3);
            expect(fragments[0].visStartCol).toBe(0);
            expect(fragments[1].visStartCol).toBe(1);
            expect(fragments[2].visStartCol).toBe(2);
        });

        it("每个 Fragment 的 borderMask 应为 ALL", () => {
            const sheet = createMockSheet();
            const vt = createMockVt();

            const fragments = builder.buildSimpleLayerFragments({
                sc: 0, ec: 2, layerY: 0, rowH: 28, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            for (const frag of fragments) {
                expect(frag.borderMask).toBe(BorderMask.ALL);
            }
        });

        it("每个 Fragment 的 sourceCell 应为 null（非嵌套）", () => {
            const sheet = createMockSheet();
            const vt = createMockVt();

            const fragments = builder.buildSimpleLayerFragments({
                sc: 0, ec: 2, layerY: 0, rowH: 28, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            for (const frag of fragments) {
                expect(frag.sourceCell).toBeNull();
            }
        });

        it("应跳过宽度为 0 的隐藏列", () => {
            const sheet = createMockSheet();
            sheet.rowColManager.getColWidth.mockImplementation((c) => c === 1 ? 0 : 100);
            const vt = createMockVt();

            const fragments = builder.buildSimpleLayerFragments({
                sc: 0, ec: 3, layerY: 0, rowH: 28, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments).toHaveLength(2);
            expect(fragments[0].visStartCol).toBe(0);
            expect(fragments[1].visStartCol).toBe(2);
        });

        it("应正确设置 text 为列头标签", () => {
            const sheet = createMockSheet();
            const vt = createMockVt();

            const fragments = builder.buildSimpleLayerFragments({
                sc: 0, ec: 3, layerY: 0, rowH: 28, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments[0].text).toBe("A");
            expect(fragments[1].text).toBe("B");
            expect(fragments[2].text).toBe("C");
        });
    });

    describe("buildLayerFragments - 基本嵌套", () => {
        it("应为 colspan=1 的单元格生成单个 Fragment", () => {
            const sheet = createMockSheet([["Name", "Age"]]);
            const vt = createMockVt();
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });

            const fragments = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 0, ec: 2, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments).toHaveLength(2);
            expect(fragments[0].text).toBe("Name");
            expect(fragments[1].text).toBe("Age");
        });

        it.skip("colspan=2 的合并单元格应使用 MERGED_DEFAULT (待修复)", () => {
            const sheet = createMockSheet([[{ label: "基本信息", colspan: 2 }]]);
            const vt = createMockVt();
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });

            const fragments = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 0, ec: 2, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments).toHaveLength(1);
            expect(fragments[0].borderMask).toBe(BorderMask.MERGED_DEFAULT);
            expect(fragments[0].borderMask & BorderMask.RIGHT).toBeFalsy();
            expect(fragments[0].text).toBe("基本信息");
        });

        it.skip("混合 colspan 场景 (待修复)", () => {
            const sheet = createMockSheet([
                [{ label: "基本信息", colspan: 2 }, { label: "详情", colspan: 2 }],
            ]);
            const vt = createMockVt();
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });

            const fragments = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 0, ec: 4, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments).toHaveLength(2);
            expect(fragments[0].text).toBe("基本信息");
            expect(fragments[0].borderMask).toBe(BorderMask.MERGED_DEFAULT);
            expect(fragments[1].text).toBe("详情");
            expect(fragments[1].borderMask).toBe(BorderMask.MERGED_DEFAULT);
        });
    });

    describe("buildLayerFragments - 冻结边界拆分", () => {
        it("colspan=2 跨 fixedCols=1 → 冻结区调用时只生成冻结侧 Fragment", () => {
            const sheet = createMockSheet([[{ label: "基本信息", colspan: 2 }]]);
            const vt = createMockVt();
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 1, fixedRows: 0 });

            const fragments = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 0, ec: 1, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments).toHaveLength(1);
            const frag = fragments[0];
            expect(frag.partialType).toBe("frozen");
            expect(frag.borderMask).toBe(BorderMask.FROZEN_SIDE);
            expect(frag.text).toBe("基本信息");
            expect(frag.visStartCol).toBe(0);
            expect(frag.visEndCol).toBe(0);
        });

        it("colspan=2 跨 fixedCols=1 → 滚动区调用时只生成滚动侧 Fragment", () => {
            const sheet = createMockSheet([[{ label: "基本信息", colspan: 2 }]]);
            const vt = createMockVt();
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 1, fixedRows: 0 });

            const fragments = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 1, ec: 4, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments).toHaveLength(1);
            const frag = fragments[0];
            expect(frag.partialType).toBe("scroll");
            expect(frag.borderMask).toBe(BorderMask.SCROLL_SIDE);
            expect(frag.text).toBeNull();
            expect(frag.visStartCol).toBe(1);
            expect(frag.visEndCol).toBe(1);
        });

        it("冻结侧 Fragment 的 maxTextWidth 只依赖冻结区宽度", () => {
            const sheet = createMockSheet([[{ label: "基本信息", colspan: 2 }]]);
            sheet.rowColManager.getColWidth.mockImplementation((c) => c === 0 ? 80 : 120);
            const vt = createMockVt();
            vt.colToViewX.mockImplementation((c) => 40 + (c === 0 ? 0 : 80));
            vt.colRightToViewX.mockImplementation((c) => c === 0 ? 120 : 240);
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 1, fixedRows: 0 });

            const fragments = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 0, ec: 1, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments).toHaveLength(1);
            expect(fragments[0].maxTextWidth).toBe(80 - 6 * 2);
        });

        it("colspan=3 跨 fixedCols=1 → 冻结侧覆盖列0，滚动侧覆盖列1-2", () => {
            const sheet = createMockSheet([[{ label: "大合并", colspan: 3 }]]);
            const vt = createMockVt();
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 1, fixedRows: 0 });

            const frozenFrags = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 0, ec: 1, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            const scrollFrags = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 1, ec: 4, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(frozenFrags).toHaveLength(1);
            expect(frozenFrags[0].visStartCol).toBe(0);
            expect(frozenFrags[0].visEndCol).toBe(0);
            expect(frozenFrags[0].text).toBe("大合并");

            expect(scrollFrags).toHaveLength(1);
            expect(scrollFrags[0].visStartCol).toBe(1);
            expect(scrollFrags[0].visEndCol).toBe(2);
            expect(scrollFrags[0].text).toBeNull();
        });

        it("不跨冻结边界的单元格在冻结区调用时正常生成", () => {
            const sheet = createMockSheet([["A", "B", "C"]]);
            const vt = createMockVt();
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 1, fixedRows: 0 });

            const fragments = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 0, ec: 1, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments).toHaveLength(1);
            expect(fragments[0].text).toBe("A");
            expect(fragments[0].partialType).toBe("full");
            expect(fragments[0].borderMask).toBe(BorderMask.ALL);
        });
    });

    describe("buildLayerFragments - 可见性过滤", () => {
        it("应过滤掉不在视口范围内的单元格", () => {
            const sheet = createMockSheet([["A", "B", "C", "D"]]);
            const vt = createMockVt();
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });

            const fragments = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 1, ec: 3, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments).toHaveLength(2);
            expect(fragments[0].text).toBe("B");
            expect(fragments[1].text).toBe("C");
        });

        it("应跳过宽度为 0 的隐藏列", () => {
            const sheet = createMockSheet([["A", "B", "C"]]);
            sheet.rowColManager.getColWidth.mockImplementation((c) => c === 1 ? 0 : 100);
            const vt = createMockVt();
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });

            const fragments = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 0, ec: 3, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments).toHaveLength(2);
            expect(fragments[0].text).toBe("A");
            expect(fragments[1].text).toBe("C");
        });
    });

    describe("buildLayerFragments - 排序", () => {
        it("Fragment 应按 x 坐标升序排列", () => {
            const sheet = createMockSheet([["C", "A", "B"]]);
            const vt = createMockVt();
            vt.colToViewX.mockImplementation((c) => 40 + c * 100);
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });

            const fragments = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 0, ec: 3, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            for (let i = 1; i < fragments.length; i++) {
                expect(fragments[i].x).toBeGreaterThanOrEqual(fragments[i - 1].x);
            }
        });
    });

    describe("buildLayerFragments - 字符串简写", () => {
        it("应支持字符串简写（无 colspan/style）", () => {
            const sheet = createMockSheet([["Name", "Age"]]);
            const vt = createMockVt();
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });

            const fragments = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 0, ec: 2, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments).toHaveLength(2);
            expect(fragments[0].text).toBe("Name");
            expect(fragments[0].borderMask).toBe(BorderMask.ALL);
            expect(fragments[1].text).toBe("Age");
        });
    });

    describe("buildLayerFragments - 自定义样式", () => {
        it("应将自定义样式合并到 mergedStyle", () => {
            const sheet = createMockSheet([
                [{ label: "基本信息", colspan: 2, style: { backgroundColor: "#4472C4", color: "#FFFFFF", fontWeight: "bold" } }],
            ]);
            const vt = createMockVt();
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });

            const fragments = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 0, ec: 2, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments[0].mergedStyle.backgroundColor).toBe("#4472C4");
            expect(fragments[0].mergedStyle.color).toBe("#FFFFFF");
            expect(fragments[0].mergedStyle.fontWeight).toBe("bold");
        });

        it("应将自定义 fontSize 和 fontWeight 合并到 font", () => {
            const sheet = createMockSheet([
                [{ label: "X", style: { fontWeight: "bold", fontSize: "14px" } }],
            ]);
            const vt = createMockVt();
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });

            const fragments = builder.buildLayerFragments({
                layerData: sheet.nestedHeaders[0],
                layerIndex: 0, layerY: 0, rowH: 28,
                sc: 0, ec: 1, frozenBoundary, vt, sheet,
                defaultStyle: {}, headerFont: "12px sans-serif",
            });

            expect(fragments[0].font).toContain("bold");
            expect(fragments[0].font).toContain("14px");
        });
    });
});