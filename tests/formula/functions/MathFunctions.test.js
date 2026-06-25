import { describe, it, expect } from "vitest";
import { mathFunctions } from "@/formula/functions/math";

describe("Math Functions - SUM", () => {
    const SUM = mathFunctions.SUM;

    it("should sum numbers", () => {
        expect(SUM([1, 2, 3])).toBe(6);
    });

    it("should sum single number", () => {
        expect(SUM([42])).toBe(42);
    });

    it("should sum negative numbers", () => {
        expect(SUM([-1, -2, -3])).toBe(-6);
    });

    it("should sum mixed positive and negative", () => {
        expect(SUM([-10, 20, -5])).toBe(5);
    });

    it("should ignore non-numeric values", () => {
        expect(SUM([1, "abc", 3])).toBe(4);
    });

    it("should handle empty-like non-numeric arrays", () => {
        expect(SUM(["a", "b"])).toBe(0);
    });

    it("should sum nested array (range) values", () => {
        expect(SUM([[1, 2], [3, 4]])).toBe(10);
    });

    it("should return #VALUE! for no arguments", () => {
        expect(SUM([])).toBe("#VALUE!");
    });
});

describe("Math Functions - AVERAGE", () => {
    const AVERAGE = mathFunctions.AVERAGE;

    it("should calculate average of numbers", () => {
        expect(AVERAGE([1, 2, 3, 4, 5])).toBe(3);
    });

    it("should average two numbers", () => {
        expect(AVERAGE([10, 20])).toBe(15);
    });

    it("should average single number", () => {
        expect(AVERAGE([42])).toBe(42);
    });

    it("should ignore non-numeric values in count", () => {
        expect(AVERAGE([1, "a", 3])).toBe(2);
    });

    it("should handle decimal results", () => {
        expect(AVERAGE([1, 2])).toBe(1.5);
    });

    it("should return #DIV/0! for all-non-numeric input", () => {
        expect(AVERAGE(["a", "b", "c"])).toBe("#DIV/0!");
    });

    it("should return #VALUE! for empty args", () => {
        expect(AVERAGE([])).toBe("#VALUE!");
    });
});

describe("Math Functions - MAX", () => {
    const MAX = mathFunctions.MAX;

    it("should find maximum value", () => {
        expect(MAX([1, 5, 3, 9, 2])).toBe(9);
    });

    it("should handle negative numbers", () => {
        expect(MAX([-10, -5, -20])).toBe(-5);
    });

    it("should handle mixed positive and negative", () => {
        expect(MAX([-100, 50, 0])).toBe(50);
    });

    it("should return single element for one-item array", () => {
        expect(MAX([42])).toBe(42);
    });

    it("should ignore non-numeric values", () => {
        expect(MAX(["a", 5, "b"])).toBe(5);
    });

    it("should return 0 for all-non-numeric input", () => {
        expect(MAX(["a", "b"])).toBe(0);
    });

    it("should return #VALUE! for empty args", () => {
        expect(MAX([])).toBe("#VALUE!");
    });
});

describe("Math Functions - MIN", () => {
    const MIN = mathFunctions.MIN;

    it("should find minimum value", () => {
        expect(MIN([1, 5, 3, 9, 2])).toBe(1);
    });

    it("should handle negative numbers", () => {
        expect(MIN([-10, -5, -20])).toBe(-20);
    });

    it("should handle mixed positive and negative", () => {
        expect(MIN([-100, 50, 0])).toBe(-100);
    });

    it("should return single element for one-item array", () => {
        expect(MIN([42])).toBe(42);
    });

    it("should ignore non-numeric values", () => {
        expect(MIN(["a", 5, "b"])).toBe(5);
    });

    it("should return 0 for all-non-numeric input", () => {
        expect(MIN(["a", "b"])).toBe(0);
    });

    it("should return #VALUE! for empty args", () => {
        expect(MIN([])).toBe("#VALUE!");
    });
});

describe("Math Functions - ABS", () => {
    const ABS = mathFunctions.ABS;

    it("should return absolute value of positive number", () => {
        expect(ABS([42])).toBe(42);
    });

    it("should return absolute value of negative number", () => {
        expect(ABS([-42])).toBe(42);
    });

    it("should return 0 for zero", () => {
        expect(ABS([0])).toBe(0);
    });

    it("should handle decimal values", () => {
        expect(ABS([-3.14])).toBeCloseTo(3.14);
    });

    it("should return #VALUE! for non-numeric string", () => {
        expect(ABS(["abc"])).toBe("#VALUE!");
    });

    it("should convert numeric strings", () => {
        expect(ABS(["-100"])).toBe(100);
    });

    it("should return #VALUE! for wrong arg count (0)", () => {
        expect(ABS([])).toBe("#VALUE!");
    });

    it("should return #VALUE! for wrong arg count (>1)", () => {
        expect(ABS([1, 2])).toBe("#VALUE!");
    });
});

describe("Math Functions - ROUND", () => {
    const ROUND = mathFunctions.ROUND;

    it("should round to 0 decimals by default", () => {
        expect(ROUND([3.14159])).toBe(3);
    });

    it("should round to specified decimals", () => {
        expect(ROUND([3.14159, 2])).toBeCloseTo(3.14);
    });

    it("should round up at .5", () => {
        expect(ROUND([99.5, 0])).toBe(100);
    });

    it("should handle rounding to integer with explicit 0", () => {
        expect(ROUND([7.8, 0])).toBe(8);
    });

    it("should return #VALUE! for non-numeric first argument", () => {
        expect(ROUND(["abc", 0])).toBe("#VALUE!");
    });

    it("should return #VALUE! for negative digits", () => {
        expect(ROUND([1234, -2])).toBe("#VALUE!");
    });

    it("should return #VALUE! for no args", () => {
        expect(ROUND([])).toBe("#VALUE!");
    });

    it("should handle zero correctly", () => {
        expect(ROUND([0, 2])).toBe(0);
    });
});