import { describe, it, expect, vi } from "vitest";
import { mathFunctions } from "@/formula/functions/math";

describe("Math Functions BugHunt - SUM", () => {
    const SUM = mathFunctions.SUM;

    it("should handle very large array (10000 elements)", () => {
        const arr = Array(10000).fill(1);
        expect(SUM(arr)).toBe(10000);
    });

    it("should handle mixed types including objects and functions", () => {
        const result = SUM([1, {}, () => 2, null, undefined, true, false]);
        expect(result).toBe(2);
    });

    it("should sum nested arrays with varying depths", () => {
        const result = SUM([1, [2, [3, 4]], 5, [[6]]]);
        expect(result).toBe(21);
    });

    it("should return #VALUE! for empty args", () => {
        expect(SUM([])).toBe("#VALUE!");
    });

    it("should handle Infinity in sum", () => {
        expect(SUM([1, Infinity])).toBe(Infinity);
    });

    it("should handle -Infinity in sum", () => {
        expect(SUM([1, -Infinity])).toBe(-Infinity);
    });
});

describe("Math Functions BugHunt - AVERAGE", () => {
    const AVERAGE = mathFunctions.AVERAGE;

    it("should return NaN for single non-numeric value", () => {
        expect(isNaN(AVERAGE(["abc"]))).toBe(true);
    });

    it("should handle very large numbers without overflow", () => {
        const result = AVERAGE([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
        expect(result).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("should handle very small decimal differences", () => {
        const result = AVERAGE([0.1, 0.2, 0.3]);
        expect(result).toBeCloseTo(0.2);
    });
});

describe("Math Functions BugHunt - MAX/MIN", () => {
    const MAX = mathFunctions.MAX;
    const MIN = mathFunctions.MIN;

    it("MAX should handle all negative values", () => {
        expect(MAX([-100, -50, -10])).toBe(-10);
    });

    it("MIN should handle all negative values", () => {
        expect(MIN([-100, -50, -10])).toBe(-100);
    });

    it("MAX should return 0 for all-non-numeric input", () => {
        expect(MAX(["a", "b"])).toBe(0);
    });

    it("MIN should return 0 for all-non-numeric input", () => {
        expect(MIN(["a", "b"])).toBe(0);
    });

    it("should handle Infinity correctly", () => {
        expect(MAX([1, Infinity])).toBe(Infinity);
        expect(MIN([1, -Infinity])).toBe(-Infinity);
    });

    it("should handle single-element array", () => {
        expect(MAX([42])).toBe(42);
        expect(MIN([42])).toBe(42);
    });
});

describe("Math Functions BugHunt - ABS", () => {
    const ABS = mathFunctions.ABS;

    it("should handle -0 correctly", () => {
        const result = ABS([-0]);
        expect(result).toBe(0);
        expect(Object.is(result, 0)).toBe(true);
    });

    it("should handle very large negative number", () => {
        expect(ABS([-Number.MAX_VALUE])).toBe(Number.MAX_VALUE);
    });

    it("should handle string that looks like number", () => {
        expect(ABS(["-999"])).toBe(999);
    });

    it("should convert boolean true to 1", () => {
        expect(ABS([true])).toBe(1);
    });

    it("should convert boolean false to 0", () => {
        expect(ABS([false])).toBe(0);
    });

    it("should return #VALUE! for empty args", () => {
        expect(ABS([])).toBe("#VALUE!");
    });

    it("should return #VALUE! for too many args", () => {
        expect(ABS([1, 2])).toBe("#VALUE!");
    });
});

describe("Math Functions BugHunt - ROUND", () => {
    const ROUND = mathFunctions.ROUND;

    it("should round to many decimal places", () => {
        expect(ROUND([3.141592653589793, 15])).toBeCloseTo(3.141592653589793);
    });

    it("should handle rounding of 0.5 up", () => {
        expect(ROUND([2.5, 0])).toBe(3);
        expect(ROUND([3.5, 0])).toBe(4);
    });

    it("should handle negative first arg", () => {
        expect(ROUND([-3.14, 1])).toBeCloseTo(-3.1);
    });

    it("should return #VALUE! for non-numeric first arg", () => {
        expect(ROUND(["abc", 0])).toBe("#VALUE!");
    });

    it("should return #VALUE! for no args", () => {
        expect(ROUND([])).toBe("#VALUE!");
    });
});