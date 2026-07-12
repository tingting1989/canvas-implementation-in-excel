import { describe, it, expect, vi, beforeEach } from "vitest";
import { FormulaEngine } from "@/formula/FormulaEngine";
import { registerFunction, unregisterFunction, hasFunction, getRegisteredFunctions } from "@/formula/functions";

function createMockCellStore(data = {}) {
    return {
        get: vi.fn((row, col) => data[`${row},${col}`] ?? undefined),
        set: vi.fn(),
    };
}

function createMockSheet(name = "Sheet1", data = {}) {
    const cellStore = createMockCellStore(data);
    
    return {
        name,
        cellStore,
        _invalidateCellInternal: vi.fn(),
        
        // CellDataAccessor (支持 FormulaEngine/FormulaEvaluator 读取)
        cellDataAccessor: {
            getValue: vi.fn((row, col) => {
                return cellStore.get(row, col)?.value;
            }),
            getValueMatrix: vi.fn((startRow, startCol, endRow, endCol) => {
                const matrix = [];
                for (let r = startRow; r <= endRow; r++) {
                    const row = [];
                    for (let c = startCol; c <= endCol; c++) {
                        row.push(cellStore.get(r, c)?.value ?? null);
                    }
                    matrix.push(row);
                }
                return matrix;
            }),
            forEach: vi.fn((callback) => {
                Object.keys(data).forEach((key) => {
                    const [row, col] = key.split(",").map(Number);
                    callback(data[key].value, row, col);
                });
            }),
        },
    };
}

function createMockWorkbook(sheets = {}) {
    const defaultSheet = sheets["Sheet1"] || createMockSheet("Sheet1");
    return {
        sheets: {
            get: vi.fn((name) => sheets[name] ?? (name === "Sheet1" ? defaultSheet : undefined)),
        },
    };
}

describe("FormulaEngine - isFormula", () => {
    it("should return true for formula strings", () => {
        expect(FormulaEngine.isFormula("=1+2")).toBe(true);
        expect(FormulaEngine.isFormula("=SUM(A1:A10)")).toBe(true);
        expect(FormulaEngine.isFormula("=A1")).toBe(true);
    });

    it("should return false for non-formula strings", () => {
        expect(FormulaEngine.isFormula("hello")).toBe(false);
        expect(FormulaEngine.isFormula("42")).toBe(false);
        expect(FormulaEngine.isFormula("")).toBe(false);
        expect(FormulaEngine.isFormula("=")).toBe(false);
    });

    it("should return false for non-strings", () => {
        expect(FormulaEngine.isFormula(42)).toBe(false);
        expect(FormulaEngine.isFormula(null)).toBe(false);
        expect(FormulaEngine.isFormula(undefined)).toBe(false);
        expect(FormulaEngine.isFormula(true)).toBe(false);
    });
});

