import { describe, it, expect } from "vitest";
import { mathFunctions } from "@/formula/functions/math";

describe("Math Functions - ROUNDUP", () => {
    const ROUNDUP = mathFunctions.ROUNDUP;

    it("should round up positive number", () => {
        expect(ROUNDUP([3.14159, 2])).toBeCloseTo(3.15);
    });

    it("should round up at 0 decimals", () => {
        expect(ROUNDUP([3.2, 0])).toBe(4);
    });

    it("should round up negative number away from zero", () => {
        expect(ROUNDUP([-3.2, 0])).toBe(-4);
    });

    it("should round up negative number with decimals", () => {
        expect(ROUNDUP([-3.14159, 2])).toBeCloseTo(-3.15);
    });

    it("should handle already rounded number", () => {
        expect(ROUNDUP([5, 0])).toBe(5);
    });

    it("should default to 0 decimals", () => {
        expect(ROUNDUP([3.2])).toBe(4);
    });

    it("should return #VALUE! for non-numeric", () => {
        expect(ROUNDUP(["abc", 0])).toBe("#VALUE!");
    });

    it("should return #VALUE! for no args", () => {
        expect(ROUNDUP([])).toBe("#VALUE!");
    });

    it("should round up with negative digits", () => {
        expect(ROUNDUP([1234, -2])).toBe(1300);
    });
});

describe("Math Functions - ROUNDDOWN", () => {
    const ROUNDDOWN = mathFunctions.ROUNDDOWN;

    it("should round down positive number", () => {
        expect(ROUNDDOWN([3.14159, 2])).toBeCloseTo(3.14);
    });

    it("should round down at 0 decimals", () => {
        expect(ROUNDDOWN([3.9, 0])).toBe(3);
    });

    it("should round down negative number toward zero", () => {
        expect(ROUNDDOWN([-3.9, 0])).toBe(-3);
    });

    it("should round down negative number with decimals", () => {
        expect(ROUNDDOWN([-3.14999, 2])).toBeCloseTo(-3.14);
    });

    it("should handle already rounded number", () => {
        expect(ROUNDDOWN([5, 0])).toBe(5);
    });

    it("should default to 0 decimals", () => {
        expect(ROUNDDOWN([3.9])).toBe(3);
    });

    it("should return #VALUE! for non-numeric", () => {
        expect(ROUNDDOWN(["abc", 0])).toBe("#VALUE!");
    });

    it("should round down with negative digits", () => {
        expect(ROUNDDOWN([1299, -2])).toBe(1200);
    });
});

describe("Math Functions - INT", () => {
    const INT = mathFunctions.INT;

    it("should floor positive number", () => {
        expect(INT([3.7])).toBe(3);
    });

    it("should floor negative number", () => {
        expect(INT([-3.7])).toBe(-4);
    });

    it("should return integer unchanged", () => {
        expect(INT([5])).toBe(5);
    });

    it("should handle zero", () => {
        expect(INT([0])).toBe(0);
    });

    it("should return #VALUE! for non-numeric", () => {
        expect(INT(["abc"])).toBe("#VALUE!");
    });

    it("should return #VALUE! for no args", () => {
        expect(INT([])).toBe("#VALUE!");
    });
});

describe("Math Functions - MOD", () => {
    const MOD = mathFunctions.MOD;

    it("should return correct modulo for positive numbers", () => {
        expect(MOD([7, 3])).toBe(1);
    });

    it("should follow Excel sign rule (result has same sign as divisor)", () => {
        expect(MOD([7, -3])).toBe(-2);
    });

    it("should handle negative dividend", () => {
        expect(MOD([-7, 3])).toBe(2);
    });

    it("should handle both negative", () => {
        expect(MOD([-7, -3])).toBe(-1);
    });

    it("should return #DIV/0! for zero divisor", () => {
        expect(MOD([5, 0])).toBe("#DIV/0!");
    });

    it("should return #VALUE! for non-numeric", () => {
        expect(MOD(["a", 3])).toBe("#VALUE!");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(MOD([5])).toBe("#VALUE!");
    });
});

