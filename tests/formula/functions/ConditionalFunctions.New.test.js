import { describe, it, expect } from "vitest";
import { conditionalFunctions } from "@/plugins/formula/functions/conditional";

describe("Conditional Functions - IFERROR", () => {
    const IFERROR = conditionalFunctions.IFERROR;

    it("should return value when no error", () => {
        expect(IFERROR([10, "fallback"])).toBe(10);
    });

    it("should return fallback when value is #VALUE!", () => {
        expect(IFERROR(["#VALUE!", "fallback"])).toBe("fallback");
    });

    it("should return fallback when value is #N/A", () => {
        expect(IFERROR(["#N/A", "fallback"])).toBe("fallback");
    });

    it("should return fallback when value is #DIV/0!", () => {
        expect(IFERROR(["#DIV/0!", 0])).toBe(0);
    });

    it("should return fallback when value is #REF!", () => {
        expect(IFERROR(["#REF!", "error"])).toBe("error");
    });

    it("should return fallback when value is #NUM!", () => {
        expect(IFERROR(["#NUM!", 0])).toBe(0);
    });

    it("should return value when it is a normal string", () => {
        expect(IFERROR(["hello", "fallback"])).toBe("hello");
    });

    it("should return value when it is 0", () => {
        expect(IFERROR([0, "fallback"])).toBe(0);
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(IFERROR([])).toBe("#VALUE!");
        expect(IFERROR([1])).toBe("#VALUE!");
    });
});

describe("Conditional Functions - IFNA", () => {
    const IFNA = conditionalFunctions.IFNA;

    it("should return value when not #N/A", () => {
        expect(IFNA([10, "fallback"])).toBe(10);
    });

    it("should return fallback when value is #N/A", () => {
        expect(IFNA(["#N/A", "fallback"])).toBe("fallback");
    });

    it("should NOT return fallback for other errors", () => {
        expect(IFNA(["#VALUE!", "fallback"])).toBe("#VALUE!");
        expect(IFNA(["#DIV/0!", "fallback"])).toBe("#DIV/0!");
    });

    it("should return value when it is a normal string", () => {
        expect(IFNA(["hello", "fallback"])).toBe("hello");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(IFNA([])).toBe("#VALUE!");
        expect(IFNA([1])).toBe("#VALUE!");
    });
});