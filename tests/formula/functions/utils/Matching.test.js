import { describe, it, expect } from "vitest";
import { _matchCriteria, _matchWildcard } from "@/formula/functions/utils/matching";

describe("Utils - _matchCriteria - Comparison Operators", () => {
    it("should match > (greater than)", () => {
        expect(_matchCriteria(150, ">100")).toBe(true);
        expect(_matchCriteria(50, ">100")).toBe(false);
    });

    it("should match < (less than)", () => {
        expect(_matchCriteria(50, "<100")).toBe(true);
        expect(_matchCriteria(150, "<100")).toBe(false);
    });

    it("should match >= (greater or equal)", () => {
        expect(_matchCriteria(100, ">=100")).toBe(true);
        expect(_matchCriteria(101, ">=100")).toBe(true);
        expect(_matchCriteria(99, ">=100")).toBe(false);
    });

    it("should match <= (less or equal)", () => {
        expect(_matchCriteria(100, "<=100")).toBe(true);
        expect(_matchCriteria(99, "<=100")).toBe(true);
        expect(_matchCriteria(101, "<=100")).toBe(false);
    });

    it("should match = (equal)", () => {
        expect(_matchCriteria(100, "=100")).toBe(true);
        expect(_matchCriteria(99, "=100")).toBe(false);
    });

    it("should match <> (not equal)", () => {
        expect(_matchCriteria(99, "<>100")).toBe(true);
        expect(_matchCriteria(100, "<>100")).toBe(false);
    });
});

describe("Utils - _matchCriteria - Text Comparison", () => {
    it("should compare text with > operator", () => {
        expect(_matchCriteria("banana", ">apple")).toBe(true);
        expect(_matchCriteria("apple", ">banana")).toBe(false);
    });

    it("should compare text with < operator", () => {
        expect(_matchCriteria("apple", "<banana")).toBe(true);
    });

    it("should match text equality with =", () => {
        expect(_matchCriteria("hello", "=hello")).toBe(true);
        expect(_matchCriteria("hello", "=world")).toBe(false);
    });

    it("should match text inequality with <>", () => {
        expect(_matchCriteria("hello", "<>world")).toBe(true);
        expect(_matchCriteria("hello", "<>hello")).toBe(false);
    });
});

describe("Utils - _matchCriteria - Numeric Direct Match", () => {
    it("should match numeric criteria directly", () => {
        expect(_matchCriteria(100, 100)).toBe(true);
        expect(_matchCriteria(100, 99)).toBe(false);
    });

    it("should handle floating point precision", () => {
        expect(_matchCriteria(0.1 + 0.2, 0.3)).toBe(true);
    });

    it("should not match string value against numeric criteria", () => {
        expect(_matchCriteria("100", 100)).toBe(false);
    });
});

describe("Utils - _matchCriteria - Text Exact Match", () => {
    it("should match exact text string", () => {
        expect(_matchCriteria("apple", "apple")).toBe(true);
        expect(_matchCriteria("apple", "Apple")).toBe(false);
    });

    it("should be case-sensitive for text matching", () => {
        expect(_matchCriteria("Hello", "HELLO")).toBe(false);
    });
});

describe("Utils - _matchCriteria - Wildcard Matching", () => {
    it("should match * wildcard (any chars)", () => {
        expect(_matchCriteria("apple", "*pple")).toBe(true);
        expect(_matchCriteria("apple", "app*")).toBe(true);
        expect(_matchCriteria("apple", "*a*")).toBe(true);
    });

    it("should match ? wildcard (single char)", () => {
        expect(_matchCriteria("apple", "appl?")).toBe(true);
        expect(_matchCriteria("apple", "?pple")).toBe(true);
        expect(_matchCriteria("apple", "?????")).toBe(true);
        expect(_matchCriteria("apple", "???")).toBe(false);
    });

    it("should match * alone (matches everything)", () => {
        expect(_matchCriteria("", "*")).toBe(true);
        expect(_matchCriteria("anything", "*")).toBe(true);
    });
});

