import { describe, it, expect, vi } from "vitest";
import { FormulaEvaluator } from "@/formula/FormulaEvaluator";

function createMockCellStore(data = {}) {
    return {
        get: vi.fn((row, col) => data[`${row},${col}`] ?? undefined),
    };
}

function createMockSheet(name = "Sheet1", data = {}) {
    return { name, cellStore: createMockCellStore(data) };
}

function createMockWorkbook(sheets = {}) {
    return {
        sheets: { get: vi.fn((name) => sheets[name] ?? undefined) },
        formulaEngine: { astCache: new Map() },
    };
}

describe("FormulaEvaluator BugHunt - Division edge cases", () => {
    const evaluator = new FormulaEvaluator(null);

    it("should handle division by very small number", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "/", left: { type: "literal", value: 1 }, right: { type: "literal", value: 1e-300 } },
            null
        );
        expect(typeof result).toBe("number");
    });

    it("should return #DIV/0! for 0/0", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "/", left: { type: "literal", value: 0 }, right: { type: "literal", value: 0 } },
            null
        );
        expect(result).toBe("#DIV/0!");
    });

    it("should return #DIV/0! for negative zero divisor", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "/", left: { type: "literal", value: 5 }, right: { type: "literal", value: -0 } },
            null
        );
        expect(result).toBe("#DIV/0!");
    });
});

describe("FormulaEvaluator BugHunt - Arithmetic overflow/precision", () => {
    const evaluator = new FormulaEvaluator(null);

    it("should handle very large numbers in addition", () => {
        const big = Number.MAX_SAFE_INTEGER;
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "+", left: { type: "literal", value: big }, right: { type: "literal", value: 1 } },
            null
        );
        expect(typeof result).toBe("number");
    });

    it("should handle multiplication of large numbers", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "*", left: { type: "literal", value: 1e200 }, right: { type: "literal", value: 1e200 } },
            null
        );
        expect(result).toBe(Infinity);
    });

    it("should handle power with negative exponent", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "^", left: { type: "literal", value: 2 }, right: { type: "literal", value: -3 } },
            null
        );
        expect(result).toBeCloseTo(0.125);
    });
});

describe("FormulaEvaluator BugHunt - Type coercion edge cases", () => {
    const evaluator = new FormulaEvaluator(null);

    it("should coerce boolean true to 1 in arithmetic", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "+", left: { type: "literal", value: true }, right: { type: "literal", value: 5 } },
            null
        );
        expect(result).toBe(NaN);
    });

    it("should coerce string '123' to 123 in arithmetic", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "+", left: { type: "literal", value: "123" }, right: { type: "literal", value: 456 } },
            null
        );
        expect(result).toBe(579);
    });

    it("should return NaN for non-numeric string in arithmetic", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "+", left: { type: "literal", value: "abc" }, right: { type: "literal", value: 1 } },
            null
        );
        expect(isNaN(result)).toBe(true);
    });
});

describe("FormulaEvaluator BugHunt - Comparison with NaN", () => {
    const evaluator = new FormulaEvaluator(null);

    it("should handle NaN in < comparison", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "<", left: { type: "literal", value: NaN }, right: { type: "literal", value: 5 } },
            null
        );
        expect(result).toBe(false);
    });

    it("should handle NaN in > comparison", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: ">", left: { type: "literal", value: 5 }, right: { type: "literal", value: NaN } },
            null
        );
        expect(result).toBe(false);
    });

    it("should handle NaN in = comparison (NaN != NaN)", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "=", left: { type: "literal", value: NaN }, right: { type: "literal", value: NaN } },
            null
        );
        expect(result).toBe(false);
    });
});

describe("FormulaEvaluator BugHunt - Cell reference edge cases", () => {
    it("should handle cell with formula that references itself (direct circular)", () => {
        const sheet = createMockSheet();
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate(
            { type: "cellRef", sheet: null, row: 0, col: 0 },
            sheet,
            "Sheet1!0,0"
        );
        expect(result).toBe("#CIRCULAR!");
    });

    it("should handle cross-sheet reference when workbook is null", () => {
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate(
            { type: "cellRef", sheet: "OtherSheet", row: 0, col: 0 },
            null
        );
        expect(result).toBe("#REF!");
    });

    it("should handle cell with undefined value (return empty string)", () => {
        const sheet = createMockSheet();
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate({ type: "cellRef", sheet: null, row: 999, col: 999 }, sheet);
        expect(result).toBe("");
    });

    it("should track dependencies even for empty cells", () => {
        const sheet = createMockSheet();
        const evaluator = new FormulaEvaluator(null);
        evaluator.evaluate({ type: "cellRef", sheet: null, row: 5, col: 10 }, sheet);
        expect(evaluator.dependencies.has("Sheet1!5,10")).toBe(true);
    });
});

