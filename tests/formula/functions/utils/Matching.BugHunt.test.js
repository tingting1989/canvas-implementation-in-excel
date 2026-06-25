import { describe, it, expect } from "vitest";
import { _matchCriteria, _matchWildcard } from "@/formula/functions/utils/matching";

describe("Utils BugHunt - _matchCriteria - Operator abuse", () => {
    it("should handle > with very large number", () => {
        expect(_matchCriteria(Number.MAX_SAFE_INTEGER, ">0")).toBe(true);
    });

    it("should handle < with very small number", () => {
        expect(_matchCriteria(-Number.MAX_SAFE_INTEGER, "<0")).toBe(true);
    });

    it("should handle >= with equal boundary", () => {
        expect(_matchCriteria(Number.MAX_VALUE, ">=Number.MAX_VALUE")).toBe(false);
        expect(_matchCriteria(100, ">=100")).toBe(true);
    });

    it("should handle <= with equal boundary", () => {
        expect(_matchCriteria(100, "<=100")).toBe(true);
    });

    it("should handle = comparison with floating point precision edge", () => {
        expect(_matchCriteria(0.1 + 0.2, "=0.3")).toBe(true);
    });
});

describe("Utils BugHunt - _matchCriteria - Text operator abuse", () => {
    it("should compare text lexicographically with >", () => {
        expect(_matchCriteria("z", ">a")).toBe(true);
        expect(_matchCriteria("a", ">z")).toBe(false);
    });

    it("should handle empty string in comparisons", () => {
        expect(_matchCriteria("", ">=")).toBe(false);
        expect(_matchCriteria("", "<=")).toBe(false);
    });

    it("should match exact string case-sensitively", () => {
        expect(_matchCriteria("Hello", "Hello")).toBe(true);
        expect(_matchCriteria("hello", "Hello")).toBe(false);
    });
});

describe("Utils BugHunt - _matchCriteria - Null/undefined abuse", () => {
    it("should not match null against numeric criteria", () => {
        expect(_matchCriteria(null, 0)).toBe(false);
        expect(_matchCriteria(null, ">0")).toBe(false);
    });

    it("should not match undefined against any non-null/undefined criteria", () => {
        expect(_matchCriteria(undefined, "")).toBe(true);
        expect(_matchCriteria(undefined, null)).toBe(true);
        expect(_matchCriteria(undefined, 0)).toBe(false);
    });

    it("should match null against null criteria only", () => {
        expect(_matchCriteria(null, null)).toBe(true);
        expect(_matchCriteria(null, undefined)).toBe(true);
    });
});

describe("Utils BugHunt - _matchCriteria - Type coercion edge cases", () => {
    it("should coerce boolean true to 1 for direct match", () => {
        expect(_matchCriteria(true, 1)).toBe(true);
    });

    it("should not coerce string '123' to 123 for direct match", () => {
        expect(_matchCriteria("123", 123)).toBe(false);
    });

    it("should treat zero as falsy but still a value (not blank)", () => {
        expect(_matchCriteria(0, 0)).toBe(true);
    });

    it("should handle Infinity as a value", () => {
        expect(_matchCriteria(Infinity, ">0")).toBe(true);
        expect(_matchCriteria(-Infinity, "<0")).toBe(true);
    });
});

describe("Utils BugHunt - _matchWildcard - Pattern abuse", () => {
    it("should escape regex special characters in pattern", () => {
        expect(_matchWildcard("a.b.c", "a.b.c")).toBe(true);
        expect(_matchWildcard("a+b+c", "a+b+c")).toBe(true);
        expect(_matchWildcard("(abc)", "(abc)")).toBe(true);
        expect(_matchWildcard("$100", "$100")).toBe(true);
        expect(_matchWildcard("^start", "^start")).toBe(true);
        expect(_matchWildcard("end$", "end$")).toBe(true);
    });

    it("should be case-insensitive", () => {
        expect(_matchWildcard("HELLO WORLD", "hello world")).toBe(true);
        expect(_matchWildcard("HelloWorld", "helloworld")).toBe(true);
    });

    it("should handle empty pattern matching only empty input", () => {
        expect(_matchWildcard("", "")).toBe(true);
        expect(_matchWildcard("a", "")).toBe(false);
    });

    it("should handle * matching everything including empty", () => {
        expect(_matchWildcard("", "*")).toBe(true);
        expect(_matchWildcard("anything at all!@#$%", "*")).toBe(true);
    });

    it("should handle multiple consecutive wildcards", () => {
        expect(_matchWildcard("test", "****")).toBe(true);
        expect(_matchWildcard("", "****")).toBe(true);
    });

    it("should handle ? matching exactly one character", () => {
        expect(_matchWildcard("a", "?")).toBe(true);
        expect(_matchWildcard("", "?")).toBe(false);
        expect(_matchWildcard("ab", "?")).toBe(false);
    });

    it("should handle complex real-world patterns", () => {
        expect(_matchWildcard("invoice_2024_05.pdf", "invoice_*_*.pdf")).toBe(true);
        expect(_matchWildcard("IMG_2024-06-24_001.jpg", "IMG_*_*.jpg")).toBe(true);
        expect(_matchWildcard("file.txt", "*.csv")).toBe(false);
    });

    it("should handle very long input and pattern", () => {
        const longInput = "a".repeat(10000);
        expect(_matchWildcard(longInput, "*")).toBe(true);
        expect(_matchWildcard(longInput, longInput)).toBe(true);
    });

    it("should handle pattern with many wildcards", () => {
        const pattern = Array(500).join("?*");
        const input = "x".repeat(250) + "y".repeat(250);
        expect(() => _matchWildcard(input, pattern)).not.toThrow();
    });
});