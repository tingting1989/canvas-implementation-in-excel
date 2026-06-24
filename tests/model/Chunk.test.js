import { describe, it, expect } from "vitest";
import { Chunk } from "../../src/model/store/Chunk.js";

describe("Chunk", () => {
    it("should create with rowStart and colStart", () => {
        const chunk = new Chunk(0, 0);
        expect(chunk.rowStart).toBe(0);
        expect(chunk.colStart).toBe(0);
        expect(chunk.cells.size).toBe(0);
    });

    it("should set and get a cell", () => {
        const chunk = new Chunk(0, 0);
        const cell = { value: "test", styleId: 0, disabled: false, formula: null };
        chunk.set(0, 0, cell);
        expect(chunk.get(0, 0)).toBe(cell);
    });

    it("should return undefined for non-existent cell", () => {
        const chunk = new Chunk(0, 0);
        expect(chunk.get(0, 0)).toBeUndefined();
    });

    it("should delete a cell", () => {
        const chunk = new Chunk(0, 0);
        const cell = { value: "test" };
        chunk.set(5, 10, cell);
        expect(chunk.get(5, 10)).toBe(cell);
        chunk.delete(5, 10);
        expect(chunk.get(5, 10)).toBeUndefined();
    });

    it("should iterate over all cells", () => {
        const chunk = new Chunk(0, 0);
        chunk.set(0, 0, { value: "a" });
        chunk.set(1, 2, { value: "b" });
        chunk.set(3, 4, { value: "c" });

        const results = [];
        for (const item of chunk.iterate()) {
            results.push(item);
        }
        expect(results).toHaveLength(3);

        const coords = results.map((r) => `${r.row},${r.col}`).sort();
        expect(coords).toContain("0,0");
        expect(coords).toContain("1,2");
        expect(coords).toContain("3,4");
    });

    it("should handle cells at chunk boundaries", () => {
        const chunk = new Chunk(1024, 256);
        const cell = { value: "boundary" };
        chunk.set(1024, 256, cell);
        expect(chunk.get(1024, 256)).toBe(cell);
    });
});