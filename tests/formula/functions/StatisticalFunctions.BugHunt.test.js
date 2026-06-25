import { describe, it, expect } from "vitest";
import { statisticalFunctions } from "@/formula/functions/statistical";

describe("Statistical Functions BugHunt - COUNT", () => {
    const COUNT = statisticalFunctions.COUNT;

    it("should handle very large array (10000 elements)", () => {
        const arr = Array(10000).fill(1);
        expect(COUNT(arr)).toBe(10000);
    });

    it("should count 0 as numeric", () => {
        expect(COUNT([0])).toBe(1);
    });

    it("should count negative numbers", () => {
        expect(COUNT([-1, -2.5, -Infinity])).toBe(3);
    });

    it("should not count NaN", () => {
        expect(COUNT([NaN])).toBe(0);
    });

    it("should not count Infinity as non-numeric", () => {
        expect(COUNT([Infinity, -Infinity])).toBe(2);
    });

    it("should deeply flatten nested arrays", () => {
        const result = COUNT([[1, [2, [3]]], [[[4]], 5]]);
        expect(result).toBe(5);
    });

    it("should return #VALUE! for empty args", () => {
        expect(COUNT([])).toBe("#VALUE!");
    });
});

describe("Statistical Functions BugHunt - COUNTA", () => {
    const COUNTA = statisticalFunctions.COUNTA;

    it("should count 0 as non-empty", () => {
        expect(COUNTA([0, 0, 0])).toBe(3);
    });

    it("should count false as non-empty", () => {
        expect(COUNTA([false, false])).toBe(2);
    });

    it("should NOT count null/undefined/empty string", () => {
        expect(COUNTA([null, undefined, "", "x"])).toBe(1);
    });

    it("should count space-only string as non-empty", () => {
        expect(COUNTA([" ", "\t", "\n"])).toBe(3);
    });

    it("should count objects and arrays as non-empty", () => {
        expect(COUNTA([{}, [], function() {}])).toBe(3);
    });

    it("should return #VALUE! for empty args", () => {
        expect(COUNTA([])).toBe("#VALUE!");
    });
});

describe("Statistical Functions BugHunt - COUNTBLANK", () => {
    const COUNTBLANK = statisticalFunctions.COUNTBLANK;

    it("should count only blanks in mixed range", () => {
        const range = [["", null, undefined], ["a", 0, false]];
        expect(COUNTBLANK([range])).toBe(3);
    });

    it("should return 0 when no blanks exist", () => {
        const range = [["a"], [1]];
        expect(COUNTBLANK([range])).toBe(0);
    });

    it("should handle flat array input", () => {
        const range = ["", "a", null, "", "b"];
        expect(COUNTBLANK([range])).toBe(3);
    });

    it("should NOT count 0 as blank", () => {
        expect(COUNTBLANK([[0]])).toBe(0);
    });

    it("should NOT count false as blank", () => {
        expect(COUNTBLANK([[false]])).toBe(0);
    });

    it("should NOT count space-only string as blank", () => {
        expect(COUNTBLANK([[" "]])).toBe(0);
    });

    it("should return #VALUE! for wrong arg count (0)", () => {
        expect(COUNTBLANK([])).toBe("#VALUE!");
    });

    it("should count blanks in 2D array", () => {
        expect(COUNTBLANK([["a"], ["b"]])).toBe(0);
        expect(COUNTBLANK([[""], [null]])).toBe(2);
    });
});