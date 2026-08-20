import { describe, it, expect } from "vitest";
import { statisticalFunctions } from "@/plugins/formula/functions/statistical";

describe("Statistical Functions BugHunt - STDEV/STDEVP", () => {
    const STDEV = statisticalFunctions.STDEV;
    const STDEVP = statisticalFunctions.STDEVP;

    it("STDEV should handle two values", () => {
        expect(STDEV([1, 3])).toBeCloseTo(Math.sqrt(2), 5);
    });

    it("STDEVP should handle two values", () => {
        expect(STDEVP([1, 3])).toBeCloseTo(1.0, 5);
    });

    it("STDEV should handle nested arrays", () => {
        expect(STDEV([[1, 3], [5, 7]])).toBeCloseTo(2.5819, 3);
    });

    it("STDEVP should return #DIV/0! for empty after filtering", () => {
        expect(STDEVP(["a", "b"])).toBe("#DIV/0!");
    });
});

describe("Statistical Functions BugHunt - VAR/VARP", () => {
    const VAR = statisticalFunctions.VAR;
    const VARP = statisticalFunctions.VARP;

    it("VAR should handle two values", () => {
        expect(VAR([1, 3])).toBeCloseTo(2.0, 5);
    });

    it("VARP should handle two values", () => {
        expect(VARP([1, 3])).toBeCloseTo(1.0, 5);
    });

    it("VAR should return #DIV/0! for all non-numeric", () => {
        expect(VAR(["a", "b"])).toBe("#DIV/0!");
    });
});

describe("Statistical Functions BugHunt - MEDIAN", () => {
    const MEDIAN = statisticalFunctions.MEDIAN;

    it("should handle even number of values", () => {
        expect(MEDIAN([1, 2, 3, 4, 5, 6])).toBe(3.5);
    });

    it("should handle negative values", () => {
        expect(MEDIAN([-5, -3, -1])).toBe(-3);
    });

    it("should handle mixed positive and negative", () => {
        expect(MEDIAN([-2, 0, 2])).toBe(0);
    });

    it("should handle nested arrays", () => {
        expect(MEDIAN([[1, 3], [5, 7]])).toBe(4);
    });
});

describe("Statistical Functions BugHunt - RANK", () => {
    const RANK = statisticalFunctions.RANK;

    it("should handle duplicate values correctly", () => {
        expect(RANK([5, [5, 5, 3]])).toBe(1);
    });

    it("should handle ascending order with duplicates", () => {
        expect(RANK([5, [5, 5, 3], 1])).toBe(2);
    });

    it("should return correct ascending rank", () => {
        expect(RANK([3, [7, 5, 3, 1], 1])).toBe(2);
    });

    it("should handle floating point comparison", () => {
        expect(RANK([1.5, [1, 1.5, 2]])).toBe(2);
    });

    it("should handle all same values", () => {
        expect(RANK([5, [5, 5, 5]])).toBe(1);
    });

    it("should handle single element range", () => {
        expect(RANK([5, [5]])).toBe(1);
    });

    it("should return #N/A for value not in range", () => {
        expect(RANK([99, [1, 2, 3]])).toBe("#N/A");
    });
});