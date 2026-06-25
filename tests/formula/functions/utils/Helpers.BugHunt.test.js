import { describe, it, expect } from "vitest";
import { _flatten, _toNum, _isBlank } from "@/formula/functions/utils/helpers";

describe("Utils BugHunt - _flatten", () => {
    it("should handle 10000-level deep nesting without stack overflow", () => {
        let arr = "leaf";
        for (let i = 0; i < 10000; i++) {
            arr = [arr];
        }
        expect(_flatten(arr)).toEqual(["leaf"]);
    });

    it("should handle mixed types including functions and symbols", () => {
        const result = _flatten([1, "a", null, undefined, true, false, {}, [], function() {}]);
        expect(result).toEqual([1, "a", null, undefined, true, false, {}, [], expect.any(Function)]);
    });

    it("should preserve object references (not clone)", () => {
        const obj = { key: "val" };
        const result = _flatten([obj]);
        expect(result[0]).toBe(obj);
    });

    it("should handle sparse arrays", () => {
        const arr = [];
        arr[0] = 1;
        arr[5] = 6;
        const result = _flatten([arr]);
        expect(result).toEqual([1, undefined, undefined, undefined, undefined, 6]);
    });
});

describe("Utils BugHunt - _toNum", () => {
    it("should return NaN for empty string", () => {
        expect(isNaN(_toNum(""))).toBe(true);
    });

    it("should return NaN for whitespace-only string", () => {
        expect(isNaN(_toNum("   \t\n"))).toBe(true);
    });

    it("should return NaN for boolean", () => {
        expect(isNaN(_toNum(true))).toBe(true);
        expect(isNaN(_toNum(false))).toBe(true);
    });

    it("should return NaN for array", () => {
        expect(isNaN(_toNum([]))).toBe(true);
        expect(isNaN(_toNum([1]))).toBe(true);
    });

    it("should return NaN for object", () => {
        expect(isNaN(_toNum({}))).toBe(true);
    });

    it("should parse negative zero string", () => {
        expect(_toNum("-0")).toBe(-0);
    });

    it("should parse scientific notation", () => {
        expect(_toNum("1e5")).toBe(100000);
        expect(_toNum("2.5e-3")).toBeCloseTo(0.0025);
    });

    it("should parse hex strings as NaN (not numbers)", () => {
        expect(isNaN(_toNum("0xFF"))).toBe(true);
    });

    it("should return Infinity for 'Infinity' string", () => {
        expect(_toNum("Infinity")).toBe(Infinity);
    });

    it("should return -Infinity for '-Infinity' string", () => {
        expect(_toNum("-Infinity")).toBe(-Infinity);
    });
});

describe("Utils BugHunt - _isBlank", () => {
    it("should be false for all falsy-but-not-blank values", () => {
        expect(_isBlank(0)).toBe(false);
        expect(_isBlank(false)).toBe(false);
        expect(_isBlank(NaN)).toBe(false);
    });

    it("should be true for blank-like values", () => {
        expect(_isBlank(null)).toBe(true);
        expect(_isBlank(undefined)).toBe(true);
        expect(_isBlank("")).toBe(true);
    });

    it("should be false for whitespace-only strings", () => {
        expect(_isBlank(" ")).toBe(false);
        expect(_isBlank("\t")).toBe(false);
        expect(_isBlank("\n")).toBe(false);
        expect(_isBlank("\r")).toBe(false);
    });

    it("should be false for non-empty values of any type", () => {
        expect(_isBlank(42)).toBe(false);
        expect(_isBlank(-0)).toBe(false);
        expect(_isBlank("hello")).toBe(false);
        expect(_isBlank([])).toBe(false);
        expect(_isBlank({})).toBe(false);
    });
});