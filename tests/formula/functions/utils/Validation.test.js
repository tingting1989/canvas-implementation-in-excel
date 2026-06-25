import { describe, it, expect } from "vitest";
import { _validateArgs, _validateNumericArg } from "@/formula/functions/utils/validation";

describe("Utils - _validateArgs", () => {
    it("should pass for valid arg count within range", () => {
        expect(_validateArgs([1, 2, 3], 1, Infinity, "TEST")).toBe(true);
        expect(_validateArgs([1], 1, 3, "TEST")).toBe(true);
        expect(_validateArgs([1, 2, 3], 1, 3, "TEST")).toBe(true);
    });

    it("should fail for fewer than min args", () => {
        expect(_validateArgs([], 1, Infinity, "SUM")).toBe(false);
        expect(_validateArgs([1], 2, 5, "IF")).toBe(false);
    });

    it("should fail for more than max args", () => {
        expect(_validateArgs([1, 2], 1, 1, "ABS")).toBe(false);
        expect(_validateArgs([1, 2, 3, 4], 1, 3, "FN")).toBe(false);
    });

    it("should pass exact count when min==max", () => {
        expect(_validateArgs([1], 1, 1, "ABS")).toBe(true);
        expect(_validateArgs([], 0, 0, "ZERO")).toBe(true);
    });

    it("should fail for non-array input", () => {
        expect(_validateArgs("not array", 1, 3, "TEST")).toBe(false);
        expect(_validateArgs(null, 1, 3, "TEST")).toBe(false);
        expect(_validateArgs(42, 1, 3, "TEST")).toBe(false);
        expect(_validateArgs(undefined, 1, 3, "TEST")).toBe(false);
    });

    it("should handle large arg counts", () => {
        const many = Array(100).fill(1);
        expect(_validateArgs(many, 1, Infinity, "BIG")).toBe(true);
    });
});

describe("Utils - _validateNumericArg", () => {
    it("should return valid with value for numeric string", () => {
        const result = _validateNumericArg(["42"], 0, "value", "TEST");
        expect(result.valid).toBe(true);
        expect(result.value).toBe(42);
    });

    it("should return valid with value for number", () => {
        const result = _validateNumericArg([3.14], 0, "value", "TEST");
        expect(result.valid).toBe(true);
        expect(result.value).toBeCloseTo(3.14);
    });

    it("should return valid for negative number", () => {
        const result = _validateNumericArg([-10], 0, "value", "TEST");
        expect(result.valid).toBe(true);
        expect(result.value).toBe(-10);
    });

    it("should return valid for zero", () => {
        const result = _validateNumericArg([0], 0, "value", "TEST");
        expect(result.valid).toBe(true);
        expect(result.value).toBe(0);
    });

    it("should return invalid for non-numeric string", () => {
        const result = _validateNumericArg(["abc"], 0, "value", "TEST");
        expect(result.valid).toBe(false);
    });

    it("should return invalid for empty string", () => {
        const result = _validateNumericArg([""], 0, "value", "TEST");
        expect(result.valid).toBe(false);
    });

    it("should return invalid for null", () => {
        const result = _validateNumericArg([null], 0, "value", "TEST");
        expect(result.valid).toBe(false);
    });

    it("should validate at correct index", () => {
        const args = ["bad", 99];
        const r0 = _validateNumericArg(args, 0, "first", "TEST");
        const r1 = _validateNumericArg(args, 1, "second", "TEST");
        expect(r0.valid).toBe(false);
        expect(r1.valid).toBe(true);
        expect(r1.value).toBe(99);
    });
});