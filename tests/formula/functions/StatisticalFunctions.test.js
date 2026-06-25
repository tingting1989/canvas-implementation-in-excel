import { describe, it, expect } from "vitest";
import { statisticalFunctions } from "@/formula/functions/statistical";

describe("Statistical Functions - COUNT", () => {
    const COUNT = statisticalFunctions.COUNT;

    it("should count numeric values", () => {
        expect(COUNT([1, "a", 3, "", 5])).toBe(3);
    });

    it("should count all numbers", () => {
        expect(COUNT([1, 2, 3, 4, 5])).toBe(5);
    });

    it("should return 0 for no numeric values", () => {
        expect(COUNT(["a", "b", "c"])).toBe(0);
    });

    it("should handle nested arrays (ranges)", () => {
        expect(COUNT([[1, 2], ["a", 4]])).toBe(3);
    });

    it("should count decimal numbers", () => {
        expect(COUNT([1.5, 2.7, "x"])).toBe(2);
    });

    it("should not count null/undefined as numbers", () => {
        expect(COUNT([1, null, undefined, 2])).toBe(2);
    });

    it("should not count booleans as numbers", () => {
        expect(COUNT([true, false, 1])).toBe(1);
    });

    it("should return #VALUE! for empty args", () => {
        expect(COUNT([])).toBe("#VALUE!");
    });
});

describe("Statistical Functions - COUNTA", () => {
    const COUNTA = statisticalFunctions.COUNTA;

    it("should count non-empty values", () => {
        expect(COUNTA([1, "", "text", null])).toBe(2);
    });

    it("should count all non-null/non-empty/non-undefined", () => {
        expect(COUNTA(["a", 0, false, true, " "])).toBe(5);
    });

    it("should return 0 for all-empty input", () => {
        expect(COUNTA(["", null, undefined])).toBe(0);
    });

    it("should handle nested arrays", () => {
        expect(COUNTA([[1, ""], [null, "a"]])).toBe(2);
    });

    it("should count zero as non-empty", () => {
        expect(COUNTA([0, 0, 0])).toBe(3);
    });

    it("should count false as non-empty", () => {
        expect(COUNTA([false, false])).toBe(2);
    });

    it("should return #VALUE! for empty args", () => {
        expect(COUNTA([])).toBe("#VALUE!");
    });
});

describe("Statistical Functions - COUNTBLANK", () => {
    const COUNTBLANK = statisticalFunctions.COUNTBLANK;

    it("should count empty strings", () => {
        expect(COUNTBLANK([[""], ["a"]])).toBe(1);
    });

    it("should count null values", () => {
        const range = [["", null]];
        expect(COUNTBLANK([range])).toBe(2);
    });

    it("should count undefined values", () => {
        const range = [[undefined], ["x"]];
        expect(COUNTBLANK([range])).toBe(1);
    });

    it("should count multiple blank types together", () => {
        const range = [["", null, undefined, "hello"]];
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

    it("should handle flat array (non-range)", () => {
        const range = ["", "a", null];
        expect(COUNTBLANK([range])).toBe(2);
    });

    it("should return #VALUE! for empty args", () => {
        expect(COUNTBLANK([])).toBe("#VALUE!");
    });

    it("should count blanks across multiple arguments", () => {
        expect(COUNTBLANK(["a", "b"])).toBe(0);
        expect(COUNTBLANK(["", "a"])).toBe(1);
        expect(COUNTBLANK(["", null])).toBe(2);
    });
});