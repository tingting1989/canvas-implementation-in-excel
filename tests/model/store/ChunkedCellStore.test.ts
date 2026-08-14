import { describe, it, expect } from "vitest";
import { ChunkedCellStore } from "@/model/store/ChunkedCellStore";
import { Cell } from "@/model/store/Cell";

describe("ChunkedCellStore - CRUD", () => {
    it("should set and get a cell", () => {
        const store = new ChunkedCellStore();
        const cell = new Cell("hello");
        store.set(0, 0, cell);
        expect(store.get(0, 0)).toBe(cell);
    });

    it("should return undefined for non-existent cell", () => {
        const store = new ChunkedCellStore();
        expect(store.get(0, 0)).toBeUndefined();
    });

    it("should delete a cell", () => {
        const store = new ChunkedCellStore();
        store.set(0, 0, new Cell("hello"));
        store.delete(0, 0);
        expect(store.get(0, 0)).toBeUndefined();
    });

    it("should handle multiple cells across different positions", () => {
        const store = new ChunkedCellStore();
        store.set(0, 0, new Cell("a"));
        store.set(0, 1, new Cell("b"));
        store.set(100, 50, new Cell("c"));
        expect(store.get(0, 0)?.value).toBe("a");
        expect(store.get(0, 1)?.value).toBe("b");
        expect(store.get(100, 50)?.value).toBe("c");
    });
});

describe("ChunkedCellStore - insertRow", () => {
    it("should shift cells down when inserting a row", () => {
        const store = new ChunkedCellStore();
        store.set(0, 0, new Cell("a"));
        store.set(1, 0, new Cell("b"));
        store.insertRow(0);
        expect(store.get(0, 0)).toBeUndefined();
        expect(store.get(1, 0)?.value).toBe("a");
        expect(store.get(2, 0)?.value).toBe("b");
    });

    it("should only shift cells at or below insertion point", () => {
        const store = new ChunkedCellStore();
        store.set(0, 0, new Cell("a"));
        store.set(2, 0, new Cell("b"));
        store.insertRow(1);
        expect(store.get(0, 0)?.value).toBe("a");
        expect(store.get(3, 0)?.value).toBe("b");
    });
});

describe("ChunkedCellStore - deleteRow", () => {
    it("should remove cells on deleted row and shift up", () => {
        const store = new ChunkedCellStore();
        store.set(0, 0, new Cell("a"));
        store.set(1, 0, new Cell("b"));
        store.set(2, 0, new Cell("c"));
        store.deleteRow(1);
        expect(store.get(0, 0)?.value).toBe("a");
        expect(store.get(1, 0)?.value).toBe("c");
        expect(store.get(2, 0)).toBeUndefined();
    });
});

describe("ChunkedCellStore - insertCol", () => {
    it("should shift cells right when inserting a column", () => {
        const store = new ChunkedCellStore();
        store.set(0, 0, new Cell("a"));
        store.set(0, 1, new Cell("b"));
        store.insertCol(0);
        expect(store.get(0, 0)).toBeUndefined();
        expect(store.get(0, 1)?.value).toBe("a");
        expect(store.get(0, 2)?.value).toBe("b");
    });
});

describe("ChunkedCellStore - deleteCol", () => {
    it("should remove cells on deleted col and shift left", () => {
        const store = new ChunkedCellStore();
        store.set(0, 0, new Cell("a"));
        store.set(0, 1, new Cell("b"));
        store.set(0, 2, new Cell("c"));
        store.deleteCol(1);
        expect(store.get(0, 0)?.value).toBe("a");
        expect(store.get(0, 1)?.value).toBe("c");
        expect(store.get(0, 2)).toBeUndefined();
    });
});

describe("ChunkedCellStore - moveCol", () => {
    it("should move column from one position to another", () => {
        const store = new ChunkedCellStore();
        store.set(0, 0, new Cell("a"));
        store.set(0, 1, new Cell("b"));
        store.set(0, 2, new Cell("c"));
        store.moveCol(0, 2);
        expect(store.get(0, 0)?.value).toBe("b");
        expect(store.get(0, 1)?.value).toBe("c");
        expect(store.get(0, 2)?.value).toBe("a");
    });
});

describe("ChunkedCellStore - getMaxRow/getMaxCol", () => {
    it("should return max row and col", () => {
        const store = new ChunkedCellStore();
        store.set(5, 3, new Cell("a"));
        store.set(10, 7, new Cell("b"));
        expect(store.getMaxRow()).toBe(10);
    });

    it("should return -1 when empty", () => {
        const store = new ChunkedCellStore();
        expect(store.getMaxRow()).toBe(-1);
        expect(store.getMaxCol()).toBe(-1);
    });
});

describe("ChunkedCellStore - clear", () => {
    it("should clear all data", () => {
        const store = new ChunkedCellStore();
        store.set(0, 0, new Cell("a"));
        store.set(1, 1, new Cell("b"));
        const count = store.clear();
        expect(count).toBeGreaterThan(0);
        expect(store.get(0, 0)).toBeUndefined();
        expect(store.get(1, 1)).toBeUndefined();
    });
});

describe("ChunkedCellStore - batchMoveRows", () => {
    it("should batch move rows using snapshot-based chain algorithm", () => {
        const store = new ChunkedCellStore();
        store.set(0, 0, new Cell("a"));
        store.set(1, 0, new Cell("b"));
        store.set(2, 0, new Cell("c"));

        const mapping = new Map<number, number>();
        mapping.set(0, 2);
        mapping.set(1, 0);
        mapping.set(2, 1);

        const moved = store.batchMoveRows(mapping);
        expect(moved).toBeGreaterThan(0);
        expect(store.get(0, 0)?.value).toBe("b");
        expect(store.get(1, 0)?.value).toBe("c");
        expect(store.get(2, 0)?.value).toBe("a");
    });

    it("should return 0 for empty mapping", () => {
        const store = new ChunkedCellStore();
        const moved = store.batchMoveRows(new Map());
        expect(moved).toBe(0);
    });
});