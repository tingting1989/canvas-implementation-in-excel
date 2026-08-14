import { describe, it, expect } from "vitest";
import { Chunk } from "@/model/store/Chunk";
import { Cell } from "@/model/store/Cell";

describe("Chunk - constructor", () => {
    it("should create chunk with correct rowStart and colStart", () => {
        const chunk = new Chunk(0, 0);
        expect(chunk.rowStart).toBe(0);
        expect(chunk.colStart).toBe(0);
        expect(chunk.cells.size).toBe(0);
    });

    it("should create chunk with non-zero offsets", () => {
        const chunk = new Chunk(1024, 256);
        expect(chunk.rowStart).toBe(1024);
        expect(chunk.colStart).toBe(256);
    });
});

describe("Chunk - get/set/delete", () => {
    it("should set and get a cell", () => {
        const chunk = new Chunk(0, 0);
        const cell = new Cell("hello");
        chunk.set(0, 0, cell);
        expect(chunk.get(0, 0)).toBe(cell);
    });

    it("should return undefined for non-existent cell", () => {
        const chunk = new Chunk(0, 0);
        expect(chunk.get(0, 0)).toBeUndefined();
    });

    it("should delete a cell", () => {
        const chunk = new Chunk(0, 0);
        const cell = new Cell("hello");
        chunk.set(0, 0, cell);
        chunk.delete(0, 0);
        expect(chunk.get(0, 0)).toBeUndefined();
        expect(chunk.cells.size).toBe(0);
    });

    it("should handle multiple cells", () => {
        const chunk = new Chunk(0, 0);
        chunk.set(0, 0, new Cell("a"));
        chunk.set(0, 1, new Cell("b"));
        chunk.set(1, 0, new Cell("c"));
        expect(chunk.cells.size).toBe(3);
        expect(chunk.get(0, 0)?.value).toBe("a");
        expect(chunk.get(0, 1)?.value).toBe("b");
        expect(chunk.get(1, 0)?.value).toBe("c");
    });

    it("should work with offset chunks", () => {
        const chunk = new Chunk(1024, 256);
        chunk.set(1024, 256, new Cell("offset"));
        expect(chunk.get(1024, 256)?.value).toBe("offset");
    });
});

describe("Chunk - iterate", () => {
    it("should iterate over all cells", () => {
        const chunk = new Chunk(0, 0);
        chunk.set(0, 0, new Cell("a"));
        chunk.set(1, 2, new Cell("b"));
        chunk.set(3, 4, new Cell("c"));

        const results = [...chunk.iterate()];
        expect(results).toHaveLength(3);
        expect(results[0]).toEqual({ row: 0, col: 0, cell: expect.any(Cell) });
        expect(results[1]).toEqual({ row: 1, col: 2, cell: expect.any(Cell) });
        expect(results[2]).toEqual({ row: 3, col: 4, cell: expect.any(Cell) });
    });

    it("should return empty iterator for empty chunk", () => {
        const chunk = new Chunk(0, 0);
        expect([...chunk.iterate()]).toHaveLength(0);
    });
});