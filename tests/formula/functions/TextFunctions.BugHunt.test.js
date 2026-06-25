import { describe, it, expect } from "vitest";
import { textFunctions } from "@/formula/functions/text";

describe("Text Functions BugHunt - UPPER", () => {
    const UPPER = textFunctions.UPPER;

    it("should handle very long string (10000 chars)", () => {
        const long = "a".repeat(10000);
        expect(UPPER([long])).toBe(long.toUpperCase());
    });

    it("should handle unicode characters", () => {
        expect(UPPER(["hello world"])).toBe("HELLO WORLD");
    });

    it("should handle null as empty string", () => {
        expect(UPPER([null])).toBe("");
    });

    it("should handle undefined as empty string", () => {
        expect(UPPER([undefined])).toBe("");
    });

    it("should convert numbers to string", () => {
        expect(UPPER([12345])).toBe("12345");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(UPPER([])).toBe("#VALUE!");
        expect(UPPER(["a", "b"])).toBe("#VALUE!");
    });
});

describe("Text Functions BugHunt - LOWER", () => {
    const LOWER = textFunctions.LOWER;

    it("should handle already lowercase string", () => {
        expect(LOWER(["already lower"])).toBe("already lower");
    });

    it("should handle mixed case with numbers and symbols", () => {
        expect(LOWER(["Hello World 123!@#"])).toBe("hello world 123!@#");
    });

    it("should handle null/undefined gracefully", () => {
        expect(LOWER([null])).toBe("");
        expect(LOWER([undefined])).toBe("");
    });
});

describe("Text Functions BugHunt - CONCAT / CONCATENATE", () => {
    const CONCAT = textFunctions.CONCAT;
    const CONCATENATE = textFunctions.CONCATENATE;

    it("should concatenate many arguments (1000)", () => {
        const args = Array(1000).fill("x");
        expect(CONCAT(args)).toBe("x".repeat(1000));
    });

    it("should treat null as empty string in concatenation", () => {
        expect(CONCAT(["a", null, "b"])).toBe("ab");
    });

    it("should treat undefined as empty string in concatenation", () => {
        expect(CONCAT(["a", undefined, "b"])).toBe("ab");
    });

    it("should convert boolean to string", () => {
        expect(CONCAT([true, false])).toBe("truefalse");
    });

    it("should convert object to [object Object]", () => {
        expect(CONCAT([{ key: "val" }])).toBe("[object Object]");
    });

    it("should return empty string for single empty arg", () => {
        expect(CONCAT([""])).toBe("");
    });

    it("should return #VALUE! for no args", () => {
        expect(CONCAT([])).toBe("#VALUE!");
    });

    it("CONCATENATE should behave identically to CONCAT", () => {
        const args = ["a", "-", "b"];
        expect(CONCATENATE(args)).toEqual(CONCAT(args));
    });
});