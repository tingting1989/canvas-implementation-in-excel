import { describe, it, expect } from "vitest";
import { textFunctions } from "@/plugins/formula/functions/text";

describe("Text Functions - LEFT", () => {
    const LEFT = textFunctions.LEFT;

    it("should return first character by default", () => {
        expect(LEFT(["Hello"])).toBe("H");
    });

    it("should return first N characters", () => {
        expect(LEFT(["Hello", 3])).toBe("Hel");
    });

    it("should return entire string if N >= length", () => {
        expect(LEFT(["Hi", 5])).toBe("Hi");
    });

    it("should return empty string for 0 chars", () => {
        expect(LEFT(["Hello", 0])).toBe("");
    });

    it("should handle empty string", () => {
        expect(LEFT([""])).toBe("");
    });

    it("should return #VALUE! for negative num_chars", () => {
        expect(LEFT(["Hello", -1])).toBe("#VALUE!");
    });

    it("should return #VALUE! for no args", () => {
        expect(LEFT([])).toBe("#VALUE!");
    });
});

describe("Text Functions - RIGHT", () => {
    const RIGHT = textFunctions.RIGHT;

    it("should return last character by default", () => {
        expect(RIGHT(["Hello"])).toBe("o");
    });

    it("should return last N characters", () => {
        expect(RIGHT(["Hello", 3])).toBe("llo");
    });

    it("should return entire string if N >= length", () => {
        expect(RIGHT(["Hi", 5])).toBe("Hi");
    });

    it("should return empty string for 0 chars", () => {
        expect(RIGHT(["Hello", 0])).toBe("");
    });

    it("should return #VALUE! for negative num_chars", () => {
        expect(RIGHT(["Hello", -1])).toBe("#VALUE!");
    });

    it("should return #VALUE! for no args", () => {
        expect(RIGHT([])).toBe("#VALUE!");
    });
});

describe("Text Functions - MID", () => {
    const MID = textFunctions.MID;

    it("should extract from middle", () => {
        expect(MID(["Hello", 2, 3])).toBe("ell");
    });

    it("should extract from start position 1", () => {
        expect(MID(["Hello", 1, 2])).toBe("He");
    });

    it("should handle start beyond string length", () => {
        expect(MID(["Hi", 5, 2])).toBe("");
    });

    it("should handle numChars exceeding remaining", () => {
        expect(MID(["Hello", 3, 10])).toBe("llo");
    });

    it("should return #VALUE! for start < 1", () => {
        expect(MID(["Hello", 0, 2])).toBe("#VALUE!");
    });

    it("should return #VALUE! for negative numChars", () => {
        expect(MID(["Hello", 1, -1])).toBe("#VALUE!");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(MID(["Hello", 2])).toBe("#VALUE!");
    });
});

describe("Text Functions - LEN", () => {
    const LEN = textFunctions.LEN;

    it("should return string length", () => {
        expect(LEN(["Hello"])).toBe(5);
    });

    it("should return 0 for empty string", () => {
        expect(LEN([""])).toBe(0);
    });

    it("should handle numbers as strings", () => {
        expect(LEN([123])).toBe(3);
    });

    it("should return #VALUE! for no args", () => {
        expect(LEN([])).toBe("#VALUE!");
    });
});

describe("Text Functions - TRIM", () => {
    const TRIM = textFunctions.TRIM;

    it("should trim leading and trailing spaces", () => {
        expect(TRIM(["  Hello  "])).toBe("Hello");
    });

    it("should not trim internal spaces", () => {
        expect(TRIM(["Hello World"])).toBe("Hello World");
    });

    it("should handle string with only spaces", () => {
        expect(TRIM(["   "])).toBe("");
    });

    it("should return #VALUE! for no args", () => {
        expect(TRIM([])).toBe("#VALUE!");
    });
});

describe("Text Functions - FIND", () => {
    const FIND = textFunctions.FIND;

    it("should find substring position", () => {
        expect(FIND(["l", "Hello"])).toBe(3);
    });

    it("should be case-sensitive", () => {
        expect(FIND(["L", "Hello"])).toBe("#VALUE!");
    });

    it("should find with start position", () => {
        expect(FIND(["l", "Hello", 4])).toBe(4);
    });

    it("should return #VALUE! when not found", () => {
        expect(FIND(["z", "Hello"])).toBe("#VALUE!");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(FIND(["a"])).toBe("#VALUE!");
    });
});

describe("Text Functions - SEARCH", () => {
    const SEARCH = textFunctions.SEARCH;

    it("should find substring position case-insensitive", () => {
        expect(SEARCH(["L", "Hello"])).toBe(3);
    });

    it("should find with start position", () => {
        expect(SEARCH(["l", "Hello", 4])).toBe(4);
    });

    it("should return #VALUE! when not found", () => {
        expect(SEARCH(["z", "Hello"])).toBe("#VALUE!");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(SEARCH(["a"])).toBe("#VALUE!");
    });
});

describe("Text Functions - SUBSTITUTE", () => {
    const SUBSTITUTE = textFunctions.SUBSTITUTE;

    it("should replace all occurrences by default", () => {
        expect(SUBSTITUTE(["Hello World", "o", "0"])).toBe("Hell0 W0rld");
    });

    it("should replace specific instance only", () => {
        expect(SUBSTITUTE(["Hello World", "o", "0", 1])).toBe("Hell0 World");
    });

    it("should replace second instance", () => {
        expect(SUBSTITUTE(["Hello World", "o", "0", 2])).toBe("Hello W0rld");
    });

    it("should return original if old text not found", () => {
        expect(SUBSTITUTE(["Hello", "z", "0"])).toBe("Hello");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(SUBSTITUTE(["Hello", "o"])).toBe("#VALUE!");
    });
});

describe("Text Functions - TEXT", () => {
    const TEXT = textFunctions.TEXT;

    it("should format with 0 pattern", () => {
        expect(TEXT([3.7, "0"])).toBe("4");
    });

    it("should format with 0.00 pattern", () => {
        expect(TEXT([3.14159, "0.00"])).toBe("3.14");
    });

    it("should format with percent pattern", () => {
        expect(TEXT([0.25, "0%"])).toBe("25%");
    });

    it("should format with 0.00% pattern", () => {
        expect(TEXT([0.255, "0.00%"])).toBe("25.50%");
    });

    it("should return #VALUE! for no args", () => {
        expect(TEXT([])).toBe("#VALUE!");
    });

    it("should handle string value without format", () => {
        expect(TEXT(["hello", "0"])).toBe("hello");
    });
});