import { describe, it, expect } from "vitest";
import { _flatten, _toNum, _isBlank } from "@/formula/functions/utils/helpers";

describe("Utils - _flatten", () => {
    it("should flatten simple array", () => {
        expect(_flatten([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it("should flatten nested array one level", () => {
        expect(_flatten([1, [2, 3], 4])).toEqual([1, 2, 3, 4]);
    });

    it("should flatten deeply nested arrays", () => {
        expect(_flatten([1, [2, [3, [4]]], 5])).toEqual([1, 2, 3, 4, 5]);
    });

    it("should preserve order", () => {
        expect(_flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
    });

    it("should handle empty array", () => {
        expect(_flatten([])).toEqual([]);
    });

    it("should handle empty nested arrays", () => {
        expect(_flatten([[], [[]], []])).toEqual([]);
    });

    it("should handle mixed types", () => {
        const input = [1, ["a", true], null, undefined, [{}]];
        const result = _flatten(input);
        expect(result).toEqual([1, "a", true, null, undefined, {}]);
    });

    it("should handle large depth without stack overflow", () => {
        let arr = "leaf";
        for (let i = 0; i < 10000; i++) {
            arr = [arr];
        }
        const result = _flatten(arr);
        expect(result).toEqual(["leaf"]);
    });
});

describe("Utils - _toNum", () => {
    it("should return number as-is", () => {
        expect(_toNum(42)).toBe(42);
    });

    it("should return float as-is", () => {
        expect(_toNum(3.14)).toBeCloseTo(3.14);
    });

    it("should return -0 as-is", () => {
        expect(_toNum(-0)).toBe(-0);
    });

    it("should return Infinity as-is", () => {
        expect(_toNum(Infinity)).toBe(Infinity);
    });

    it("should return -Infinity as-is", () => {
        expect(_toNum(-Infinity)).toBe(-Infinity);
    });

    it("should parse numeric string", () => {
        expect(_toNum("42")).toBe(42);
    });

    it("should parse decimal string", () => {
        expect(_toNum("3.14")).toBeCloseTo(3.14);
    });

    it("should parse negative numeric string", () => {
        expect(_toNum("-100")).toBe(-100);
    });

    it("should return NaN for non-numeric string", () => {
        expect(isNaN(_toNum("abc"))).toBe(true);
    });

    it("should return NaN for empty string", () => {
        expect(isNaN(_toNum(""))).toBe(true);
    });

    it("should return NaN for whitespace-only string", () => {
        expect(isNaN(_toNum("   "))).toBe(true);
    });

    it("should return NaN for null", () => {
        expect(isNaN(_toNum(null))).toBe(true);
    });

    it("should return NaN for undefined", () => {
        expect(isNaN(_toNum(undefined))).toBe(true);
    });

    it("should convert boolean true to 1", () => {
        expect(_toNum(true)).toBe(1);
    });

    it("should convert boolean false to 0", () => {
        expect(_toNum(false)).toBe(0);
    });

    it("should return NaN for object", () => {
        expect(isNaN(_toNum({}))).toBe(true);
    });

    it("should return NaN for array", () => {
        expect(isNaN(_toNum([]))).toBe(true);
    });
});

describe("Utils - _isBlank", () => {
    it("should return true for empty string", () => {
        expect(_isBlank("")).toBe(true);
    });

    it("should return true for null", () => {
        expect(_isBlank(null)).toBe(true);
    });

    it("should return true for undefined", () => {
        expect(_isBlank(undefined)).toBe(true);
    });

    it("should return false for 0", () => {
        expect(_isBlank(0)).toBe(false);
    });

    it("should return false for false", () => {
        expect(_isBlank(false)).toBe(false);
    });

    it("should return false for space-only string", () => {
        expect(_isBlank(" ")).toBe(false);
    });

    it("should return false for tab character", () => {
        expect(_isBlank("\t")).toBe(false);
    });

    it("should return false for newline", () => {
        expect(_isBlank("\n")).toBe(false);
    });

    it("should return false for non-empty string", () => {
        expect(_isBlank("hello")).toBe(false);
    });

    it("should return false for number", () => {
        expect(_isBlank(42)).toBe(false);
    });

    it("should return false for object", () => {
        expect(_isBlank({})).toBe(false);
    });

    it("should return false for array", () => {
        expect(_isBlank([])).toBe(false);
    });
});