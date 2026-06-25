import { describe, it, expect, vi } from "vitest";
import { FormulaEvaluator } from "@/formula/FormulaEvaluator";

function createMockCellStore(data = {}) {
    return {
        get: vi.fn((row, col) => data[`${row},${col}`] ?? undefined),
    };
}

function createMockSheet(name = "Sheet1", data = {}) {
    return {
        name,
        cellStore: createMockCellStore(data),
    };
}

function createMockWorkbook(sheets = {}) {
    return {
        sheets: {
            get: vi.fn((name) => sheets[name] ?? undefined),
        },
        formulaEngine: {
            astCache: new Map(),
        },
    };
}

describe("FormulaEvaluator - Literal Evaluation", () => {
    it("should evaluate number literal", () => {
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate({ type: "literal", value: 42 }, null);
        expect(result).toBe(42);
    });

    it("should evaluate string literal", () => {
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate({ type: "literal", value: "hello" }, null);
        expect(result).toBe("hello");
    });

    it("should evaluate empty string literal", () => {
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate({ type: "literal", value: "" }, null);
        expect(result).toBe("");
    });

    it("should evaluate zero", () => {
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate({ type: "literal", value: 0 }, null);
        expect(result).toBe(0);
    });

    it("should evaluate boolean true", () => {
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate({ type: "literal", value: true }, null);
        expect(result).toBe(true);
    });

    it("should evaluate boolean false", () => {
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate({ type: "literal", value: false }, null);
        expect(result).toBe(false);
    });
});

describe("FormulaEvaluator - Cell Reference", () => {
    it("should read cell value from sheet", () => {
        const sheet = createMockSheet("Sheet1", { "0,0": { value: 100 } });
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate({ type: "cellRef", sheet: null, row: 0, col: 0 }, sheet);
        expect(result).toBe(100);
    });

    it("should return empty string for empty cell", () => {
        const sheet = createMockSheet("Sheet1");
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate({ type: "cellRef", sheet: null, row: 0, col: 0 }, sheet);
        expect(result).toBe("");
    });

    it("should read from cross-sheet reference", () => {
        const sheet2 = createMockSheet("Sheet2", { "0,0": { value: 200 } });
        const workbook = createMockWorkbook({ Sheet2: sheet2 });
        const evaluator = new FormulaEvaluator(workbook);
        const result = evaluator.evaluate({ type: "cellRef", sheet: "Sheet2", row: 0, col: 0 }, null);
        expect(result).toBe(200);
    });

    it("should return #REF! for non-existent sheet", () => {
        const workbook = createMockWorkbook({});
        const evaluator = new FormulaEvaluator(workbook);
        const result = evaluator.evaluate({ type: "cellRef", sheet: "NoSuch", row: 0, col: 0 }, null);
        expect(result).toBe("#REF!");
    });

    it("should track dependencies", () => {
        const sheet = createMockSheet("Sheet1", { "0,0": { value: 10 } });
        const evaluator = new FormulaEvaluator(null);
        evaluator.evaluate({ type: "cellRef", sheet: null, row: 0, col: 0 }, sheet);
        expect(evaluator.dependencies.has("Sheet1!0,0")).toBe(true);
    });
});

describe("FormulaEvaluator - Range Reference", () => {
    it("should return 2D array for range", () => {
        const data = {
            "0,0": { value: 1 },
            "0,1": { value: 2 },
            "1,0": { value: 3 },
            "1,1": { value: 4 },
        };
        const sheet = createMockSheet("Sheet1", data);
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate(
            { type: "rangeRef", sheet: null, topRow: 0, topCol: 0, bottomRow: 1, bottomCol: 1 },
            sheet
        );
        expect(result).toEqual([
            [1, 2],
            [3, 4],
        ]);
    });

    it("should return empty string for missing cells in range", () => {
        const data = { "0,0": { value: 1 } };
        const sheet = createMockSheet("Sheet1", data);
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate(
            { type: "rangeRef", sheet: null, topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 1 },
            sheet
        );
        expect(result).toEqual([[1, ""]]);
    });

    it("should track all cells in range as dependencies", () => {
        const sheet = createMockSheet("Sheet1", {
            "0,0": { value: 1 },
            "0,1": { value: 2 },
        });
        const evaluator = new FormulaEvaluator(null);
        evaluator.evaluate(
            { type: "rangeRef", sheet: null, topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 1 },
            sheet
        );
        expect(evaluator.dependencies.has("Sheet1!0,0")).toBe(true);
        expect(evaluator.dependencies.has("Sheet1!0,1")).toBe(true);
    });
});

