import { describe, it, expect } from "vitest";
import { lookupFunctions } from "@/formula/functions/lookup";

describe("Lookup Functions BugHunt - VLOOKUP", () => {
    const VLOOKUP = lookupFunctions.VLOOKUP;

    it("should return #N/A when lookup value not found (exact match)", () => {
        const table = [["a", 1], ["b", 2], ["c", 3]];
        expect(VLOOKUP(["z", table, 2, false])).toBe("#N/A");
    });

    it("should return #VALUE! for col_index_num = 0", () => {
        const table = [["a", "b"]];
        expect(VLOOKUP(["a", table, 0, false])).toBe("#VALUE!");
    });

    it("should return #VALUE! for negative col_index_num", () => {
        const table = [["a", "b"]];
        expect(VLOOKUP(["a", table, -5, false])).toBe("#VALUE!");
    });

    it("should return #REF! for col_index_num exceeding table width", () => {
        const table = [["a"]];
        expect(VLOOKUP(["a", table, 5, false])).toBe("#REF!");
    });

    it("should handle 1D array as single-row table", () => {
        const row = ["key", 100];
        expect(VLOOKUP(["key", row, 2, false])).toBe(100);
    });

    it("should return #VALUE! for non-array table_array", () => {
        expect(VLOOKUP(["a", "not-array", 1, false])).toBe("#VALUE!");
    });

    it("should return first match in case of duplicates (exact)", () => {
        const table = [
            ["apple", 1],
            ["apple", 2],
            ["banana", 3],
        ];
        expect(VLOOKUP(["apple", table, 2, false])).toBe(1);
    });

    it("should do approximate match with range_lookup=true (default)", () => {
        const table = [
            [10, "low"],
            [50, "medium"],
            [100, "high"],
        ];
        expect(VLOOKUP([0, table, 2, true])).toBe("#N/A");
        expect(VLOOKUP([10, table, 2, true])).toBe("low");
        expect(VLOOKUP([49, table, 2, true])).toBe("low");
        expect(VLOOKUP([50, table, 2, true])).toBe("medium");
        expect(VLOOKUP([100, table, 2, true])).toBe("high");
        expect(VLOOKUP([999, table, 2, true])).toBe("high");
    });

    it("should return #VALUE! for too few args", () => {
        expect(VLOOKUP([])).toBe("#VALUE!");
        expect(VLOOKUP(["a"])).toBe("#VALUE!");
        expect(VLOOKUP(["a", []])).toBe("#VALUE!");
    });
});