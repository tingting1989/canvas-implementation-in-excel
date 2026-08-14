import { describe, it, expect } from "vitest";
import { ConditionalRule } from "@/model/rules/ConditionalRule";
import { Cell } from "@/model/store/Cell";

describe("ConditionalRule - constructor", () => {
    it("should create a rule with range, condition and styleId", () => {
        const rule = new ConditionalRule(
            { topRow: 0, topCol: 0, bottomRow: 5, bottomCol: 5 },
            (value) => typeof value === "number" && value > 100,
            1
        );
        expect(rule.range).toEqual({ topRow: 0, topCol: 0, bottomRow: 5, bottomCol: 5 });
        expect(rule.styleId).toBe(1);
    });
});

describe("ConditionalRule - match", () => {
    it("should match cell within range that satisfies condition", () => {
        const rule = new ConditionalRule(
            { topRow: 0, topCol: 0, bottomRow: 5, bottomCol: 5 },
            (value) => typeof value === "number" && value > 100,
            1
        );
        const cell = new Cell(150);
        expect(rule.match(2, 3, cell)).toBe(true);
    });

    it("should not match cell outside range", () => {
        const rule = new ConditionalRule(
            { topRow: 0, topCol: 0, bottomRow: 5, bottomCol: 5 },
            (value) => typeof value === "number" && value > 100,
            1
        );
        const cell = new Cell(150);
        expect(rule.match(10, 10, cell)).toBe(false);
    });

    it("should not match cell that does not satisfy condition", () => {
        const rule = new ConditionalRule(
            { topRow: 0, topCol: 0, bottomRow: 5, bottomCol: 5 },
            (value) => typeof value === "number" && value > 100,
            1
        );
        const cell = new Cell(50);
        expect(rule.match(2, 3, cell)).toBe(false);
    });

    it("should handle null/undefined cell", () => {
        const rule = new ConditionalRule(
            { topRow: 0, topCol: 0, bottomRow: 5, bottomCol: 5 },
            (value) => value != null,
            1
        );
        expect(rule.match(2, 3, null)).toBe(false);
        expect(rule.match(2, 3, undefined)).toBe(false);
    });

    it("should match on range boundary", () => {
        const rule = new ConditionalRule(
            { topRow: 0, topCol: 0, bottomRow: 5, bottomCol: 5 },
            () => true,
            1
        );
        const cell = new Cell("any");
        expect(rule.match(0, 0, cell)).toBe(true);
        expect(rule.match(5, 5, cell)).toBe(true);
    });
});