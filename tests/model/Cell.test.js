import { describe, it, expect } from "vitest";
import { Cell } from "../../src/model/store/Cell.js";

describe("Cell", () => {
    it("should create with default values", () => {
        const cell = new Cell();
        expect(cell.value).toBe("");
        expect(cell.styleId).toBe(0);
        expect(cell.disabled).toBe(false);
        expect(cell.formula).toBeNull();
    });

    it("should create with custom values", () => {
        const cell = new Cell("hello", 5, true, "=SUM(A1:A10)");
        expect(cell.value).toBe("hello");
        expect(cell.styleId).toBe(5);
        expect(cell.disabled).toBe(true);
        expect(cell.formula).toBe("=SUM(A1:A10)");
    });

    it("should create with numeric value", () => {
        const cell = new Cell(42);
        expect(cell.value).toBe(42);
    });

    it("should create with zero styleId", () => {
        const cell = new Cell("test", 0);
        expect(cell.styleId).toBe(0);
    });

    it("should allow property mutation", () => {
        const cell = new Cell("old");
        cell.value = "new";
        cell.styleId = 3;
        cell.disabled = true;
        cell.formula = "=A1+B1";
        expect(cell.value).toBe("new");
        expect(cell.styleId).toBe(3);
        expect(cell.disabled).toBe(true);
        expect(cell.formula).toBe("=A1+B1");
    });
});