import { describe, it, expect } from "vitest";
import { lookupFunctions } from "@/plugins/formula/functions/lookup";

describe("Lookup Functions - HLOOKUP", () => {
    const HLOOKUP = lookupFunctions.HLOOKUP;

    it("should find exact match in first row", () => {
        const table = [
            ["apple", "banana", "cherry"],
            [10, 20, 30],
            ["red", "yellow", "red"],
        ];
        expect(HLOOKUP(["banana", table, 2, false])).toBe(20);
        expect(HLOOKUP(["banana", table, 3, false])).toBe("yellow");
    });

    it("should return #N/A for not found exact match", () => {
        const table = [["a", "b"], [1, 2]];
        expect(HLOOKUP(["z", table, 2, false])).toBe("#N/A");
    });

    it("should do approximate match (sorted ascending)", () => {
        const table = [
            [10, 50, 100],
            ["low", "medium", "high"],
        ];
        expect(HLOOKUP([45, table, 2, true])).toBe("low");
        expect(HLOOKUP([55, table, 2, true])).toBe("medium");
    });

    it("should return #VALUE! for row_index < 1", () => {
        const table = [["a", "b"], [1, 2]];
        expect(HLOOKUP(["a", table, 0, false])).toBe("#VALUE!");
    });

    it("should return #REF! for row_index exceeding rows", () => {
        const table = [["a", "b"], [1, 2]];
        expect(HLOOKUP(["a", table, 5, false])).toBe("#REF!");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(HLOOKUP([])).toBe("#VALUE!");
        expect(HLOOKUP(["a"])).toBe("#VALUE!");
    });
});

describe("Lookup Functions - INDEX", () => {
    const INDEX = lookupFunctions.INDEX;

    it("should return element from 2D array", () => {
        const arr = [
            [1, 2, 3],
            [4, 5, 6],
        ];
        expect(INDEX([arr, 2, 3])).toBe(6);
    });

    it("should return element from 1D array", () => {
        expect(INDEX([[10, 20, 30], 2])).toBe(20);
    });

    it("should default col to 1 for 2D array", () => {
        const arr = [[1, 2], [3, 4]];
        expect(INDEX([arr, 2])).toBe(3);
    });

    it("should return #REF! for out of bounds row", () => {
        const arr = [[1, 2], [3, 4]];
        expect(INDEX([arr, 5, 1])).toBe("#REF!");
    });

    it("should return #REF! for out of bounds col", () => {
        const arr = [[1, 2], [3, 4]];
        expect(INDEX([arr, 1, 5])).toBe("#REF!");
    });

    it("should return #VALUE! for row < 1", () => {
        expect(INDEX([[[1, 2]], 0])).toBe("#VALUE!");
    });

    it("should return #VALUE! for non-array", () => {
        expect(INDEX(["not-array", 1])).toBe("#VALUE!");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(INDEX([])).toBe("#VALUE!");
    });
});

describe("Lookup Functions - MATCH", () => {
    const MATCH = lookupFunctions.MATCH;

    it("should find exact match (match_type=0)", () => {
        expect(MATCH(["banana", ["apple", "banana", "cherry"], 0])).toBe(2);
    });

    it("should find case-insensitive exact match", () => {
        expect(MATCH(["BANANA", ["apple", "banana", "cherry"], 0])).toBe(2);
    });

    it("should return #N/A for not found exact match", () => {
        expect(MATCH(["grape", ["apple", "banana", "cherry"], 0])).toBe("#N/A");
    });

    it("should find largest value <= lookup (match_type=1)", () => {
        expect(MATCH([25, [10, 20, 30, 40], 1])).toBe(2);
    });

    it("should find smallest value >= lookup (match_type=-1)", () => {
        expect(MATCH([25, [40, 30, 20, 10], -1])).toBe(2);
    });

    it("should default to match_type=1", () => {
        expect(MATCH([25, [10, 20, 30, 40]])).toBe(2);
    });

    it("should return #VALUE! for non-array lookup_array", () => {
        expect(MATCH([1, "not-array", 0])).toBe("#VALUE!");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(MATCH([])).toBe("#VALUE!");
    });
});