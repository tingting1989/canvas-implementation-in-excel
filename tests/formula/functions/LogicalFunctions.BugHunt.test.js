import { describe, it, expect } from "vitest";
import { logicalFunctions } from "@/formula/functions/logical";

describe("Logical Functions BugHunt - IF", () => {
    const IF = logicalFunctions.IF;

    it("should return false as default when only 2 args and condition is falsy", () => {
        expect(IF([false, "yes"])).toBe(false);
    });

    it("should return true_value when condition is 1", () => {
        expect(IF([1, "yes", "no"])).toBe("yes");
    });

    it("should return false_value when condition is 0", () => {
        expect(IF([0, "yes", "no"])).toBe("no");
    });

    it("should treat -1 as truthy", () => {
        expect(IF([-1, "yes", "no"])).toBe("yes");
    });

    it("should treat NaN as falsy", () => {
        expect(IF([NaN, "yes", "no"])).toBe("no");
    });

    it("should return #VALUE! for fewer than 2 args", () => {
        expect(IF([])).toBe("#VALUE!");
        expect(IF([1])).toBe("#VALUE!");
    });
});

describe("Logical Functions BugHunt - AND", () => {
    const AND = logicalFunctions.AND;

    it("should handle single true value", () => {
        expect(AND([true])).toBe(true);
    });

    it("should handle single false value", () => {
        expect(AND([false])).toBe(false);
    });

    it("should short-circuit: stop at first false", () => {
        let evalOrder = [];
        const trackedTrue = { valueOf: () => { evalOrder.push("3rd"); return true; } };
        const trackedFalse = { valueOf: () => { evalOrder.push("2nd"); return false; } };
        const trackedFirst = { valueOf: () => { evalOrder.push("1st"); return true; } };

        AND([trackedFirst, trackedFalse, trackedTrue]);
        expect(evalOrder).toEqual(["1st", "2nd"]);
        expect(evalOrder).not.toContain("3rd");
    });

    it("should propagate error values immediately", () => {
        expect(AND(["#ERROR!", true, false])).toBe("#ERROR!");
    });

    it("should handle very large number of arguments (10000)", () => {
        const many = Array(10000).fill(true);
        expect(AND(many)).toBe(true);
    });

    it("should return #VALUE! for empty args", () => {
        expect(AND([])).toBe("#VALUE!");
    });

    it("should treat empty string as false", () => {
        expect(AND([1, "", 3])).toBe(false);
    });

    it("should treat space-only string as true (non-empty)", () => {
        expect(AND([" ", "x"])).toBe(true);
    });
});

describe("Logical Functions BugHunt - OR", () => {
    const OR = logicalFunctions.OR;

    it("should short-circuit: stop at first true", () => {
        let evalOrder = [];
        const trackedTrue = { valueOf: () => { evalOrder.push("2nd"); return true; } };
        const trackedFalse = { valueOf: () => { evalOrder.push("1st"); return false; } };
        const trackedLast = { valueOf: () => { evalOrder.push("3rd"); return true; } };

        OR([trackedFalse, trackedTrue, trackedLast]);
        expect(evalOrder).toEqual(["1st", "2nd"]);
        expect(evalOrder).not.toContain("3rd");
    });

    it("should return false for all-false input including 0 and empty string", () => {
        expect(OR([false, 0, "", null, undefined])).toBe(false);
    });

    it("should propagate error values", () => {
        expect(OR([false, "#DIV/0!"])).toBe("#DIV/0!");
    });

    it("should handle large argument count", () => {
        const allFalse = Array(500).fill(false);
        expect(OR(allFalse)).toBe(false);

        const oneTrue = Array(500).fill(false);
        oneTrue[499] = true;
        expect(OR(oneTrue)).toBe(true);
    });

    it("should return #VALUE! for empty args", () => {
        expect(OR([])).toBe("#VALUE!");
    });
});