// tests/utils/canvasUtils.test.js
import { describe, it, expect } from "vitest";
import { calcCenteredTextY, extractFontSize, getAreaCenter } from "@/utils/canvasUtils";

describe('Canvas 工具函数', () => {
    describe('calcCenteredTextY()', () => {
        it('应该正确计算垂直居中的基线位置', () => {
            // 区域：y=0, height=48, 字体14px
            const result = calcCenteredTextY(0, 48, "14px Microsoft YaHei");

            // centerY = 0 + 24 = 24
            // baselineOffset = 14 * 0.35 = 4.9
            // expected = 28.9
            expect(result).toBeCloseTo(28.9, 1);
        });

        it('应该支持数字形式的字体大小', () => {
            const result = calcCenteredTextY(100, 30, 12);

            // centerY = 100 + 15 = 115
            // baselineOffset = 12 * 0.35 = 4.2
            // expected = 119.2
            expect(result).toBeCloseTo(119.2, 1);
        });
    });

    describe('extractFontSize()', () => {
        it('应该从 CSS font 字符串中提取字体大小', () => {
            expect(extractFontSize("bold 14px Arial")).toBe(14);
            expect(extractFontSize("12px Microsoft YaHei")).toBe(12);
            expect(extractFontSize("italic 16px/1.5 sans-serif")).toBe(16);
        });

        it('应该在无法解析时返回默认值', () => {
            expect(extractFontSize("")).toBe(12);  // CONFIG.DEFAULT_FONT_SIZE
            expect(extractFontSize(null)).toBe(12);
            expect(extractFontSize("invalid-font")).toBe(12);
        });
    });
});