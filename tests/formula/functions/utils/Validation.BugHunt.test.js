import { describe, it, expect } from "vitest";
import { _validateArgs, _validateNumericArg } from "@/formula/functions/utils/validation";

describe("Utils BugHunt - _validateArgs", () => {
    it("should fail for non-array input (string)", () => {
        expect(_validateArgs("not array", 1, 3, "TEST")).toBe(false);
    });

    it("should fail for null input", () => {
        expect(_validateArgs(null, 0, 3, "TEST")).toBe(false);
    });

    it("should fail for undefined input", () => {
        expect(_validateArgs(undefined, 0, 3, "TEST")).toBe(false);
    });

    it("should fail for number input", () => {
        expect(_validateArgs(42, 1, 5, "TEST")).toBe(false);
    });

    it("should pass when arg count equals min==max exactly", () => {
        expect(_validateArgs([1], 1, 1, "ABS")).toBe(true);
        expect(_validateArgs([1, 2], 2, 2, "IF")).toBe(true);
    });

    it("should pass with Infinity as max", () => {
        const many = Array(10000).fill(1);
        expect(_validateArgs(many, 1, Infinity, "SUM")).toBe(true);
    });

    it("should pass with 0 as valid min and max (zero-arg function)", () => {
        expect(_validateArgs([], 0, 0, "RAND")).toBe(true);
    });
});

describe("Utils BugHunt - _validateNumericArg", () => {
    it("should return invalid for empty string", () => {
        const result = _validateNumericArg([""], 0, "value", "TEST");
        expect(result.valid).toBe(false);
    });

    it("should return invalid for whitespace-only string", () => {
        const result = _validateNumericArg(["   "], 0, "value", "TEST");
        expect(result.valid).toBe(false);
    });

    it("should return invalid for null", () => {
        const result = _validateNumericArg([null], 0, "value", "TEST");
        expect(result.valid).toBe(false);
    });

    it("should return invalid for undefined at index", () => {
        const result = _validateNumericArg([], 0, "value", "TEST");
        expect(result.valid).toBe(false);
    });

    it("should return invalid for boolean true", () => {
        const result = _validateNumericArg([true], 0, "value", "TEST");
        expect(result.valid).toBe(false);
    });

    it("should return invalid for boolean false", () => {
        const result = _validateNumericArg([false], 0, "value", "TEST");
        expect(result.valid).toBe(false);
    });

    it("should parse negative zero string correctly", () => {
        const result = _validateNumericArg(["-0"], 0, "value", "TEST");
        expect(result.valid).toBe(true);
        expect(result.value).toBe(-0);
    });

    it("should parse scientific notation string correctly", () => {
        const result = _validateNumericArg(["1e10"], 0, "value", "TEST");
        expect(result.valid).toBe(true);
        expect(result.value).toBe(10000000000);
    });

    it("should handle out-of-bounds index gracefully", () => {
        const result = _validateNumericArg([1], 99, "missing", "TEST");
        expect(result.valid).toBe(false);
    });
});