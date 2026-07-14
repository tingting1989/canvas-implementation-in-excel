import { NullValueHandler, NULL_VALUE_TYPES } from "../../../src/plugins/filter/NullValueTypes.js";

describe("NullValueHandler", () => {
    
    describe("isNullValue()", () => {
        
        it("应该识别 null 为空值", () => {
            expect(NullValueHandler.isNullValue(null)).toBe(true);
        });

        it("应该识别 undefined 为空值", () => {
            expect(NullValueHandler.isNullValue(undefined)).toBe(true);
        });

        it("应该识别空字符串为空值", () => {
            expect(NullValueHandler.isNullValue("")).toBe(true);
        });

        it("应该识别纯空格字符串为空值", () => {
            expect(NullValueHandler.isNullValue("   ")).toBe(true);
            expect(NullValueHandler.isNullValue("\t\n")).toBe(true);
        });

        it("不应该识别正常值为空值", () => {
            expect(NullValueHandler.isNullValue("Alice")).toBe(false);
            expect(NullValueHandler.isNullValue(0)).toBe(false);
            expect(NullValueHandler.isNullValue(false)).toBe(false);
            expect(NullValueHandler.isNullValue([])).toBe(false);
        });
    });

    describe("getNullType()", () => {
        
        it("应该返回 NULL 类型", () => {
            expect(NullValueHandler.getNullType(null)).toBe(NULL_VALUE_TYPES.NULL);
        });

        it("应该返回 UNDEFINED 类型", () => {
            expect(NullValueHandler.getNullType(undefined)).toBe(NULL_VALUE_TYPES.UNDEFINED);
        });

        it("应该返回 EMPTY_STRING 类型", () => {
            expect(NullValueHandler.getNullType("")).toBe(NULL_VALUE_TYPES.EMPTY_STRING);
        });

        it("应该返回 BLANK 类型", () => {
            expect(NullValueHandler.getNullType("   ")).toBe(NULL_VALUE_TYPES.BLANK);
        });

        it("非空值应返回 null", () => {
            expect(NullValueHandler.getNullType("test")).toBe(null);
        });
    });

    describe("normalizeToKey()", () => {
        
        it("应该将所有空值转换为 NULL_KEY", () => {
            expect(NullValueHandler.normalizeToKey(null)).toBe(NullValueHandler.NULL_KEY);
            expect(NullValueHandler.normalizeToKey(undefined)).toBe(NullValueHandler.NULL_KEY);
            expect(NullValueHandler.normalizeToKey("")).toBe(NullValueHandler.NULL_KEY);
            expect(NullValueHandler.normalizeToKey("  ")).toBe(NullValueHandler.NULL_KEY);
        });

        it("应该保留正常值的字符串形式", () => {
            expect(NullValueHandler.normalizeToKey("Alice")).toBe("Alice");
            expect(NullValueHandler.normalizeToKey(123)).toBe("123");
            expect(NullValueHandler.normalizeToKey(true)).toBe("true");
        });
    });

    describe("formatForDisplay()", () => {
        
        it("应该将空值格式化为 '(空白)'", () => {
            expect(NullValueHandler.formatForDisplay(null)).toBe("(空白)");
            expect(NullValueHandler.formatForDisplay("")).toBe("(空白)");
            expect(NullValueHandler.formatForDisplay(undefined)).toBe("(空白)");
        });

        it("应该保留正常值的显示", () => {
            expect(NullValueHandler.formatForDisplay("Alice")).toBe("Alice");
            expect(NullValueHandler.formatForDisplay(123)).toBe("123");
        });
    });

    describe("isBlankOnly()", () => {
        
        it("应该只匹配空字符串或空白字符串", () => {
            expect(NullValueHandler.isBlankOnly("")).toBe(true);
            expect(NullValueHandler.isBlankOnly("  ")).toBe(true);
            expect(NullValueHandler.isBlankOnly(null)).toBe(false);
            expect(NullValueHandler.isBlankOnly(undefined)).toBe(false);
            expect(NullValueHandler.isBlankOnly("test")).toBe(false);
        });
    });
});
