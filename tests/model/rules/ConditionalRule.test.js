import { describe, it, expect, vi } from "vitest";
import { ConditionalRule } from "@/model/rules/ConditionalRule";
import { Cell } from "@/model/store/Cell";

describe("ConditionalRule - match", () => {
    it("should match when in range and condition is true", () => {
        const rule = new ConditionalRule(
            { sr: 0, sc: 0, er: 5, ec: 5 },
            (value) => value > 10,
            1,
        );
        const cell = new Cell(15);
        expect(rule.match(2, 3, cell)).toBe(true);
    });

    it("should not match when condition is false", () => {
        const rule = new ConditionalRule(
            { sr: 0, sc: 0, er: 5, ec: 5 },
            (value) => value > 10,
            1,
        );
        const cell = new Cell(5);
        expect(rule.match(2, 3, cell)).toBe(false);
    });

    it("should not match when row is out of range", () => {
        const rule = new ConditionalRule(
            { sr: 0, sc: 0, er: 5, ec: 5 },
            () => true,
            1,
        );
        expect(rule.match(6, 3, new Cell(1))).toBe(false);
    });

    it("should not match when col is out of range", () => {
        const rule = new ConditionalRule(
            { sr: 0, sc: 0, er: 5, ec: 5 },
            () => true,
            1,
        );
        expect(rule.match(3, 6, new Cell(1))).toBe(false);
    });

    it("should match boundary rows and cols", () => {
        const rule = new ConditionalRule(
            { sr: 2, sc: 3, er: 5, ec: 7 },
            () => true,
            1,
        );
        expect(rule.match(2, 3, new Cell(1))).toBe(true);
        expect(rule.match(5, 7, new Cell(1))).toBe(true);
    });

    it("should handle null cell gracefully", () => {
        const rule = new ConditionalRule(
            { sr: 0, sc: 0, er: 5, ec: 5 },
            (value) => value === undefined,
            1,
        );
        expect(rule.match(2, 3, null)).toBe(true);
    });

    it("should pass cell object to condition function", () => {
        const conditionFn = vi.fn().mockReturnValue(true);
        const rule = new ConditionalRule(
            { sr: 0, sc: 0, er: 5, ec: 5 },
            conditionFn,
            1,
        );
        const cell = new Cell(42);
        cell.disabled = true;
        rule.match(2, 3, cell);
        expect(conditionFn).toHaveBeenCalledWith(42, cell);
    });
});

describe("ConditionalRule - styleId", () => {
    it("should store styleId", () => {
        const rule = new ConditionalRule(
            { sr: 0, sc: 0, er: 5, ec: 5 },
            () => true,
            42,
        );
        expect(rule.styleId).toBe(42);
    });
});

describe("ConditionalRule - range", () => {
    it("should store range", () => {
        const range = { sr: 1, sc: 2, er: 10, ec: 20 };
        const rule = new ConditionalRule(range, () => true, 1);
        expect(rule.range).toEqual(range);
    });
});