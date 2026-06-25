import { describe, it, expect } from "vitest";
import { textFunctions } from "@/formula/functions/text";

describe("Text Functions - UPPER", () => {
    const UPPER = textFunctions.UPPER;

    it("should convert to uppercase", () => {
        expect(UPPER(["hello"])).toBe("HELLO");
    });

    it("should handle already uppercase", () => {
        expect(UPPER(["HELLO"])).toBe("HELLO");
    });

    it("should handle mixed case", () => {
        expect(UPPER(["Hello World"])).toBe("HELLO WORLD");
    });

    it("should handle empty string", () => {
        expect(UPPER([""])).toBe("");
    });

    it("should convert null/undefined to empty string", () => {
        expect(UPPER([null])).toBe("");
        expect(UPPER([undefined])).toBe("");
    });

    it("should convert numbers to string then uppercase", () => {
        expect(UPPER([123])).toBe("123");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(UPPER([])).toBe("#VALUE!");
        expect(UPPER(["a", "b"])).toBe("#VALUE!");
    });
});

describe("Text Functions - LOWER", () => {
    const LOWER = textFunctions.LOWER;

    it("should convert to lowercase", () => {
        expect(LOWER(["HELLO"])).toBe("hello");
    });

    it("should handle already lowercase", () => {
        expect(LOWER(["hello"])).toBe("hello");
    });

    it("should handle mixed case", () => {
        expect(LOWER(["Hello World"])).toBe("hello world");
    });

    it("should handle empty string", () => {
        expect(LOWER([""])).toBe("");
    });

    it("should convert null/undefined to empty string", () => {
        expect(LOWER([null])).toBe("");
        expect(LOWER([undefined])).toBe("");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(LOWER([])).toBe("#VALUE!");
    });
});

describe("Text Functions - CONCAT", () => {
    const CONCAT = textFunctions.CONCAT;

    it("should concatenate strings", () => {
        expect(CONCAT(["Hello", " ", "World"])).toBe("Hello World");
    });

    it("should concatenate two strings", () => {
        expect(CONCAT(["foo", "bar"])).toBe("foobar");
    });

    it("should concatenate single value", () => {
        expect(CONCAT(["only"])).toBe("only");
    });

    it("should convert numbers to strings", () => {
        expect(CONCAT([1, 2, 3])).toBe("123");
    });

    it("should treat null as empty string", () => {
        expect(CONCAT(["a", null, "b"])).toBe("ab");
    });

    it("should return empty string for single empty arg", () => {
        expect(CONCAT([""])).toBe("");
    });

    it("should return #VALUE! for no args", () => {
        expect(CONCAT([])).toBe("#VALUE!");
    });
});

describe("Text Functions - CONCATENATE", () => {
    const CONCATENATE = textFunctions.CONCATENATE;

    it("should behave same as CONCAT", () => {
        expect(CONCATENATE(["a", "-", "b"])).toBe("a-b");
    });

    it("should concatenate with numbers", () => {
        expect(CONCATENATE(["Value: ", 42])).toBe("Value: 42");
    });

    it("should return #VALUE! for no args", () => {
        expect(CONCATENATE([])).toBe("#VALUE!");
    });
});