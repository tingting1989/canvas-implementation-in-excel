import { describe, it, expect, vi, beforeEach } from "vitest";
import { HeaderPainter } from "../../../src/render/header/HeaderPainter.js";
import { BorderMask } from "../../../src/render/header/models/BorderMask.js";
import { Fragment } from "../../../src/render/header/models/Fragment.js";

function createMockCtx() {
    return {
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        font: "",
        textAlign: "",
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn(() => ({ width: 50 })),
    };
}

function createFragment(overrides = {}) {
    return new Fragment({
        visStartCol: 0,
        visEndCol: 0,
        x: 40,
        y: 0,
        w: 100,
        h: 28,
        borderMask: BorderMask.ALL,
        text: "A",
        font: "12px sans-serif",
        textAlign: "left",
        textX: 46,
        textY: 20,
        maxTextWidth: 88,
        ...overrides,
    });
}

describe("HeaderPainter", () => {
    let painter;
    let ctx;

    beforeEach(() => {
        painter = new HeaderPainter();
        ctx = createMockCtx();
    });

    describe("paintAll - 基本绘制", () => {
        it("应为有 backgroundColor 的 Fragment 调用 fillRect（背景）", () => {
            const fragments = [
                createFragment({ text: "A", mergedStyle: { backgroundColor: "#f0f0f0" } }),
                createFragment({ text: "B", x: 140, mergedStyle: { backgroundColor: "#f0f0f0" } }),
            ];

            painter.paintAll(ctx, fragments, {});

            expect(ctx.fillRect).toHaveBeenCalled();
        });

        it("应为有 text 的 Fragment 调用 fillText", () => {
            const fragments = [createFragment({ text: "Hello" })];

            painter.paintAll(ctx, fragments, {});

            expect(ctx.fillText).toHaveBeenCalledWith("Hello", expect.any(Number), expect.any(Number));
        });

        it("应为 text=null 的 Fragment 跳过 fillText", () => {
            const fragments = [createFragment({ text: null })];

            painter.paintAll(ctx, fragments, {});

            expect(ctx.fillText).not.toHaveBeenCalled();
        });

        it("应跳过 null Fragment", () => {
            const fragments = [null, createFragment({ text: "A" }), null];

            expect(() => painter.paintAll(ctx, fragments, {})).not.toThrow();
            expect(ctx.fillText).toHaveBeenCalledTimes(1);
        });
    });

    describe("paintAll - 边框绘制", () => {
        it("borderMask=ALL 时应绘制四条边", () => {
            const fragments = [createFragment({ borderMask: BorderMask.ALL })];

            painter.paintAll(ctx, fragments, {});

            const vLineCalls = ctx.moveTo.mock.calls.filter(([x, y]) => {
                return ctx.lineTo.mock.calls.some(([x2, y2]) => x === x2 && y !== y2);
            });

            expect(ctx.stroke).toHaveBeenCalled();
        });

        it("borderMask=NONE 时不应绘制任何边框", () => {
            const fragments = [createFragment({ borderMask: BorderMask.NONE })];

            painter.paintAll(ctx, fragments, {});

            const strokeCallsBeforeBorders = ctx.stroke.mock.calls.length;
            expect(strokeCallsBeforeBorders).toBe(0);
        });

        it("borderMask=MERGED_DEFAULT 时不应绘制 RIGHT 边框", () => {
            const frag = createFragment({ borderMask: BorderMask.MERGED_DEFAULT, x: 40, w: 200 });
            const fragments = [frag];

            painter.paintAll(ctx, fragments, {});

            const rightX = frag.x + frag.w;
            const moveToCalls = ctx.moveTo.mock.calls;
            const lineToCalls = ctx.lineTo.mock.calls;

            let hasRightBorder = false;
            for (let i = 0; i < moveToCalls.length; i++) {
                if (moveToCalls[i][0] === rightX && lineToCalls[i] && lineToCalls[i][0] === rightX) {
                    hasRightBorder = true;
                }
            }
            expect(hasRightBorder).toBe(false);
        });
    });

    describe("paintAll - 层底线", () => {
        it("layerBottomY 不为 null 时应绘制层底线", () => {
            const fragments = [createFragment({ x: 40, w: 100 })];
            const vt = { headerW: 40 };
            const rc = { colCount: 10 };

            painter.paintAll(ctx, fragments, { layerBottomY: 28, vt, rc });

            const hLineCalls = ctx.moveTo.mock.calls.filter(([, y]) => y === 28);
            expect(hLineCalls.length).toBeGreaterThan(0);
        });

        it("layerBottomY 为 null 时不应绘制层底线", () => {
            const fragments = [createFragment()];

            painter.paintAll(ctx, fragments, {});

            const extras = {};
            expect(extras.layerBottomY).toBeUndefined();
        });

        it("空 Fragment 列表不应绘制层底线", () => {
            const vt = { headerW: 40 };
            const rc = { colCount: 10 };

            painter.paintAll(ctx, [], { layerBottomY: 28, vt, rc });

            expect(ctx.stroke).not.toHaveBeenCalled();
        });
    });

    describe("paintAll - 自定义渲染器", () => {
        it("应调用 columnHeaderRenderers", () => {
            const renderer = vi.fn();
            const fragments = [createFragment({ visStartCol: 0, x: 40, y: 0, w: 100, h: 28 })];

            painter.paintAll(ctx, fragments, { columnHeaderRenderers: [renderer] });

            expect(renderer).toHaveBeenCalledWith(ctx, 0, 40, 0, 100, 28);
        });

        it("渲染器抛错时应捕获而不中断", () => {
            const badRenderer = vi.fn(() => { throw new Error("boom"); });
            const goodRenderer = vi.fn();
            const fragments = [createFragment({ visStartCol: 0, x: 40, y: 0, w: 100, h: 28 })];

            expect(() => painter.paintAll(ctx, fragments, { columnHeaderRenderers: [badRenderer, goodRenderer] })).not.toThrow();
            expect(goodRenderer).toHaveBeenCalled();
        });
    });

    describe("paintAll - 背景色", () => {
        it("isHighlighted=true 时应设置高亮背景色", () => {
            const fragments = [createFragment({ isHighlighted: true, mergedStyle: {} })];

            painter.paintAll(ctx, fragments, {});

            const fillRectCalls = ctx.fillRect.mock.calls;
            expect(fillRectCalls.length).toBeGreaterThan(0);
        });

        it("isSource=true 时应设置拖拽源背景色", () => {
            const fragments = [createFragment({ isSource: true, mergedStyle: {} })];

            painter.paintAll(ctx, fragments, {});

            const fillRectCalls = ctx.fillRect.mock.calls;
            expect(fillRectCalls.length).toBeGreaterThan(0);
        });

        it("有 backgroundColor 样式时应填充自定义背景", () => {
            const fragments = [createFragment({ mergedStyle: { backgroundColor: "#4472C4" } })];

            painter.paintAll(ctx, fragments, {});

            expect(ctx.fillRect).toHaveBeenCalled();
        });
    });

    describe("paintAll - 文字截断", () => {
        it("文字宽度超过 maxTextWidth 时应截断并加省略号", () => {
            ctx.measureText.mockImplementation((t) => ({ width: t.length * 10 }));
            const fragments = [createFragment({ text: "VeryLongText", maxTextWidth: 50 })];

            painter.paintAll(ctx, fragments, {});

            const fillTextArg = ctx.fillText.mock.calls[0][0];
            expect(fillTextArg.endsWith("...")).toBe(true);
        });

        it("文字宽度未超过 maxTextWidth 时不应截断", () => {
            ctx.measureText.mockImplementation(() => ({ width: 30 }));
            const fragments = [createFragment({ text: "Short", maxTextWidth: 100 })];

            painter.paintAll(ctx, fragments, {});

            expect(ctx.fillText).toHaveBeenCalledWith("Short", expect.any(Number), expect.any(Number));
        });
    });
});