describe("FormulaEvaluator - Binary Operations", () => {
    const evaluator = new FormulaEvaluator(null);

    it("should evaluate addition", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "+", left: { type: "literal", value: 3 }, right: { type: "literal", value: 4 } },
            null
        );
        expect(result).toBe(7);
    });

    it("should evaluate subtraction", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "-", left: { type: "literal", value: 10 }, right: { type: "literal", value: 3 } },
            null
        );
        expect(result).toBe(7);
    });

    it("should evaluate multiplication", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "*", left: { type: "literal", value: 6 }, right: { type: "literal", value: 7 } },
            null
        );
        expect(result).toBe(42);
    });

    it("should evaluate division", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "/", left: { type: "literal", value: 10 }, right: { type: "literal", value: 4 } },
            null
        );
        expect(result).toBe(2.5);
    });

    it("should return #DIV/0! for division by zero", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "/", left: { type: "literal", value: 10 }, right: { type: "literal", value: 0 } },
            null
        );
        expect(result).toBe("#DIV/0!");
    });

    it("should evaluate power", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "^", left: { type: "literal", value: 2 }, right: { type: "literal", value: 10 } },
            null
        );
        expect(result).toBe(1024);
    });

    it("should evaluate string concatenation", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "&", left: { type: "literal", value: "Hello" }, right: { type: "literal", value: "World" } },
            null
        );
        expect(result).toBe("HelloWorld");
    });

    it("should evaluate = comparison (true)", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "=", left: { type: "literal", value: 5 }, right: { type: "literal", value: 5 } },
            null
        );
        expect(result).toBe(true);
    });

    it("should evaluate = comparison (false)", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "=", left: { type: "literal", value: 5 }, right: { type: "literal", value: 6 } },
            null
        );
        expect(result).toBe(false);
    });

    it("should evaluate <> comparison", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "<>", left: { type: "literal", value: 5 }, right: { type: "literal", value: 6 } },
            null
        );
        expect(result).toBe(true);
    });

    it("should evaluate < comparison", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: "<", left: { type: "literal", value: 3 }, right: { type: "literal", value: 5 } },
            null
        );
        expect(result).toBe(true);
    });

    it("should evaluate > comparison", () => {
        const result = evaluator.evaluate(
            { type: "binaryOp", operator: ">", left: { type: "literal", value: 5 }, right: { type: "literal", value: 3 } },
            null
        );
        expect(result).toBe(true);
    });

    it("should evaluate <= comparison", () => {
        expect(evaluator.evaluate(
            { type: "binaryOp", operator: "<=", left: { type: "literal", value: 5 }, right: { type: "literal", value: 5 } },
            null
        )).toBe(true);
        expect(evaluator.evaluate(
            { type: "binaryOp", operator: "<=", left: { type: "literal", value: 4 }, right: { type: "literal", value: 5 } },
            null
        )).toBe(true);
    });

    it("should evaluate >= comparison", () => {
        expect(evaluator.evaluate(
            { type: "binaryOp", operator: ">=", left: { type: "literal", value: 5 }, right: { type: "literal", value: 5 } },
            null
        )).toBe(true);
        expect(evaluator.evaluate(
            { type: "binaryOp", operator: ">=", left: { type: "literal", value: 6 }, right: { type: "literal", value: 5 } },
            null
        )).toBe(true);
    });
});

describe("FormulaEvaluator - Unary Operations", () => {
    const evaluator = new FormulaEvaluator(null);

    it("should evaluate unary minus", () => {
        const result = evaluator.evaluate(
            { type: "unaryOp", operator: "-", operand: { type: "literal", value: 5 } },
            null
        );
        expect(result).toBe(-5);
    });

    it("should evaluate unary minus on negative", () => {
        const result = evaluator.evaluate(
            { type: "unaryOp", operator: "-", operand: { type: "literal", value: -5 } },
            null
        );
        expect(result).toBe(5);
    });
});

describe("FormulaEvaluator - Function Evaluation", () => {
    it("should evaluate registered function", () => {
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate(
            {
                type: "function",
                name: "SUM",
                args: [
                    { type: "literal", value: 1 },
                    { type: "literal", value: 2 },
                    { type: "literal", value: 3 },
                ],
            },
            null
        );
        expect(result).toBe(6);
    });

    it("should return #NAME? for unregistered function", () => {
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate(
            { type: "function", name: "NONEXISTENT", args: [] },
            null
        );
        expect(result).toBe("#NAME?");
    });
});

describe("FormulaEvaluator - Circular Reference Detection", () => {
    it("should detect direct circular reference", () => {
        const sheet = createMockSheet("Sheet1");
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate(
            { type: "cellRef", sheet: null, row: 0, col: 0 },
            sheet,
            "Sheet1!0,0"
        );
        expect(result).toBe("#CIRCULAR!");
    });

    it("should detect indirect circular reference via formula cell", () => {
        const sheet = createMockSheet("Sheet1", {
            "1,0": { value: 0, formula: "=A1" },
        });
        const workbook = createMockWorkbook({});
        const astForB1 = { type: "cellRef", sheet: null, row: 0, col: 0 };
        workbook.formulaEngine = { astCache: new Map([["Sheet1!1,0", astForB1]]) };

        const evaluator = new FormulaEvaluator(workbook);
        const result = evaluator.evaluate(
            { type: "cellRef", sheet: null, row: 1, col: 0 },
            sheet,
            "Sheet1!0,0"
        );
        expect(result).toBe("#CIRCULAR!");
    });
});

describe("FormulaEvaluator - Unknown Node Type", () => {
    it("should return #VALUE! for unknown node type", () => {
        const evaluator = new FormulaEvaluator(null);
        const result = evaluator.evaluate({ type: "unknown" }, null);
        expect(result).toBe("#VALUE!");
    });
});