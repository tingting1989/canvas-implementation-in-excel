import { describe, it, expect } from "vitest";
import { lookupFunctions } from "@/formula/functions/lookup";

describe("Lookup Functions - VLOOKUP", () => {
    const VLOOKUP = lookupFunctions.VLOOKUP;

    function createTable(data) {
        return data;
    }

    it("should find exact match (range_lookup=false)", () => {
        const table = [
            ["apple", 10, "red"],
            ["banana", 20, "yellow"],
            ["cherry", 30, "red"],
        ];
        expect(VLOOKUP(["banana", table, 2, false])).toBe(20);
        expect(VLOOKUP(["banana", table, 3, false])).toBe("yellow");
    });

    it("should find exact match with default range_lookup=true", () => {
        const table = [
            [100, "A"],
            [200, "B"],
            [300, "C"],
        ];
        expect(VLOOKUP([200, table, 2])).toBe("B");
    });

    it("should return #N/A for not found exact match", () => {
        const table = [["a", 1], ["b", 2]];
        expect(VLOOKUP(["z", table, 2, false])).toBe("#N/A");
    });

    it("should do approximate match (largest value <= lookup)", () => {
        const table = [
            [10, "low"],
            [50, "medium"],
            [100, "high"],
        ];
        expect(VLOOKUP([45, table, 2, true])).toBe("low");
        expect(VLOOKUP([55, table, 2, true])).toBe("medium");
    });

    it("should return first column when colIndex=1", () => {
        const table = [["key", "val1", "val2"]];
        expect(VLOOKUP(["key", table, 1, false])).toBe("key");
    });

    it("should return #VALUE! for col_index_num < 1", () => {
        const table = [["a", "b"]];
        expect(VLOOKUP(["a", table, 0, false])).toBe("#VALUE!");
        expect(VLOOKUP(["a", table, -1, false])).toBe("#VALUE!");
    });

    it("should return #REF! for col_index_num exceeding columns", () => {
        const table = [["a", "b"]];
        expect(VLOOKUP(["a", table, 5, false])).toBe("#REF!");
    });

    it("should handle 1D array as single-row table", () => {
        const row = ["apple", 5];
        expect(VLOOKUP(["apple", row, 2, false])).toBe(5);
    });

    it("should return #VALUE! for non-array table_array", () => {
        expect(VLOOKUP(["a", "not-array", 1, false])).toBe("#VALUE!");
    });

    it("should return #VALUE! for too few args", () => {
        expect(VLOOKUP([])).toBe("#VALUE!");
        expect(VLOOKUP(["a"])).toBe("#VALUE!");
        expect(VLOOKUP(["a", []])).toBe("#VALUE!");
    });
});