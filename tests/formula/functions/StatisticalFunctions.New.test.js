import { describe, it, expect } from "vitest";
import { statisticalFunctions } from "@/plugins/formula/functions/statistical";

describe("Statistical Functions - STDEV", () => {
    const STDEV = statisticalFunctions.STDEV;

    it("should compute sample standard deviation", () => {
        expect(STDEV([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
    });

    it("should return #DIV/0! for single value", () => {
        expect(STDEV([5])).toBe("#DIV/0!");
    });

    it("should return 0 for identical values", () => {
        expect(STDEV([5, 5, 5])).toBe(0);
    });

    it("should ignore non-numeric values", () => {
        expect(STDEV([2, "a", 4, 4])).toBeCloseTo(1.1547, 3);
    });

    it("should return #VALUE! for no args", () => {
        expect(STDEV([])).toBe("#VALUE!");
    });
});

describe("Statistical Functions - STDEVP", () => {
    const STDEVP = statisticalFunctions.STDEVP;

    it("should compute population standard deviation", () => {
        expect(STDEVP([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0, 0);
    });

    it("should return 0 for single value", () => {
        expect(STDEVP([5])).toBe(0);
    });

    it("should return #VALUE! for no args", () => {
        expect(STDEVP([])).toBe("#VALUE!");
    });
});

describe("Statistical Functions - VAR", () => {
    const VAR = statisticalFunctions.VAR;

    it("should compute sample variance", () => {
        const result = VAR([1, 2, 3, 4, 5]);
        expect(result).toBeCloseTo(2.5, 5);
    });

    it("should return #DIV/0! for single value", () => {
        expect(VAR([5])).toBe("#DIV/0!");
    });

    it("should return #VALUE! for no args", () => {
        expect(VAR([])).toBe("#VALUE!");
    });
});

describe("Statistical Functions - VARP", () => {
    const VARP = statisticalFunctions.VARP;

    it("should compute population variance", () => {
        const result = VARP([1, 2, 3, 4, 5]);
        expect(result).toBeCloseTo(2.0, 5);
    });

    it("should return 0 for single value", () => {
        expect(VARP([5])).toBe(0);
    });

    it("should return #VALUE! for no args", () => {
        expect(VARP([])).toBe("#VALUE!");
    });
});

describe("Statistical Functions - MEDIAN", () => {
    const MEDIAN = statisticalFunctions.MEDIAN;

    it("should return middle value for odd count", () => {
        expect(MEDIAN([1, 3, 5])).toBe(3);
    });

    it("should return average of two middle values for even count", () => {
        expect(MEDIAN([1, 2, 3, 4])).toBe(2.5);
    });

    it("should handle unsorted input", () => {
        expect(MEDIAN([5, 1, 3])).toBe(3);
    });

    it("should handle single value", () => {
        expect(MEDIAN([42])).toBe(42);
    });

    it("should ignore non-numeric values", () => {
        expect(MEDIAN([1, "a", 3])).toBe(2);
    });

    it("should return #NUM! for all non-numeric", () => {
        expect(MEDIAN(["a", "b"])).toBe("#NUM!");
    });

    it("should return #VALUE! for no args", () => {
        expect(MEDIAN([])).toBe("#VALUE!");
    });
});

describe("Statistical Functions - RANK", () => {
    const RANK = statisticalFunctions.RANK;

    it("should return correct rank in descending order (default)", () => {
        expect(RANK([3, [7, 5, 3, 1]])).toBe(3);
    });

    it("should return rank 1 for largest value", () => {
        expect(RANK([7, [7, 5, 3, 1]])).toBe(1);
    });

    it("should return rank in ascending order (order=1)", () => {
        expect(RANK([3, [7, 5, 3, 1], 1])).toBe(2);
    });

    it("should handle duplicate values (same rank)", () => {
        expect(RANK([5, [5, 5, 3]])).toBe(1);
    });

    it("should return #N/A for value not in range", () => {
        expect(RANK([10, [1, 2, 3]])).toBe("#N/A");
    });

    it("should return #VALUE! for non-numeric number", () => {
        expect(RANK(["a", [1, 2, 3]])).toBe("#VALUE!");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(RANK([])).toBe("#VALUE!");
    });
});