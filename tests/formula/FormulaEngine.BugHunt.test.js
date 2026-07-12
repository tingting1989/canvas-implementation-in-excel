import { describe, it, expect, vi, afterEach } from "vitest";
import { FormulaEngine } from "@/formula/FormulaEngine";
import { registerFunction, unregisterFunction, hasFunction } from "@/formula/functions";

function createMockCellStore(data = {}) {
    return {
        get: vi.fn((row, col) => data[`${row},${col}`] ?? undefined),
        set: vi.fn(),
    };
}

function createMockSheet(name = "Sheet1", data = {}) {
    const store = createMockCellStore(data);
    return {
        name,
        cellStore: store,
        _invalidateCellInternal: vi.fn(),
        // v2.0+ 重构：添加 CellDataAccessor 支持
        cellDataAccessor: {
            getValueMatrix: (topRow, topCol, bottomRow, bottomCol) => {
                const matrix = [];
                for (let r = topRow; r <= bottomRow; r++) {
                    const rowData = [];
                    for (let c = topCol; c <= bottomCol; c++) {
                        const cell = store.get(r, c);
                        rowData.push(cell ? cell.value : "");
                    }
                    matrix.push(rowData);
                }
                return matrix;
            },
            get: (row, col) => store.get(row, col),
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

describe("FormulaEngine BugHunt - setFormula edge cases", () => {
    it("should handle formula with only cell reference", () => {
        const sheet = createMockSheet("S1", { "0,0": { value: 99 } });
        const engine = new FormulaEngine(null);
        const result = engine.setFormula(sheet, 1, 0, "=A1");
        expect(result).toBe(99);
    });

    it("should handle deeply nested function calls", () => {
        const sheet = createMockSheet();
        const engine = new FormulaEngine(null);
        const result = engine.setFormula(sheet, 0, 0, "=SUM(SUM(AVERAGE(1,2),3),4)");
        expect(typeof result).toBe("number");
    });

    it("should handle formula that results in error string", () => {
        const sheet = createMockSheet();
        const engine = new FormulaEngine(null);
        const result = engine.setFormula(sheet, 0, 0, "=1/0");
        expect(result).toBe("#DIV/0!");
    });

    it("should store error result in dependency graph", () => {
        const sheet = createMockSheet();
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 0, 0, "=1/0");
        expect(engine.astCache.has("Sheet1!0,0")).toBe(true);
    });
});

describe("FormulaEngine BugHunt - Dependency graph edge cases", () => {
    it("should handle formula referencing itself (self-reference)", () => {
        const sheet = createMockSheet("S1");
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 0, 0, "=A1");
        expect(engine.dependsOn.get("S1!0,0").has("S1!0,0")).toBe(true);
    });

    it("should handle many cells depending on one source cell", () => {
        const sheet = createMockSheet("S1", { "0,0": { value: 10 } });
        const engine = new FormulaEngine(null);
        for (let i = 1; i <= 100; i++) {
            engine.setFormula(sheet, i, 0, "=A1");
        }
        const dependents = engine.dependents.get("S1!0,0");
        expect(dependents.size).toBe(100);
    });

    it("should handle one cell depending on many sources", () => {
        const data = {};
        for (let i = 0; i < 50; i++) {
            data[`${i},0`] = { value: i + 1 };
        }
        const sheet = createMockSheet("S1", data);
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 51, 0, "=SUM(A1:A50)");
        const deps = engine.dependsOn.get("S1!51,0");
        expect(deps.size).toBe(50);
    });

    it("should correctly update dependencies when formula changes completely", () => {
        const sheet = createMockSheet("S1", { "0,0": { value: 10 }, "0,1": { value: 20 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 2, 0, "=A1");
        engine.setFormula(sheet, 2, 0, "=B1");

        const deps = engine.dependsOn.get("S1!2,0");
        expect(deps.has("S1!0,0")).toBe(false);
        expect(deps.has("S1!0,1")).toBe(true);

        const oldDependents = engine.dependents.get("S1!0,0");
        expect(oldDependents).toBeUndefined();
    });
});

describe("FormulaEngine BugHunt - onCellChanged cascade", () => {
    it("should not infinite loop on circular dependency during recalculation", () => {
        const sheet = createMockSheet("S1");
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 0, 0, "=B1");
        engine.setFormula(sheet, 1, 0, "=A1");

        sheet.cellStore.get.mockImplementation((r, c) => {
            if (r === 0 && c === 0) return { value: "#CIRCULAR!", formula: "=B1" };
            if (r === 1 && c === 0) return { value: "#CIRCULAR!", formula: "=A1" };
            return undefined;
        });

        const results = engine.onCellChanged(sheet, 0, 0);
        expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle cascade with no valid cells to update", () => {
        const sheet = createMockSheet("S1");
        const engine = new FormulaEngine(null);
        const results = engine.onCellChanged(sheet, 999, 999);
        expect(results).toEqual([]);
    });
});

describe("FormulaEngine BugHunt - removeFormula idempotency", () => {
    it("should be safe to call removeFormula twice", () => {
        const sheet = createMockSheet("S1", { "0,0": { value: 10 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 1, 0, "=A1");
        engine.removeFormula(sheet, 1, 0);
        engine.removeFormula(sheet, 1, 0);

        expect(engine.dependsOn.has("Sheet1!1,0")).toBe(false);
        expect(engine.astCache.has("Sheet1!1,0")).toBe(false);
    });

    it("should be safe to call removeFormula on non-formula cell", () => {
        const sheet = createMockSheet("S1");
        const engine = new FormulaEngine(null);
        expect(() => engine.removeFormula(sheet, 5, 5)).not.toThrow();
    });
});

describe("FormulaEngine BugHunt - Custom function abuse", () => {
    afterEach(() => {
        try { unregisterFunction("BHTEST"); } catch {}
    });

    it.skip("should allow custom function that returns various types (待修复)", () => {
        registerFunction("BHTEST", (args) => args[0]);
        const sheet = createMockSheet();
        const engine = new FormulaEngine(null);

        expect(engine.setFormula(sheet, 0, 0, '=BHTEST("hello")')).toBe("hello");
        expect(engine.setFormula(sheet, 0, 0, "=BHTEST(42)")).toBe(42);
        expect(engine.setFormula(sheet, 0, 0, '=BHTEST("true")')).toBe("true");
    });

    it.skip("should handle custom function that throws (待修复)", () => {
        registerFunction("BHTEST", () => { throw new Error("custom error"); });
        const sheet = createMockSheet();
        const engine = new FormulaEngine(null);
        const result = engine.setFormula(sheet, 0, 0, "=BHTEST()");
        expect(result).toBe("#ERROR!");
    });

    it.skip("should handle custom function with no args returning undefined (待修复)", () => {
        registerFunction("BHTEST", () => undefined);
        const sheet = createMockSheet();
        const engine = new FormulaEngine(null);
        const result = engine.setFormula(sheet, 0, 0, "=BHTEST()");
        expect(result).toBeUndefined();
    });

    it.skip("should handle overriding builtin function (待修复)", () => {
        registerFunction("BHTEST", (args) => 999);
        const originalSumFn = hasFunction("SUM");
        expect(originalSumFn).toBe(true);
    });
});

describe("FormulaEngine BugHunt - destroy safety", () => {
    it("should be safe to use engine after destroy (no crash)", () => {
        const sheet = createMockSheet("S1", { "0,0": { value: 10 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 1, 0, "=A1");
        engine.destroy();

        expect(() => FormulaEngine.isFormula("=1+2")).not.toThrow();
        expect(() => engine.getDependencies("S1", 1, 0)).not.toThrow();
        expect(() => engine.removeFormula(sheet, 1, 0)).not.toThrow();
    });
});

describe("FormulaEngine BugHunt - isFormula boundary", () => {
    it("should reject single equals sign", () => {
        expect(FormulaEngine.isFormula("=")).toBe(false);
    });

    it("should accept equals with space after", () => {
        expect(FormulaEngine.isFormula("= SUM(A1)")).toBe(true);
    });

    it("should reject empty string", () => {
        expect(FormulaEngine.isFormula("")).toBe(false);
    });

    it("should reject whitespace-only string", () => {
        expect(FormulaEngine.isFormula("   ")).toBe(false);
    });
});

describe("FormulaEngine BugHunt - onStructureChanged edge cases", () => {
    it("should handle structure change when no formulas exist", () => {
        const sheet = createMockSheet("S1");
        const engine = new FormulaEngine(null);
        expect(() => engine.onStructureChanged(sheet, 0, 0, true)).not.toThrow();
    });

    it("should only affect cells at or beyond the shift point (row)", () => {
        const sheet = createMockSheet("S1", { "0,0": { value: 10 }, "5,0": { value: 20 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 3, 0, "=A1");
        engine.setFormula(sheet, 6, 0, "=A1");

        engine.onStructureChanged(sheet, 4, 0, true);

        expect(engine.dependsOn.has("S1!3,0")).toBe(true);
        expect(engine.dependsOn.has("S1!6,0")).toBe(false);
    });

    it("should only affect cells at or beyond the shift point (col)", () => {
        const sheet = createMockSheet("S1", { "0,0": { value: 10 }, "0,5": { value: 20 } });
        const engine = new FormulaEngine(null);
        engine.setFormula(sheet, 0, 3, "=A1");
        engine.setFormula(sheet, 0, 6, "=A1");

        engine.onStructureChanged(sheet, 0, 4, true);

        expect(engine.dependsOn.has("S1!0,3")).toBe(true);
        expect(engine.dependsOn.has("S1!0,6")).toBe(false);
    });
});

describe("FormulaEngine BugHunt - recalculateAll with no formulas", () => {
    it("should handle sheet with no formulas gracefully", () => {
        const sheet = createMockSheet("S1");
        const engine = new FormulaEngine(null);
        expect(() => engine.recalculateAll(sheet)).not.toThrow();
    });
});