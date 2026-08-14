import { describe, it, expect } from "vitest";
import { CellDataAccessor } from "@/model/grid/CellDataAccessor";
import { ChunkedCellStore } from "@/model/store/ChunkedCellStore";
import { Cell } from "@/model/store/Cell";

function createAccessor(): { accessor: CellDataAccessor; store: ChunkedCellStore } {
    const store = new ChunkedCellStore();
    const accessor = new CellDataAccessor({ cellStore: store });
    return { accessor, store };
}

describe("CellDataAccessor - get", () => {
    it("should return null for non-existent cell", () => {
        const { accessor } = createAccessor();
        expect(accessor.get(0, 0)).toBeNull();
    });

    it("should return cell for existing cell", () => {
        const { accessor, store } = createAccessor();
        const cell = new Cell("hello");
        store.set(0, 0, cell);
        expect(accessor.get(0, 0)).toBe(cell);
    });
});

describe("CellDataAccessor - getNonEmptyCells", () => {
    it("should return non-empty cells in range", () => {
        const { accessor, store } = createAccessor();
        store.set(0, 0, new Cell("a"));
        store.set(1, 1, new Cell("b"));
        store.set(2, 2, new Cell(""));
        const result = accessor.getNonEmptyCells(0, 0, 2, 2);
        expect(result).toHaveLength(2);
        expect(result[0].row).toBe(0);
        expect(result[0].col).toBe(0);
        expect(result[1].row).toBe(1);
        expect(result[1].col).toBe(1);
    });

    it("should return empty array for range with no data", () => {
        const { accessor } = createAccessor();
        expect(accessor.getNonEmptyCells(0, 0, 5, 5)).toHaveLength(0);
    });
});

describe("CellDataAccessor - getValueMatrix", () => {
    it("should return value matrix with empty string for missing cells", () => {
        const { accessor, store } = createAccessor();
        store.set(0, 0, new Cell("a"));
        store.set(0, 1, new Cell("b"));
        store.set(1, 0, new Cell("c"));
        const matrix = accessor.getValueMatrix(0, 0, 1, 1);
        expect(matrix).toEqual([["a", "b"], ["c", ""]]);
    });
});

describe("CellDataAccessor - forEach", () => {
    it("should iterate over all cells in range", () => {
        const { accessor, store } = createAccessor();
        store.set(0, 0, new Cell("a"));
        store.set(1, 1, new Cell("b"));
        const visited: Array<[number, number]> = [];
        accessor.forEach(0, 0, 1, 1, (row, col) => {
            visited.push([row, col]);
        });
        expect(visited).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
    });
});

describe("CellDataAccessor - iterate", () => {
    it("should yield cells in range", () => {
        const { accessor, store } = createAccessor();
        store.set(0, 0, new Cell("a"));
        store.set(1, 1, new Cell("b"));
        const results = [...accessor.iterate(0, 0, 1, 1)];
        expect(results).toHaveLength(4);
        expect(results[0].row).toBe(0);
        expect(results[0].col).toBe(0);
        expect(results[0].cell?.value).toBe("a");
    });
});

describe("CellDataAccessor - setRange", () => {
    it("should batch write cells", () => {
        const { accessor, store } = createAccessor();
        accessor.setRange(0, 0, [[new Cell("a"), new Cell("b")], [new Cell("c"), new Cell("d")]]);
        expect(store.get(0, 0)?.value).toBe("a");
        expect(store.get(0, 1)?.value).toBe("b");
        expect(store.get(1, 0)?.value).toBe("c");
        expect(store.get(1, 1)?.value).toBe("d");
    });
});

describe("CellDataAccessor - clearAll", () => {
    it("should clear all cells and return changes", () => {
        const { accessor, store } = createAccessor();
        store.set(0, 0, new Cell("a"));
        store.set(1, 1, new Cell("b"));
        const { changes, clearedCount } = accessor.clearAll();
        expect(changes).toHaveLength(2);
        expect(clearedCount).toBeGreaterThan(0);
        expect(store.get(0, 0)).toBeUndefined();
    });
});

describe("CellDataAccessor - clearRange", () => {
    it("should clear cells in range and return changes", () => {
        const { accessor, store } = createAccessor();
        store.set(0, 0, new Cell("a"));
        store.set(1, 1, new Cell("b"));
        store.set(5, 5, new Cell("c"));
        const { changes, clearedCount } = accessor.clearRange(0, 0, 1, 1);
        expect(changes).toHaveLength(2);
        expect(clearedCount).toBe(2);
        expect(store.get(0, 0)).toBeUndefined();
        expect(store.get(5, 5)?.value).toBe("c");
    });
});