describe("FormulaEvaluator BugHunt - Range reference edge cases", () => {
    it("should handle single-cell range", () => {
        const sheet = createMockSheet("S1", { "0,0": { value: 42 } });
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate(
            { type: "rangeRef", topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 },
            sheet
        );
        expect(result).toEqual([[42]]);
    });

    it("should handle range where all cells are empty", () => {
        const sheet = createMockSheet();
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate(
            { type: "rangeRef", topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 2 },
            sheet
        );
        expect(result.length).toBe(3);
        expect(result[0].length).toBe(3);
        expect(result[0][0]).toBe("");
    });

    it("should track all cells in range as dependencies", () => {
        const sheet = createMockSheet();
        const evaluator = new FormulaEvaluator(null);
        evaluator.evaluate(
            { type: "rangeRef", topRow: 0, topCol: 0, bottomRow: 9, bottomCol: 4 },
            sheet
        );
        expect(evaluator.dependencies.size).toBe(50);
    });
});

describe("FormulaEvaluator BugHunt - Function evaluation edge cases", () => {
    it("should pass context object with sheet and workbook", () => {
        let capturedContext = null;
        const mockFn = (args, ctx) => { capturedContext = ctx; return 42; };

        const evaluator = new FormulaEvaluator(null);
        const sheet = createMockSheet();

        evaluator.evaluate({
            type: "function",
            name: "SUM",
            args: [{ type: "literal", value: 1 }],
        }, sheet);

        expect(capturedContext).toBeDefined();
    });

    it("should propagate error from function execution", () => {
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate(
            { type: "function", name: "NONEXISTENT_FUNC_XYZ", args: [] },
            null
        );
        expect(result).toBe("#NAME?");
    });
});

describe("FormulaEvaluator BugHunt - Unary operation edge cases", () => {
    const evaluator = new FormulaEvaluator(null);

    it("should negate Infinity", () => {
        const result = evaluator.evaluate(
            { type: "unaryOp", operator: "-", operand: { type: "literal", value: Infinity } },
            null
        );
        expect(result).toBe(-Infinity);
    });

    it("should negate -Infinity to Infinity", () => {
        const result = evaluator.evaluate(
            { type: "unaryOp", operator: "-", operand: { type: "literal", value: -Infinity } },
            null
        );
        expect(result).toBe(Infinity);
    });

    it("should negate NaN (still NaN)", () => {
        const result = evaluator.evaluate(
            { type: "unaryOp", operator: "-", operand: { type: "literal", value: NaN } },
            null
        );
        expect(isNaN(result)).toBe(true);
    });
});

describe("FormulaEvaluator BugHunt - String concatenation edge cases", () => {
    const evaluator = new FormulaEvaluator(null);

    it("should concatenate null values as empty strings", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "&", left: { type: "literal", value: null }, right: { type: "literal", value: "x" } },
            null
        );
        expect(result).toBe("x");
    });

    it("should concatenate undefined values as empty strings", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "&", left: { type: "literal", value: undefined }, right: { type: "literal", value: "y" } },
            null
        );
        expect(result).toBe("y");
    });

    it("should concatenate numbers as strings", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "&", left: { type: "literal", value: 123 }, right: { type: "literal", value: 456 } },
            null
        );
        expect(result).toBe("123456");
    });
});

describe("FormulaEvaluator BugHunt - Circular reference chain", () => {
    it("should detect A -> B -> A chain", () => {
        const sheet = createMockSheet("S1", {
            "1,0": { value: 0, formula: "=A1" },
        });
        const workbook = createMockWorkbook({});
        const astForB1 = { type: "cellRef", sheet: null, row: 0, col: 0 };
        workbook.formulaEngine.astCache.set("S1!1,0", astForB1);

        const evaluator = new FormulaEvaluator(workbook);
        const result = evaluator.evaluate(
            { type: "cellRef", sheet: null, row: 1, col: 0 },
            sheet,
            "S1!0,0"
        );
        expect(result).toBe("#CIRCULAR!");
    });

    it("should clean up callStack after evaluation", () => {
        const sheet = createMockSheet();
        const workbook = { getSheet: () => sheet };
        const evaluator = new FormulaEvaluator(workbook);
        evaluator.evaluate(
            { type: "literal", value: 1 },
            sheet,
            "TestKey"
        );
        expect(evaluator._callStack.has("TestKey")).toBe(false);
    });
});