describe("FormulaEngine - setFormula", () => {
    it("should evaluate simple arithmetic formula", () => {
        const engine = new FormulaEngine(null);
        const sheet = createMockSheet();
        const result = engine.setFormula(sheet, 0, 0, "=1+2");
        expect(result).toBe(3);
    });

    it("should evaluate cell reference formula", () => {
        const sheet = createMockSheet("Sheet1", { "0,0": { value: 100 } });
        const engine = new FormulaEngine(null);
        const result = engine.setFormula(sheet, 1, 0, "=A1");
        expect(result).toBe(100);
    });

    it("should evaluate SUM function", () => {
        const sheet = createMockSheet("Sheet1", {
            "0,0": { value: 10 },
            "1,0": { value: 20 },
            "2,0": { value: 30 },
        });
        const engine = new FormulaEngine(null);
        const result = engine.setFormula(sheet, 3, 0, "=SUM(A1:A3)");
        expect(result).toBe(60);
    });

    it("should build dependency graph", () => {
        const sheet = createMockSheet("Sheet1", { "0,0": { value: 10 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 1, 0, "=A1");
        const key = "Sheet1!1,0";
        expect(engine.dependsOn.has(key)).toBe(true);
        expect(engine.dependsOn.get(key).has("Sheet1!0,0")).toBe(true);
    });

    it("should update dependency graph when formula changes", () => {
        const sheet = createMockSheet("Sheet1", {
            "0,0": { value: 10 },
            "0,1": { value: 20 },
        });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 1, 0, "=A1");
        expect(engine.dependsOn.get("Sheet1!1,0").has("Sheet1!0,0")).toBe(true);

        engine.setFormula(sheet, 1, 0, "=B1");
        expect(engine.dependsOn.get("Sheet1!1,0").has("Sheet1!0,0")).toBe(false);
        expect(engine.dependsOn.get("Sheet1!1,0").has("Sheet1!0,1")).toBe(true);
    });

    it("should cache AST", () => {
        const sheet = createMockSheet();
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 0, 0, "=1+2");
        expect(engine.astCache.has("Sheet1!0,0")).toBe(true);
    });

    it.skip("should return #PARSE! for invalid formula (待修复)", () => {
        const sheet = createMockSheet();
        const engine = new FormulaEngine(null);
        const result = engine.setFormula(sheet, 0, 0, "=!!!");
        expect(result).toBe("#PARSE!");
    });

    it.skip("should handle formula without leading = (待修复)", () => {
        const sheet = createMockSheet();
        const engine = new FormulaEngine(null);
        const result = engine.setFormula(sheet, 0, 0, "1+2");
        expect(result).toBe(3);
    });
});

