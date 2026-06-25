import { describe, it, expect } from "vitest";
import { conditionalFunctions } from "@/formula/functions/conditional";

describe("Conditional Functions BugHunt - SUMIF", () => {
    const SUMIF = conditionalFunctions.SUMIF;

    it("should handle empty range", () => {
        expect(SUMIF([[], ">0"])).toBe(0);
    });

    it("should return 0 when matching text values (not numbers)", () => {
        expect(SUMIF([["apple", "banana"], "apple"])).toBe(0);
    });

    it("should use sum_range when provided and shorter than range (if valid)", () => {
        expect(SUMIF([[1, 2, 3], ">1", [10, 20, 30]])).toBe(50);
    });

    it("should return #VALUE! for range/sum_range length mismatch", () => {
        expect(SUMIF([[1, 2, 3], ">0", [1, 2]])).toBe("#VALUE!");
    });

    it("should match wildcard * at start", () => {
        const range = ["apple", "banana", "cherry"];
        const sumRange = [1, 2, 3];
        expect(SUMIF([range, "*e*", sumRange])).toBe(4);
    });

    it("should match wildcard ? in middle", () => {
        const range = ["ab", "abc", "abcd"];
        const sumRange = [10, 20, 30];
        expect(SUMIF([range, "a?c", sumRange])).toBe(20);
    });

    it("should return #VALUE! for too few args", () => {
        expect(SUMIF([])).toBe("#VALUE!");
        expect(SUMIF([[1]])).toBe("#VALUE!");
    });
});

describe("Conditional Functions BugHunt - SUMIFS", () => {
    const SUMIFS = conditionalFunctions.SUMIFS;

    it("should require odd number of args (sum_range + pairs)", () => {
        expect(SUMIFS([[1, 2, 3]])).toBe("#VALUE!");
        expect(SUMIFS([[1], [1], ">0", [2]])).toBe("#VALUE!");
    });

    it("should return 0 when nothing matches all conditions", () => {
        expect(SUMIFS([[1, 2, 3], [4, 5, 6], ">100"])).toBe(0);
    });

    it("should handle many condition pairs (5 pairs)", () => {
        const sr = [100, 200, 300];
        const r1 = ["A", "A", "B"];
        const r2 = ["X", "Y", "X"];
        const r3 = [1, 1, 2];
        const r4 = [true, true, true];
        const r5 = ["p", "q", "p"];

        expect(() => SUMIFS([sr, r1, "A", r2, "X", r3, 1, r4, true, r5, "p"])).not.toThrow();
    });

    it("should return #VALUE! for mismatched pair lengths", () => {
        const sr = [1, 2, 3];
        const r1 = [1, 2, 3];
        const r2 = [1, 2];
        expect(SUMIFS([sr, r1, ">0", r2, ">0"])).toBe("#VALUE!");
    });
});

describe("Conditional Functions BugHunt - COUNTIF", () => {
    const COUNTIF = conditionalFunctions.COUNTIF;

    it("should count exact numeric match with number criteria", () => {
        expect(COUNTIF([[1, 2, 3, 2, 1], 2])).toBe(2);
    });

    it("should count with > operator on text (lexicographic)", () => {
        expect(COUNTIF([["b", "c", "a"], ">b"])).toBe(1);
    });

    it("should count empty strings with \"\" criteria", () => {
        expect(COUNTIF([["", "", "x", ""], ""])).toBe(3);
    });

    it("should count non-empty strings with <>\"\" criteria", () => {
        expect(COUNTIF([["", "a", "", "b"], "<>\"\""])).toBe(4);
    });

    it("should handle wildcard * matching everything", () => {
        expect(COUNTIF([["a", "b", "c"], "*"])).toBe(3);
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(COUNTIF([])).toBe("#VALUE!");
        expect(COUNTIF([[1]])).toBe("#VALUE!");
        expect(COUNTIF([[1], ">0", "extra"])).toBe("#VALUE!");
    });
});

describe("Conditional Functions BugHunt - COUNTIFS", () => {
    const COUNTIFS = conditionalFunctions.COUNTIFS;

    it("should require even number of args (pairs)", () => {
        expect(COUNTIFS([[1]])).toBe("#VALUE!");
        expect(COUNTIFS([[1], ">0", [2]])).toBe("#VALUE!");
    });

    it("should return 0 when no rows satisfy all conditions", () => {
        expect(COUNTIFS([[1, 2], ">100", [3, 4], ">0"])).toBe(0);
    });

    it("should handle single condition pair correctly", () => {
        expect(COUNTIFS([[1, 2, 3, 4, 5], ">3"])).toBe(2);
    });

    it("should return #VALUE! for mismatched range lengths between pairs", () => {
        const r1 = [1, 2, 3];
        const r2 = [1, 2];
        expect(COUNTIFS([r1, ">0", r2, ">0"])).toBe("#VALUE!");
    });
});