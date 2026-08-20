import { describe, it, expect } from "vitest";
import { mathFunctions } from "@/plugins/formula/functions/math";

describe("Math Functions BugHunt - ROUNDUP", () => {
    const ROUNDUP = mathFunctions.ROUNDUP;

    it("should round -3.2 up to -4 (away from zero)", () => {
        expect(ROUNDUP([-3.2, 0])).toBe(-4);
    });

    it("should round -3.14159 up to -3.15 (away from zero)", () => {
        expect(ROUNDUP([-3.14159, 2])).toBeCloseTo(-3.15);
    });

    it("should round 0 up to 0", () => {
        expect(ROUNDUP([0, 0])).toBe(0);
    });

    it("should handle very small positive number", () => {
        expect(ROUNDUP([0.001, 0])).toBe(1);
    });

    it("should handle very small negative number", () => {
        expect(ROUNDUP([-0.001, 0])).toBe(-1);
    });
});

describe("Math Functions BugHunt - ROUNDDOWN", () => {
    const ROUNDDOWN = mathFunctions.ROUNDDOWN;

    it("should round -3.9 down to -3 (toward zero)", () => {
        expect(ROUNDDOWN([-3.9, 0])).toBe(-3);
    });

    it("should round -3.14999 down to -3.14 (toward zero)", () => {
        expect(ROUNDDOWN([-3.14999, 2])).toBeCloseTo(-3.14);
    });

    it("should round 0 down to 0", () => {
        expect(ROUNDDOWN([0, 0])).toBe(0);
    });
});

describe("Math Functions BugHunt - MOD", () => {
    const MOD = mathFunctions.MOD;

    it("MOD(7, -3) should be -2 (Excel sign rule)", () => {
        expect(MOD([7, -3])).toBe(-2);
    });

    it("MOD(-7, 3) should be 2 (Excel sign rule)", () => {
        expect(MOD([-7, 3])).toBe(2);
    });

    it("MOD(-7, -3) should be -1 (Excel sign rule)", () => {
        expect(MOD([-7, -3])).toBe(-1);
    });

    it("MOD(0, 3) should be 0", () => {
        expect(MOD([0, 3])).toBe(0);
    });
});

describe("Math Functions BugHunt - POWER", () => {
    const POWER = mathFunctions.POWER;

    it("should return #NUM! for negative base with 0.5 exponent", () => {
        expect(POWER([-4, 0.5])).toBe("#NUM!");
    });

    it("should handle very large result as #NUM!", () => {
        expect(POWER([10, 309])).toBe("#NUM!");
    });

    it("should handle negative base with integer exponent", () => {
        expect(POWER([-2, 3])).toBe(-8);
    });
});

describe("Math Functions BugHunt - SUMPRODUCT", () => {
    const SUMPRODUCT = mathFunctions.SUMPRODUCT;

    it("should handle arrays with all non-numeric values", () => {
        expect(SUMPRODUCT([["a", "b"], ["c", "d"]])).toBe(0);
    });

    it("should handle single-element arrays", () => {
        expect(SUMPRODUCT([[3], [4]])).toBe(12);
    });

    it("should handle non-array scalars", () => {
        expect(SUMPRODUCT([3, 4])).toBe(12);
    });

    it("should compute sum of squares with two identical arrays", () => {
        expect(SUMPRODUCT([[1, 2, 3], [1, 2, 3]])).toBe(14);
    });
});

describe("Math Functions BugHunt - ROUND negative digits", () => {
    const ROUND = mathFunctions.ROUND;

    it("ROUND(1234, -2) should be 1200", () => {
        expect(ROUND([1234, -2])).toBe(1200);
    });

    it("ROUND(1250, -2) should be 1300", () => {
        expect(ROUND([1250, -2])).toBe(1300);
    });

    it("ROUND(999, -1) should be 1000", () => {
        expect(ROUND([999, -1])).toBe(1000);
    });
});

describe("Math Functions BugHunt - SUBTOTAL", () => {
    const SUBTOTAL = mathFunctions.SUBTOTAL;

    it("should compute STDEV sample (func 7)", () => {
        const result = SUBTOTAL([7, [2, 4, 4, 4, 5, 5, 7, 9]]);
        expect(result).toBeCloseTo(2.138, 2);
    });

    it("should compute STDEV population (func 8)", () => {
        const result = SUBTOTAL([8, [2, 4, 4, 4, 5, 5, 7, 9]]);
        expect(result).toBeCloseTo(2.0, 0);
    });

    it("should compute VAR sample (func 10)", () => {
        const result = SUBTOTAL([10, [1, 2, 3, 4, 5]]);
        expect(result).toBeCloseTo(2.5, 5);
    });

    it("should compute VAR population (func 11)", () => {
        const result = SUBTOTAL([11, [1, 2, 3, 4, 5]]);
        expect(result).toBeCloseTo(2.0, 5);
    });

    it("should return 0 for empty range", () => {
        expect(SUBTOTAL([9, []])).toBe(0);
    });
});