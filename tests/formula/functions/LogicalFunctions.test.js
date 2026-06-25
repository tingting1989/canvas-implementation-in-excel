import { describe, it, expect } from "vitest";
import { logicalFunctions } from "@/formula/functions/logical";

describe("Logical Functions - IF", () => {
    const IF = logicalFunctions.IF;

    it("should return true value when condition is truthy", () => {
        expect(IF([true, "yes", "no"])).toBe("yes");
    });

    it("should return false value when condition is falsy", () => {
        expect(IF([false, "yes", "no"])).toBe("no");
    });

    it("should return false as default when no false value provided", () => {
        expect(IF([false, "yes"])).toBe(false);
    });

    it("should treat non-zero number as true", () => {
        expect(IF([1, "yes", "no"])).toBe("yes");
    });

    it("should treat 0 as false", () => {
        expect(IF([0, "yes", "no"])).toBe("no");
    });

    it("should treat non-empty string as true", () => {
        expect(IF(["hello", "yes", "no"])).toBe("yes");
    });

    it("should return #VALUE! for fewer than 2 args", () => {
        expect(IF([])).toBe("#VALUE!");
        expect(IF([1])).toBe("#VALUE!");
    });

    it("should accept 3 args", () => {
        const result = IF([1 > 0, "positive", "non-positive"]);
        expect(result).toBe("positive");
    });
});

describe("Logical Functions - AND", () => {
    const AND = logicalFunctions.AND;

    it("should return true when all are true", () => {
        expect(AND([true, true, true])).toBe(true);
    });

    it("should return false when any is false (short-circuit)", () => {
        expect(AND([true, false, true])).toBe(false);
    });

    it("should return true for single true value", () => {
        expect(AND([true])).toBe(true);
    });

    it("should return false for single false value", () => {
        expect(AND([false])).toBe(false);
    });

    it("should treat non-zero numbers as true", () => {
        expect(AND([1, 2, 3])).toBe(true);
    });

    it("should treat 0 as false", () => {
        expect(AND([1, 0, 3])).toBe(false);
    });

    it("should treat non-empty string as true", () => {
        expect(AND(["yes", "ok"])).toBe(true);
    });

    it("should treat empty string as false", () => {
        expect(AND(["", "ok"])).toBe(false);
    });

    it("should propagate error values", () => {
        expect(AND([true, "#VALUE!", false])).toBe("#VALUE!");
    });

    it("should return #VALUE! for empty args", () => {
        expect(AND([])).toBe("#VALUE!");
    });

    it("should handle many arguments", () => {
        const many = Array(100).fill(true);
        expect(AND(many)).toBe(true);
    });
});

describe("Logical Functions - OR", () => {
    const OR = logicalFunctions.OR;

    it("should return true when any is true", () => {
        expect(OR([false, true, false])).toBe(true);
    });

    it("should return false when all are false", () => {
        expect(OR([false, false, false])).toBe(false);
    });

    it("should return true for single true value", () => {
        expect(OR([true])).toBe(true);
    });

    it("should return false for single false value", () => {
        expect(OR([false])).toBe(false);
    });

    it("should treat non-zero numbers as true", () => {
        expect(OR([0, 0, 5])).toBe(true);
    });

    it("should treat 0 as false", () => {
        expect(OR([0, 0, 0])).toBe(false);
    });

    it("should propagate error values", () => {
        expect(OR([false, "#DIV/0!", false])).toBe("#DIV/0!");
    });

    it("should return #VALUE! for empty args", () => {
        expect(OR([])).toBe("#VALUE!");
    });
});

describe("Logical Functions - NOT", () => {
    const NOT = logicalFunctions.NOT;

    it("should invert true to false", () => {
        expect(NOT([true])).toBe(false);
    });

    it("should invert false to true", () => {
        expect(NOT([false])).toBe(true);
    });

    it("should invert 0 to true", () => {
        expect(NOT([0])).toBe(true);
    });

    it("should invert non-zero to false", () => {
        expect(NOT([5])).toBe(false);
    });

    it("should invert empty string to true", () => {
        expect(NOT([""])).toBe(true);
    });

    it("should invert non-empty string to false", () => {
        expect(NOT(["hello"])).toBe(false);
    });

    it("should propagate error values", () => {
        expect(NOT(["#VALUE!"])).toBe("#VALUE!");
    });

    it("should return #VALUE! for wrong arg count", () => {
        expect(NOT([])).toBe("#VALUE!");
        expect(NOT([1, 2])).toBe("#VALUE!");
    });
});