describe("Utils - _matchCriteria - Null/Undefined Handling", () => {
    it("should match null/undefined with null/undefined criteria", () => {
        expect(_matchCriteria(null, null)).toBe(true);
        expect(_matchCriteria(undefined, undefined)).toBe(true);
        expect(_matchCriteria(null, undefined)).toBe(true);
        expect(_matchCriteria(undefined, null)).toBe(true);
    });

    it("should not match non-null value with null criteria", () => {
        expect(_matchCriteria(0, null)).toBe(false);
        expect(_matchCriteria("", null)).toBe(false);
    });

    it("should not match null value with non-null criteria", () => {
        expect(_matchCriteria(null, "")).toBe(false);
        expect(_matchCriteria(null, 0)).toBe(false);
    });
});

describe("Utils - _matchCriteria - Empty String Criteria", () => {
    it("should match empty/null/undefined values with empty string criteria", () => {
        expect(_matchCriteria("", "")).toBe(true);
        expect(_matchCriteria(null, "")).toBe(true);
        expect(_matchCriteria(undefined, "")).toBe(true);
    });

    it("should not match non-empty value with empty string criteria", () => {
        expect(_matchCriteria("hello", "")).toBe(false);
        expect(_matchCriteria(0, "")).toBe(false);
    });
});

describe("Utils - _matchCriteria - Edge Cases", () => {
    it("should handle boolean true as truthy value", () => {
        expect(_matchCriteria(true, true)).toBe(true);
    });

    it("should handle boolean false as value", () => {
        expect(_matchCriteria(false, false)).toBe(true);
    });

    it("should handle zero value correctly", () => {
        expect(_matchCriteria(0, "=0")).toBe(true);
        expect(_matchCriteria(0, ">0")).toBe(false);
        expect(_matchCriteria(0, "<0")).toBe(false);
    });

    it("should handle negative numbers", () => {
        expect(_matchCriteria(-5, "<0")).toBe(true);
        expect(_matchCriteria(-5, ">-10")).toBe(true);
    });

    it("should handle decimal comparisons", () => {
        expect(_matchCriteria(3.14159, ">3.14")).toBe(true);
        expect(_matchCriteria(3.14, ">=3.14000001")).toBe(false);
    });
});

describe("Utils - _matchWildcard", () => {
    it("should match simple wildcard patterns", () => {
        expect(_matchWildcard("apple", "app*")).toBe(true);
        expect(_matchWildcard("apple", "*ple")).toBe(true);
        expect(_matchWildcard("apple", "*p*")).toBe(true);
    });

    it("should match single-char wildcard", () => {
        expect(_matchWildcard("abc", "a?c")).toBe(true);
        expect(_matchWildcard("ac", "a?c")).toBe(false);
        expect(_matchWildcard("abcd", "a??d")).toBe(true);
    });

    it("should be case-insensitive", () => {
        expect(_matchWildcard("Apple", "APP*")).toBe(true);
        expect(_matchWildcard("APPLE", "*le")).toBe(true);
    });

    it("should match exact pattern without wildcards", () => {
        expect(_matchWildcard("exact", "exact")).toBe(true);
        expect(_matchWildcard("exact", "exat")).toBe(false);
    });

    it("should escape regex special characters", () => {
        expect(_matchWildcard("a.b", "a.b")).toBe(true);
        expect(_matchWildcard("a+b", "a+b")).toBe(true);
        expect(_matchWildcard("a(b)c", "a(b)c")).toBe(true);
    });

    it("should handle empty pattern", () => {
        expect(_matchWildcard("", "")).toBe(true);
        expect(_matchWildcard("a", "")).toBe(false);
    });

    it("should match * to everything including empty", () => {
        expect(_matchWildcard("", "*")).toBe(true);
        expect(_matchWildcard("anything goes", "*")).toBe(true);
    });

    it("should handle complex mixed patterns", () => {
        expect(_matchWildcard("hello world test 123", "h*o w*st *3")).toBe(true);
        expect(_matchWildcard("file_2024_05.txt", "file_*_*.txt")).toBe(true);
    });
});