describe("Math Functions - POWER", () => {
    const POWER = mathFunctions.POWER;

    it("should compute power correctly", () => {
        expect(POWER([2, 3])).toBe(8);
    });

    it("should handle fractional exponent", () => {
        expect(POWER([9, 0.5])).toBe(3);
    });

    it("should handle zero exponent", () => {
        expect(POWER([5, 0])).toBe(1);
    });

    it("should handle zero base", () => {
        expect(POWER([0, 5])).toBe(0);
    });

    it("should return #NUM! for negative base with fractional exponent", () => {
        expect(POWER([-4, 0.5])).toBe("#NUM!");
    });

    it("should return #VALUE! for non-numeric", () => {
        expect(POWER(["a", 2])).toBe("#VALUE!");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(POWER([2])).toBe("#VALUE!");
    });
});

describe("Math Functions - SUMPRODUCT", () => {
    const SUMPRODUCT = mathFunctions.SUMPRODUCT;

    it("should compute sum of products for two arrays", () => {
        expect(SUMPRODUCT([[1, 2, 3], [4, 5, 6]])).toBe(32);
    });

    it("should compute sum of products for three arrays", () => {
        expect(SUMPRODUCT([[1, 2], [3, 4], [5, 6]])).toBe(63);
    });

    it("should handle single array (sum of elements)", () => {
        expect(SUMPRODUCT([[1, 2, 3]])).toBe(6);
    });

    it("should return #VALUE! for mismatched lengths", () => {
        expect(SUMPRODUCT([[1, 2], [3, 4, 5]])).toBe("#VALUE!");
    });

    it("should treat non-numeric as 0 in product", () => {
        expect(SUMPRODUCT([[1, "a", 3], [4, 5, 6]])).toBe(22);
    });

    it("should return #VALUE! for no args", () => {
        expect(SUMPRODUCT([])).toBe("#VALUE!");
    });
});

describe("Math Functions - SUBTOTAL", () => {
    const SUBTOTAL = mathFunctions.SUBTOTAL;

    it("should compute AVERAGE (func 1)", () => {
        expect(SUBTOTAL([1, [10, 20, 30]])).toBe(20);
    });

    it("should compute SUM (func 9)", () => {
        expect(SUBTOTAL([9, [10, 20, 30]])).toBe(60);
    });

    it("should compute COUNT (func 3)", () => {
        expect(SUBTOTAL([3, [10, 20, 30]])).toBe(3);
    });

    it("should compute MAX (func 4)", () => {
        expect(SUBTOTAL([4, [10, 20, 30]])).toBe(30);
    });

    it("should compute MIN (func 5)", () => {
        expect(SUBTOTAL([5, [10, 20, 30]])).toBe(10);
    });

    it("should compute PRODUCT (func 6)", () => {
        expect(SUBTOTAL([6, [2, 3, 4]])).toBe(24);
    });

    it("should return #VALUE! for invalid func number", () => {
        expect(SUBTOTAL([0, [1, 2]])).toBe("#VALUE!");
        expect(SUBTOTAL([12, [1, 2]])).toBe("#VALUE!");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(SUBTOTAL([])).toBe("#VALUE!");
        expect(SUBTOTAL([9])).toBe("#VALUE!");
    });
});

describe("Math Functions - ROUND with negative digits", () => {
    const ROUND = mathFunctions.ROUND;

    it("should round to nearest 100 with digits=-2", () => {
        expect(ROUND([1234, -2])).toBe(1200);
    });

    it("should round to nearest 10 with digits=-1", () => {
        expect(ROUND([125, -1])).toBe(130);
    });

    it("should round to nearest 1000 with digits=-3", () => {
        expect(ROUND([4567, -3])).toBe(5000);
    });
});