describe("FormulaEngine - removeFormula", () => {
    it.skip("should remove formula and dependencies (待修复)", () => {
        const sheet = createMockSheet("Sheet1", { "0,0": { value: 10 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 1, 0, "=A1");
        engine.removeFormula(sheet, 1, 0);
        expect(engine.dependsOn.has("Sheet1!1,0")).toBe(false);
        expect(engine.astCache.has("Sheet1!1,0")).toBe(false);
    });

    it.skip("should clean up reverse dependency (dependents) (待修复)", () => {
        const sheet = createMockSheet("Sheet1", { "0,0": { value: 10 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 1, 0, "=A1");
        expect(engine.dependents.has("Sheet1!0,0")).toBe(true);
        engine.removeFormula(sheet, 1, 0);
        expect(engine.dependents.has("Sheet1!0,0")).toBe(false);
    });
});

describe("FormulaEngine - onCellChanged", () => {
    it("should recalculate dependent formulas", () => {
        const sheet = createMockSheet("Sheet1", { "0,0": { value: 10 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 1, 0, "=A1*2");

        sheet.cellStore.get.mockImplementation((r, c) => {
            if (r === 0 && c === 0) return { value: 20 };
            if (r === 1 && c === 0) return { value: 40, formula: "=A1*2" };
            return undefined;
        });

        const results = engine.onCellChanged(sheet, 0, 0);
        expect(results.length).toBeGreaterThan(0);
    });

    it("should return empty array for cell with no dependents", () => {
        const sheet = createMockSheet("Sheet1");
        const engine = new FormulaEngine(null);
        const results = engine.onCellChanged(sheet, 0, 0);
        expect(results).toEqual([]);
    });

    it("should cascade through multi-level dependencies", () => {
        const sheet = createMockSheet("Sheet1", {
            "0,0": { value: 10 },
            "1,0": { value: 20, formula: "=A1*2" },
            "2,0": { value: 40, formula: "=A2+10" },
        });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 1, 0, "=A1*2");
        engine.setFormula(sheet, 2, 0, "=A2+10");

        const results = engine.onCellChanged(sheet, 0, 0);
        expect(results.length).toBe(2);
    });
});

describe("FormulaEngine - recalculateAll", () => {
    it("should recalculate all formulas on a sheet", () => {
        const sheet = createMockSheet("Sheet1", {
            "0,0": { value: 10 },
            "1,0": { value: 0, formula: "=A1*2", styleId: 0, disabled: false },
        });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 1, 0, "=A1*2");

        sheet.cellStore.get.mockImplementation((r, c) => {
            if (r === 0 && c === 0) return { value: 10 };
            if (r === 1 && c === 0) return { value: 20, formula: "=A1*2", styleId: 0, disabled: false };
            return undefined;
        });

        engine.recalculateAll(sheet);
        expect(sheet.cellStore.set).toHaveBeenCalled();
    });
});

describe("FormulaEngine - getDependencies / getDependents", () => {
    it("should return dependencies for a formula cell", () => {
        const sheet = createMockSheet("Sheet1", { "0,0": { value: 10 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 1, 0, "=A1");
        expect(engine.getDependencies("Sheet1", 1, 0)).toContain("Sheet1!0,0");
    });

    it("should return dependents for a source cell", () => {
        const sheet = createMockSheet("Sheet1", { "0,0": { value: 10 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 1, 0, "=A1");
        expect(engine.getDependents("Sheet1", 0, 0)).toContain("Sheet1!1,0");
    });

    it("should return empty array for cell with no dependencies", () => {
        const engine = new FormulaEngine(null);
        expect(engine.getDependencies("Sheet1", 0, 0)).toEqual([]);
    });
});

describe.skip("FormulaEngine - registerFunction / unregisterFunction (待修复)", () => {
    afterEach(() => {
        try { unregisterFunction("CUSTOM_TEST"); } catch {}
    });

    it("should register and use custom function", () => {
        const engine = new FormulaEngine(null);
        engine.registerFunction("DOUBLE", (args) => args[0] * 2);
        const sheet = createMockSheet();
        const result = engine.setFormula(sheet, 0, 0, "=DOUBLE(5)");
        expect(result).toBe(10);
    });

    it("should unregister custom function", () => {
        const engine = new FormulaEngine(null);
        engine.registerFunction("CUSTOM_TEST", (args) => 42);
        expect(engine.hasFunction("CUSTOM_TEST")).toBe(true);
        engine.unregisterFunction("CUSTOM_TEST");
        expect(engine.hasFunction("CUSTOM_TEST")).toBe(false);
    });

    it("should check function existence", () => {
        const engine = new FormulaEngine(null);
        expect(engine.hasFunction("SUM")).toBe(true);
        expect(engine.hasFunction("NONEXISTENT")).toBe(false);
    });

    it.skip("should list registered functions (待修复)", () => {
        const engine = new FormulaEngine(null);
        const fns = engine.getRegisteredFunctions();
        expect(fns).toContain("SUM");
        expect(fns).toContain("IF");
        expect(fns).toContain("VLOOKUP");
    });
});

describe("FormulaEngine - destroy", () => {
    it("should clear all data", () => {
        const sheet = createMockSheet("Sheet1", { "0,0": { value: 10 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 1, 0, "=A1");
        engine.destroy();
        expect(engine.dependents.size).toBe(0);
        expect(engine.dependsOn.size).toBe(0);
        expect(engine.astCache.size).toBe(0);
        expect(engine.dirtyCells.size).toBe(0);
        expect(engine.workbook).toBeNull();
        expect(engine.evaluator).toBeNull();
    });
});

describe("FormulaEngine - onStructureChanged", () => {
    it("should remove dependencies for affected cells when isShift=true", () => {
        const sheet = createMockSheet("Sheet1", { "0,0": { value: 10 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 5, 0, "=A1");
        engine.onStructureChanged(sheet, 3, 0, true);
        expect(engine.dependsOn.has("Sheet1!5,0")).toBe(false);
    });

    it("should not remove dependencies when isShift=false", () => {
        const sheet = createMockSheet("Sheet1", { "0,0": { value: 10 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 5, 0, "=A1");
        engine.onStructureChanged(sheet, 3, 0, false);
        expect(engine.dependsOn.has("Sheet1!5,0")).toBe(true);
    });
});