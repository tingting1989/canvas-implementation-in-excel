import { describe, it, expect, vi } from "vitest";
import { FormulaEngine } from "@/formula/FormulaEngine";
import { parseFormula } from "@/formula/FormulaParser";
import { FUNCTIONS, registerFunction, unregisterFunction, hasFunction, getRegisteredFunctions } from "@/formula/functions";

describe("FormulaParser - Basic Parsing", () => {
    it("should parse simple number", () => {
        const ast = parseFormula("42");
        expect(ast).toBeDefined();
        expect(ast.type).toBe("literal");
        expect(ast.value).toBe(42);
    });

    it("should parse simple string literal", () => {
        const ast = parseFormula('"hello"');
        expect(ast).toBeDefined();
        expect(ast.type).toBe("literal");
        expect(ast.value).toBe("hello");
    });

    it("should parse cell reference", () => {
        const ast = parseFormula("A1");
        expect(ast).toBeDefined();
        expect(ast.type).toBe("cellRef");
    });

    it("should parse function call", () => {
        const ast = parseFormula("SUM(A1:A10)");
        expect(ast).toBeDefined();
        expect(ast.type).toBe("function");
    });

    it("should parse arithmetic expression", () => {
        const ast = parseFormula("1+2*3");
        expect(ast).toBeDefined();
        expect(ast.type).toBe("binaryOp");
    });

    it("should parse empty string as empty literal", () => {
        const ast = parseFormula("");
        expect(ast).toBeDefined();
        expect(ast.type).toBe("literal");
        expect(ast.value).toBe("");
    });

    it("should parse plain text as literal", () => {
        const ast = parseFormula("hello");
        expect(ast).toBeDefined();
        expect(ast.type).toBe("literal");
    });
});

describe("FormulaEngine - Construction", () => {
    it("should create engine with workbook", () => {
        const engine = new FormulaEngine({});
        expect(engine.dependents).toBeDefined();
        expect(engine.dependsOn).toBeDefined();
        expect(engine.astCache).toBeDefined();
    });
});

describe("FormulaEngine - isFormula (static)", () => {
    it("should detect formula strings", () => {
        expect(FormulaEngine.isFormula("=SUM(A1:A10)")).toBe(true);
        expect(FormulaEngine.isFormula("=1+2")).toBe(true);
    });

    it("should not detect non-formula strings", () => {
        expect(FormulaEngine.isFormula("hello")).toBe(false);
        expect(FormulaEngine.isFormula("42")).toBe(false);
        expect(FormulaEngine.isFormula("")).toBe(false);
    });

    it("should not detect non-strings", () => {
        expect(FormulaEngine.isFormula(42)).toBe(false);
        expect(FormulaEngine.isFormula(null)).toBe(false);
        expect(FormulaEngine.isFormula(undefined)).toBe(false);
    });
});

describe("FormulaEngine - setFormula", () => {
    it("should store formula and return computed value", () => {
        const workbook = {};
        const engine = new FormulaEngine(workbook);
        const sheet = {
            name: "Sheet1",
            cellStore: { get: vi.fn().mockReturnValue(undefined) },
            _invalidateCellInternal: vi.fn(),
        };
        const result = engine.setFormula(sheet, 0, 0, "=1+2");
        expect(result).toBe(3);
    });

    it("should build dependency graph", () => {
        const workbook = {};
        const engine = new FormulaEngine(workbook);
        const sheet = {
            name: "Sheet1",
            cellStore: { get: vi.fn().mockReturnValue(undefined) },
            _invalidateCellInternal: vi.fn(),
        };
        engine.setFormula(sheet, 5, 0, "=A1");
        const key = "Sheet1!5,0";
        expect(engine.dependsOn.has(key)).toBe(true);
    });
});

describe("FormulaEngine - removeFormula", () => {
    it("should remove formula and its dependencies", () => {
        const workbook = {};
        const engine = new FormulaEngine(workbook);
        const sheet = {
            name: "Sheet1",
            cellStore: { get: vi.fn().mockReturnValue(undefined) },
            _invalidateCellInternal: vi.fn(),
        };
        engine.setFormula(sheet, 5, 0, "=A1");
        engine.removeFormula(sheet, 5, 0);
        expect(engine.dependsOn.has("Sheet1!5,0")).toBe(false);
    });
});

describe("Formula Functions Registry", () => {
    it("should have SUM function registered", () => {
        expect(hasFunction("SUM")).toBe(true);
    });

    it("should have AVERAGE function registered", () => {
        expect(hasFunction("AVERAGE")).toBe(true);
    });

    it("should list registered functions", () => {
        const fns = getRegisteredFunctions();
        expect(fns.length).toBeGreaterThan(0);
        expect(fns).toContain("SUM");
    });

    it("should register and unregister custom function", () => {
        const customFn = vi.fn().mockReturnValue(42);
        registerFunction("CUSTOM_TEST", customFn);
        expect(hasFunction("CUSTOM_TEST")).toBe(true);
        unregisterFunction("CUSTOM_TEST");
        expect(hasFunction("CUSTOM_TEST")).toBe(false);
    });
});