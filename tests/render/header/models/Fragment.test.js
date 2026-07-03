import { describe, it, expect } from "vitest";
import { Fragment } from "../../../../src/render/header/models/Fragment.js";
import { BorderMask } from "../../../../src/render/header/models/BorderMask.js";

describe("Fragment", () => {
    describe("构造与默认值", () => {
        it("应正确存储所有显式属性", () => {
            const frag = new Fragment({
                sourceCell: { label: "X" },
                visStartCol: 1,
                visEndCol: 3,
                x: 100,
                y: 0,
                w: 300,
                h: 28,
                borderMask: BorderMask.ALL,
                mergedStyle: { color: "#fff" },
                text: "Hello",
                font: "bold 14px Arial",
                textAlign: "center",
                textX: 250,
                textY: 20,
                maxTextWidth: 280,
                isPartial: false,
                partialType: "full",
            });

            expect(frag.sourceCell).toEqual({ label: "X" });
            expect(frag.visStartCol).toBe(1);
            expect(frag.visEndCol).toBe(3);
            expect(frag.x).toBe(100);
            expect(frag.y).toBe(0);
            expect(frag.w).toBe(300);
            expect(frag.h).toBe(28);
            expect(frag.borderMask).toBe(BorderMask.ALL);
            expect(frag.mergedStyle).toEqual({ color: "#fff" });
            expect(frag.text).toBe("Hello");
            expect(frag.font).toBe("bold 14px Arial");
            expect(frag.textAlign).toBe("center");
            expect(frag.textX).toBe(250);
            expect(frag.textY).toBe(20);
            expect(frag.maxTextWidth).toBe(280);
            expect(frag.isPartial).toBe(false);
            expect(frag.partialType).toBe("full");
        });

        it("sourceCell 默认为 null", () => {
            const frag = new Fragment({ visStartCol: 0, visEndCol: 0 });
            expect(frag.sourceCell).toBeNull();
        });

        it("borderMask 默认为 ALL", () => {
            const frag = new Fragment({ visStartCol: 0, visEndCol: 0 });
            expect(frag.borderMask).toBe(BorderMask.ALL);
        });

        it("text 默认为空字符串", () => {
            const frag = new Fragment({ visStartCol: 0, visEndCol: 0 });
            expect(frag.text).toBe("");
        });

        it("text=null 时 #paintText 应跳过绘制", () => {
            const frag = new Fragment({ visStartCol: 0, visEndCol: 0, text: null });
            expect(frag.text).toBeNull();
        });

        it("font 默认为 12px Segoe UI", () => {
            const frag = new Fragment({ visStartCol: 0, visEndCol: 0 });
            expect(frag.font).toBe("12px Segoe UI");
        });

        it("textAlign 默认为 left", () => {
            const frag = new Fragment({ visStartCol: 0, visEndCol: 0 });
            expect(frag.textAlign).toBe("left");
        });

        it("isPartial 默认为 false", () => {
            const frag = new Fragment({ visStartCol: 0, visEndCol: 0 });
            expect(frag.isPartial).toBe(false);
        });

        it("partialType 默认为 full", () => {
            const frag = new Fragment({ visStartCol: 0, visEndCol: 0 });
            expect(frag.partialType).toBe("full");
        });

        it("isSource 默认为 false", () => {
            const frag = new Fragment({ visStartCol: 0, visEndCol: 0 });
            expect(frag.isSource).toBe(false);
        });

        it("isHighlighted 默认为 false", () => {
            const frag = new Fragment({ visStartCol: 0, visEndCol: 0 });
            expect(frag.isHighlighted).toBe(false);
        });
    });

    describe("冻结侧 Fragment", () => {
        it("text 应为 cell.label", () => {
            const frag = new Fragment({
                visStartCol: 0, visEndCol: 0,
                text: "基本信息",
                partialType: "frozen",
                isPartial: true,
            });
            expect(frag.text).toBe("基本信息");
            expect(frag.isPartial).toBe(true);
            expect(frag.partialType).toBe("frozen");
        });
    });

    describe("滚动侧 Fragment", () => {
        it("text 应为 null（不绘制文字）", () => {
            const frag = new Fragment({
                visStartCol: 1, visEndCol: 1,
                text: null,
                partialType: "scroll",
                isPartial: true,
            });
            expect(frag.text).toBeNull();
            expect(frag.isPartial).toBe(true);
            expect(frag.partialType).toBe("scroll");
        });
    });
});