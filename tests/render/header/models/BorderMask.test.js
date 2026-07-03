import { describe, it, expect } from "vitest";
import { BorderMask } from "../../../../src/render/header/models/BorderMask.js";

describe("BorderMask", () => {
    describe("基础常量", () => {
        it("NONE 应为 0", () => {
            expect(BorderMask.NONE).toBe(0);
        });

        it("ALL 应包含四边", () => {
            expect(BorderMask.ALL & BorderMask.TOP).toBeTruthy();
            expect(BorderMask.ALL & BorderMask.RIGHT).toBeTruthy();
            expect(BorderMask.ALL & BorderMask.BOTTOM).toBeTruthy();
            expect(BorderMask.ALL & BorderMask.LEFT).toBeTruthy();
        });

        it("ALL 应等于 TOP | RIGHT | BOTTOM | LEFT", () => {
            expect(BorderMask.ALL).toBe(BorderMask.TOP | BorderMask.RIGHT | BorderMask.BOTTOM | BorderMask.LEFT);
        });

        it("各方向位不重叠", () => {
            const directions = [BorderMask.TOP, BorderMask.RIGHT, BorderMask.BOTTOM, BorderMask.LEFT];
            for (let i = 0; i < directions.length; i++) {
                for (let j = i + 1; j < directions.length; j++) {
                    expect(directions[i] & directions[j]).toBe(0);
                }
            }
        });
    });

    describe("MERGED_DEFAULT", () => {
        it("应包含 TOP, BOTTOM, LEFT", () => {
            expect(BorderMask.MERGED_DEFAULT & BorderMask.TOP).toBeTruthy();
            expect(BorderMask.MERGED_DEFAULT & BorderMask.BOTTOM).toBeTruthy();
            expect(BorderMask.MERGED_DEFAULT & BorderMask.LEFT).toBeTruthy();
        });

        it("不应包含 RIGHT", () => {
            expect(BorderMask.MERGED_DEFAULT & BorderMask.RIGHT).toBeFalsy();
        });

        it("应等于 TOP | BOTTOM | LEFT", () => {
            expect(BorderMask.MERGED_DEFAULT).toBe(BorderMask.TOP | BorderMask.BOTTOM | BorderMask.LEFT);
        });
    });

    describe("FROZEN_SIDE", () => {
        it("应包含 TOP, BOTTOM, LEFT", () => {
            expect(BorderMask.FROZEN_SIDE & BorderMask.TOP).toBeTruthy();
            expect(BorderMask.FROZEN_SIDE & BorderMask.BOTTOM).toBeTruthy();
            expect(BorderMask.FROZEN_SIDE & BorderMask.LEFT).toBeTruthy();
        });

        it("不应包含 RIGHT", () => {
            expect(BorderMask.FROZEN_SIDE & BorderMask.RIGHT).toBeFalsy();
        });

        it("应等于 TOP | BOTTOM | LEFT", () => {
            expect(BorderMask.FROZEN_SIDE).toBe(BorderMask.TOP | BorderMask.BOTTOM | BorderMask.LEFT);
        });
    });

    describe("SCROLL_SIDE", () => {
        it("应包含 TOP, BOTTOM, RIGHT", () => {
            expect(BorderMask.SCROLL_SIDE & BorderMask.TOP).toBeTruthy();
            expect(BorderMask.SCROLL_SIDE & BorderMask.BOTTOM).toBeTruthy();
            expect(BorderMask.SCROLL_SIDE & BorderMask.RIGHT).toBeTruthy();
        });

        it("不应包含 LEFT", () => {
            expect(BorderMask.SCROLL_SIDE & BorderMask.LEFT).toBeFalsy();
        });

        it("应等于 TOP | BOTTOM | RIGHT", () => {
            expect(BorderMask.SCROLL_SIDE).toBe(BorderMask.TOP | BorderMask.BOTTOM | BorderMask.RIGHT);
        });
    });

    describe("位运算组合", () => {
        it("FROZEN_SIDE | SCROLL_SIDE 应等于 ALL", () => {
            expect(BorderMask.FROZEN_SIDE | BorderMask.SCROLL_SIDE).toBe(BorderMask.ALL);
        });

        it("FROZEN_SIDE & SCROLL_SIDE 应包含 TOP 和 BOTTOM", () => {
            const shared = BorderMask.FROZEN_SIDE & BorderMask.SCROLL_SIDE;
            expect(shared & BorderMask.TOP).toBeTruthy();
            expect(shared & BorderMask.BOTTOM).toBeTruthy();
        });

        it("MERGED_DEFAULT | RIGHT 应等于 ALL", () => {
            expect(BorderMask.MERGED_DEFAULT | BorderMask.RIGHT).toBe(BorderMask.ALL);
        });
    });

    describe("不可变性", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(() => { BorderMask.NONE = 1; }).toThrow();
            expect(() => { BorderMask.NEW = 42; }).toThrow();
        });
    });
});