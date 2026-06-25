import { describe, it, expect } from "vitest";
import { conditionalFunctions } from "@/formula/functions/conditional";

describe("Conditional Functions - SUMIF", () => {
    const SUMIF = conditionalFunctions.SUMIF;

    it("should sum values matching > condition", () => {
        expect(SUMIF([[10, 20, 30, 40, 50], ">25"])).toBe(120);
    });

    it("should sum values matching < condition", () => {
        expect(SUMIF([[10, 20, 30, 40, 50], "<25"])).toBe(30);
    });

    it("should sum values matching = condition", () => {
        expect(SUMIF([[10, 20, 30], "=20"])).toBe(20);
    });

    it("should sum values matching >= condition", () => {
        expect(SUMIF([[10, 20, 30], ">=20"])).toBe(50);
    });

    it("should sum values matching <= condition", () => {
        expect(SUMIF([[10, 20, 30], "<=20"])).toBe(30);
    });

    it("should sum values matching <> (not equal) condition", () => {
        expect(SUMIF([[10, 20, 30], "<>20"])).toBe(40);
    });

    it("should use separate sum_range when provided", () => {
        const range = ["a", "b", "a", "b"];
        const sumRange = [1, 2, 3, 4];
        expect(SUMIF([range, "a", sumRange])).toBe(4);
    });

    it("should match text exactly", () => {
        expect(SUMIF([["apple", "banana", "apple"], "apple"])).toBe(0);
    });

    it("should match wildcard pattern *", () => {
        const range = ["apple", "banana", "cherry"];
        const sumRange = [1, 2, 3];
        expect(SUMIF([range, "*a*", sumRange])).toBe(3);
    });

    it("should return #VALUE! for range/sum_range length mismatch", () => {
        const range = [1, 2, 3];
        const sumRange = [1, 2];
        expect(SUMIF([range, ">0", sumRange])).toBe("#VALUE!");
    });

    it("should return #VALUE! for too few args", () => {
        expect(SUMIF([])).toBe("#VALUE!");
        expect(SUMIF([[1]])).toBe("#VALUE!");
    });
});

describe("Conditional Functions - SUMIFS", () => {
    const SUMIFS = conditionalFunctions.SUMIFS;

    it("should sum with single condition pair", () => {
        const sumRange = [100, 200, 300, 400];
        const criteriaRange = ["A", "B", "A", "B"];
        expect(SUMIFS([sumRange, criteriaRange, "A"])).toBe(400);
    });

    it("should sum with multiple conditions (AND logic)", () => {
        const sumRange = [100, 200, 300, 400];
        const region = ["North", "North", "South", "South"];
        const category = ["Food", "Tech", "Food", "Tech"];
        expect(SUMIFS([sumRange, region, "South", category, "Food"])).toBe(300);
    });

    it("should require odd number of args (sum_range + pairs)", () => {
        expect(SUMIFS([[1, 2]])).toBe("#VALUE!");
    });

    it("should return #VALUE! for mismatched condition range lengths", () => {
        const sumRange = [1, 2, 3];
        const r1 = [1, 2, 3];
        const r2 = [1, 2];
        expect(SUMIFS([sumRange, r1, ">0", r2, ">0"])).toBe("#VALUE!");
    });

    it("should return 0 when nothing matches", () => {
        expect(SUMIFS([[1, 2, 3], [4, 5, 6], ">100"])).toBe(0);
    });
});

describe("Conditional Functions - COUNTIF", () => {
    const COUNTIF = conditionalFunctions.COUNTIF;

    it("should count values > threshold", () => {
        expect(COUNTIF([[5, 15, 25, 3, 8], ">10"])).toBe(2);
    });

    it("should count values < threshold", () => {
        expect(COUNTIF([[5, 15, 25, 3, 8], "<10"])).toBe(3);
    });

    it("should count exact text matches", () => {
        expect(COUNTIF([["a", "b", "c", "a"], "a"])).toBe(2);
    });

    it("should count exact numeric matches", () => {
        expect(COUNTIF([[1, 2, 3, 2, 1], 2])).toBe(2);
    });

    it("should count with <> (not equal)", () => {
        expect(COUNTIF([[1, 2, 3, 4, 5], "<>3"])).toBe(4);
    });

    it("should count empty strings with \"\" criteria", () => {
        expect(COUNTIF([["", "a", "", "b"], ""])).toBe(2);
    });

    it("should count with wildcard *", () => {
        expect(COUNTIF([["apple", "banana", "apricot"], "*a*"])).toBe(3);
    });

    it("should count with wildcard ?", () => {
        expect(COUNTIF([["ab", "abc", "a"], "a?"])).toBe(1);
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(COUNTIF([])).toBe("#VALUE!");
        expect(COUNTIF([[1]])).toBe("#VALUE!");
        expect(COUNTIF([[1], ">0", "extra"])).toBe("#VALUE!");
    });
});

describe("Conditional Functions - COUNTIFS", () => {
    const COUNTIFS = conditionalFunctions.COUNTIFS;

    it("should count with single condition pair", () => {
        expect(COUNTIFS([[1, 2, 3, 4, 5], ">3"])).toBe(2);
    });

    it("should count with multiple AND conditions", () => {
        const ages = [18, 22, 17, 30, 16, 25];
        const genders = ["M", "F", "M", "F", "M", "F"];
        expect(COUNTIFS([ages, ">=18", genders, "F"])).toBe(3);
    });

    it("should require even number of args (pairs)", () => {
        expect(COUNTIFS([[1]])).toBe("#VALUE!");
        expect(COUNTIFS([[1], ">0", [2]])).toBe("#VALUE!");
    });

    it("should return #VALUE! for mismatched range lengths", () => {
        const r1 = [1, 2, 3];
        const r2 = [1, 2];
        expect(COUNTIFS([r1, ">0", r2, ">0"])).toBe("#VALUE!");
    });

    it("should return 0 when no rows match all conditions", () => {
        expect(COUNTIFS([[1, 2], ">100", [3, 4], ">0"])).toBe(0);
    });
});