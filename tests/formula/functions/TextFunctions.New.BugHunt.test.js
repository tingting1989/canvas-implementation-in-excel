import { describe, it, expect } from "vitest";
import { textFunctions } from "@/plugins/formula/functions/text";

describe("Text Functions BugHunt - LEFT/RIGHT", () => {
    const LEFT = textFunctions.LEFT;
    const RIGHT = textFunctions.RIGHT;

    it("LEFT should handle null/undefined as empty string", () => {
        expect(LEFT([null, 1])).toBe("");
        expect(LEFT([undefined, 1])).toBe("");
    });

    it("RIGHT should handle null/undefined as empty string", () => {
        expect(RIGHT([null, 1])).toBe("");
        expect(RIGHT([undefined, 1])).toBe("");
    });

    it("LEFT should handle number as string", () => {
        expect(LEFT([12345, 2])).toBe("12");
    });

    it("RIGHT should handle number as string", () => {
        expect(RIGHT([12345, 2])).toBe("45");
    });

    it("LEFT with numChars > length returns full string", () => {
        expect(LEFT(["Hi", 100])).toBe("Hi");
    });

    it("RIGHT with numChars > length returns full string", () => {
        expect(RIGHT(["Hi", 100])).toBe("Hi");
    });
});

describe("Text Functions BugHunt - MID", () => {
    const MID = textFunctions.MID;

    it("should handle empty string", () => {
        expect(MID(["", 1, 1])).toBe("");
    });

    it("should handle null/undefined as empty string", () => {
        expect(MID([null, 1, 1])).toBe("");
    });

    it("should handle numChars = 0", () => {
        expect(MID(["Hello", 2, 0])).toBe("");
    });
});

describe("Text Functions BugHunt - FIND/SEARCH", () => {
    const FIND = textFunctions.FIND;
    const SEARCH = textFunctions.SEARCH;

    it("FIND should return 1 for match at start", () => {
        expect(FIND(["H", "Hello"])).toBe(1);
    });

    it("SEARCH should return 1 for match at start", () => {
        expect(SEARCH(["h", "Hello"])).toBe(1);
    });

    it("FIND should handle empty findText", () => {
        expect(FIND(["", "Hello"])).toBe(1);
    });

    it("SEARCH should handle empty findText", () => {
        expect(SEARCH(["", "Hello"])).toBe(1);
    });

    it("FIND with start position beyond match should return #VALUE!", () => {
        expect(FIND(["H", "Hello", 2])).toBe("#VALUE!");
    });
});

describe("Text Functions BugHunt - SUBSTITUTE", () => {
    const SUBSTITUTE = textFunctions.SUBSTITUTE;

    it("should handle empty oldText (return original)", () => {
        expect(SUBSTITUTE(["Hello", "", "X"])).toBe("Hello");
    });

    it("should handle empty newText (deletion)", () => {
        expect(SUBSTITUTE(["Hello", "l", ""])).toBe("Heo");
    });

    it("should handle instanceNum beyond occurrences", () => {
        expect(SUBSTITUTE(["Hello", "l", "L", 5])).toBe("Hello");
    });

    it("should handle replacement of entire string", () => {
        expect(SUBSTITUTE(["Hello", "Hello", "World"])).toBe("World");
    });
});

describe("Text Functions BugHunt - TEXT", () => {
    const TEXT = textFunctions.TEXT;

    it("should handle #,##0 format", () => {
        expect(TEXT([1234, "#,##0"])).toBe("1,234");
    });

    it("should handle #,##0.00 format", () => {
        expect(TEXT([1234.5, "#,##0.00"])).toBe("1,234.50");
    });

    it("should handle 0.000 format", () => {
        expect(TEXT([3.14, "0.000"])).toBe("3.140");
    });

    it("should handle negative number", () => {
        expect(TEXT([-3.7, "0"])).toBe("-4");
    });

    it("should handle zero", () => {
        expect(TEXT([0, "0.00"])).toBe("0.00");
    });
});