import { describe, it, expect } from "vitest";
import { lookupFunctions } from "@/formula/functions/lookup";

describe("Lookup Functions BugHunt - HLOOKUP", () => {
    const HLOOKUP = lookupFunctions.HLOOKUP;

    it("should handle 1D array as single-row table", () => {
        const row = ["apple", "banana", "cherry"];
        expect(HLOOKUP(["banana", row, 1, false])).toBe("banana");
    });

    it("should return #VALUE! for non-array table", () => {
        expect(HLOOKUP(["a", "not-array", 1, false])).toBe("#VALUE!");
    });

    it("should handle exact match with default range_lookup", () => {
        const table = [
            [100, 200, 300],
            ["A", "B", "C"],
        ];
        expect(HLOOKUP([200, table, 2])).toBe("B");
    });
});

describe("Lookup Functions BugHunt - INDEX", () => {
    const INDEX = lookupFunctions.INDEX;

    it("should handle 1D array with out-of-bounds index", () => {
        expect(INDEX([[1, 2, 3], 5])).toBe("#REF!");
    });

    it("should handle empty 2D array", () => {
        const arr = [[], []];
        expect(INDEX([arr, 1, 1])).toBe("#REF!");
    });
});

describe("Lookup Functions BugHunt - MATCH", () => {
    const MATCH = lookupFunctions.MATCH;

    it("should handle 2D lookup array (flattened)", () => {
        const arr = [
            [1, 2, 3],
            [4, 5, 6],
        ];
        expect(MATCH([5, arr, 0])).toBe(5);
    });

    it("should return #N/A for match_type=1 with all values > lookup", () => {
        expect(MATCH([5, [10, 20, 30], 1])).toBe("#N/A");
    });

    it("should return #N/A for match_type=-1 with all values < lookup", () => {
        expect(MATCH([50, [10, 20, 30], -1])).toBe("#N/A");
    });

    it("should handle match_type=1 with exact match", () => {
        expect(MATCH([20, [10, 20, 30], 1])).toBe(2);
    });

    it("should handle match_type=-1 with exact match", () => {
        expect(MATCH([20, [30, 20, 10], -1])).toBe(2);
    });
});