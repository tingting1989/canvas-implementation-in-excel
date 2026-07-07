import { describe, it, expect, beforeEach } from "vitest";
import { ChunkedCellStore } from "../../src/model/store/ChunkedCellStore.js";
import { Cell } from "../../src/model/store/Cell.js";

describe("ChunkedCellStore", () => {
    let store;

    beforeEach(() => {
        store = new ChunkedCellStore();
    });

    describe("CRUD", () => {
        it("should return undefined for non-existent cell", () => {
            expect(store.get(0, 0)).toBeUndefined();
        });

        it("should set and get a cell", () => {
            const cell = new Cell("hello");
            store.set(0, 0, cell);
            expect(store.get(0, 0)).toBe(cell);
            expect(store.get(0, 0).value).toBe("hello");
        });

        it("should set cells at various positions", () => {
            store.set(0, 0, new Cell("a"));
            store.set(100, 50, new Cell("b"));
            store.set(1023, 255, new Cell("c"));
            expect(store.get(0, 0).value).toBe("a");
            expect(store.get(100, 50).value).toBe("b");
            expect(store.get(1023, 255).value).toBe("c");
        });

        it("should overwrite existing cell", () => {
            store.set(5, 5, new Cell("old"));
            store.set(5, 5, new Cell("new"));
            expect(store.get(5, 5).value).toBe("new");
        });

        it("should delete a cell", () => {
            store.set(10, 20, new Cell("delete-me"));
            store.delete(10, 20);
            expect(store.get(10, 20)).toBeUndefined();
        });

        it("should handle delete on non-existent cell without error", () => {
            expect(() => store.delete(999, 999)).not.toThrow();
        });

        it("should handle cells across chunk boundaries", () => {
            store.set(1023, 255, new Cell("end-of-chunk-0-0"));
            store.set(1024, 256, new Cell("start-of-chunk-1-1"));
            expect(store.get(1023, 255).value).toBe("end-of-chunk-0-0");
            expect(store.get(1024, 256).value).toBe("start-of-chunk-1-1");
        });

        it("should handle cells in different chunks independently", () => {
            store.set(0, 0, new Cell("chunk-a"));
            store.set(1024, 0, new Cell("chunk-b"));
            store.set(0, 256, new Cell("chunk-c"));
            expect(store.get(0, 0).value).toBe("chunk-a");
            expect(store.get(1024, 0).value).toBe("chunk-b");
            expect(store.get(0, 256).value).toBe("chunk-c");
        });

        it("should set cell with all properties", () => {
            const cell = new Cell(42, 5, true, "=SUM(A1:A10)");
            store.set(0, 0, cell);
            const retrieved = store.get(0, 0);
            expect(retrieved.value).toBe(42);
            expect(retrieved.styleId).toBe(5);
            expect(retrieved.disabled).toBe(true);
            expect(retrieved.formula).toBe("=SUM(A1:A10)");
        });
    });

    describe("insertRow", () => {
        it("should insert row and shift cells down", () => {
            store.set(5, 0, new Cell("above"));
            store.set(10, 0, new Cell("at-row"));
            store.set(10, 1, new Cell("at-row-col1"));

            store.insertRow(10);

            expect(store.get(5, 0).value).toBe("above");
            expect(store.get(10, 0)).toBeUndefined();
            expect(store.get(11, 0).value).toBe("at-row");
            expect(store.get(11, 1).value).toBe("at-row-col1");
        });

        it("should not affect cells above insertion point", () => {
            store.set(3, 0, new Cell("stay"));
            store.set(3, 5, new Cell("stay-col5"));

            store.insertRow(10);

            expect(store.get(3, 0).value).toBe("stay");
            expect(store.get(3, 5).value).toBe("stay-col5");
        });

        it("should shift cells across multiple columns", () => {
            store.set(10, 0, new Cell("a"));
            store.set(10, 3, new Cell("b"));
            store.set(10, 10, new Cell("c"));

            store.insertRow(10);

            expect(store.get(10, 0)).toBeUndefined();
            expect(store.get(11, 0).value).toBe("a");
            expect(store.get(11, 3).value).toBe("b");
            expect(store.get(11, 10).value).toBe("c");
        });

        it("should handle insertion at row 0", () => {
            store.set(0, 0, new Cell("top"));

            store.insertRow(0);

            expect(store.get(0, 0)).toBeUndefined();
            expect(store.get(1, 0).value).toBe("top");
        });

        it("should handle insertion with cells across chunk boundaries", () => {
            store.set(1023, 0, new Cell("last-row-chunk0"));
            store.set(1024, 0, new Cell("first-row-chunk1"));

            store.insertRow(1024);

            expect(store.get(1023, 0).value).toBe("last-row-chunk0");
            expect(store.get(1024, 0)).toBeUndefined();
            expect(store.get(1025, 0).value).toBe("first-row-chunk1");
        });

        it("should leave inserted row empty", () => {
            store.set(10, 0, new Cell("shifted"));

            store.insertRow(10);

            expect(store.get(10, 0)).toBeUndefined();
            expect(store.get(11, 0).value).toBe("shifted");
        });

        it("should shift multiple cells in same row", () => {
            store.set(5, 0, new Cell("r5c0"));
            store.set(5, 1, new Cell("r5c1"));
            store.set(5, 2, new Cell("r5c2"));

            store.insertRow(5);

            expect(store.get(6, 0).value).toBe("r5c0");
            expect(store.get(6, 1).value).toBe("r5c1");
            expect(store.get(6, 2).value).toBe("r5c2");
        });
    });

    describe("insertCol", () => {
        it("should insert column and shift cells right", () => {
            store.set(0, 5, new Cell("left"));
            store.set(0, 10, new Cell("at-col"));

            store.insertCol(10);

            expect(store.get(0, 5).value).toBe("left");
            expect(store.get(0, 10)).toBeUndefined();
            expect(store.get(0, 11).value).toBe("at-col");
        });

        it("should not affect cells left of insertion point", () => {
            store.set(0, 3, new Cell("stay"));

            store.insertCol(10);

            expect(store.get(0, 3).value).toBe("stay");
        });

        it("should shift cells across multiple rows", () => {
            store.set(0, 10, new Cell("a"));
            store.set(5, 10, new Cell("b"));
            store.set(100, 10, new Cell("c"));

            store.insertCol(10);

            expect(store.get(0, 11).value).toBe("a");
            expect(store.get(5, 11).value).toBe("b");
            expect(store.get(100, 11).value).toBe("c");
        });

        it("should handle insertion at column 0", () => {
            store.set(0, 0, new Cell("first"));

            store.insertCol(0);

            expect(store.get(0, 0)).toBeUndefined();
            expect(store.get(0, 1).value).toBe("first");
        });

        it("should handle insertion with cells across chunk boundaries", () => {
            store.set(0, 255, new Cell("last-col-chunk0"));
            store.set(0, 256, new Cell("first-col-chunk1"));

            store.insertCol(256);

            expect(store.get(0, 255).value).toBe("last-col-chunk0");
            expect(store.get(0, 256)).toBeUndefined();
            expect(store.get(0, 257).value).toBe("first-col-chunk1");
        });
    });

    describe("deleteRow", () => {
        it("should delete row and shift cells up", () => {
            store.set(9, 0, new Cell("above"));
            store.set(10, 0, new Cell("deleted"));
            store.set(10, 3, new Cell("deleted-col3"));
            store.set(11, 0, new Cell("shifted"));

            store.deleteRow(10);

            expect(store.get(9, 0).value).toBe("above");
            expect(store.get(10, 0).value).toBe("shifted");
            expect(store.get(10, 3)).toBeUndefined();
        });

        it("should not affect cells above deleted row", () => {
            store.set(5, 0, new Cell("stay"));
            store.set(5, 10, new Cell("stay-col10"));

            store.deleteRow(10);

            expect(store.get(5, 0).value).toBe("stay");
            expect(store.get(5, 10).value).toBe("stay-col10");
        });

        it("should handle deletion at row 0", () => {
            store.set(0, 0, new Cell("deleted"));
            store.set(1, 0, new Cell("shifted"));

            store.deleteRow(0);

            expect(store.get(0, 0).value).toBe("shifted");
        });

        it("should handle deletion with cells across chunk boundaries", () => {
            store.set(1023, 0, new Cell("chunk0"));
            store.set(1024, 0, new Cell("chunk1"));
            store.set(1025, 0, new Cell("chunk1-next"));

            store.deleteRow(1024);

            expect(store.get(1023, 0).value).toBe("chunk0");
            expect(store.get(1024, 0).value).toBe("chunk1-next");
        });

        it("should handle deleting only row with data", () => {
            store.set(5, 0, new Cell("only"));

            store.deleteRow(5);

            expect(store.get(5, 0)).toBeUndefined();
        });

        it("should shift multiple rows up after deletion", () => {
            store.set(10, 0, new Cell("r10"));
            store.set(11, 0, new Cell("r11"));
            store.set(12, 0, new Cell("r12"));

            store.deleteRow(10);

            expect(store.get(10, 0).value).toBe("r11");
            expect(store.get(11, 0).value).toBe("r12");
        });
    });

    describe("deleteCol", () => {
        it("should delete column and shift cells left", () => {
            store.set(0, 9, new Cell("left"));
            store.set(0, 10, new Cell("deleted"));
            store.set(0, 11, new Cell("shifted"));
            store.set(5, 10, new Cell("deleted-row5"));

            store.deleteCol(10);

            expect(store.get(0, 9).value).toBe("left");
            expect(store.get(0, 10).value).toBe("shifted");
            expect(store.get(5, 10)).toBeUndefined();
        });

        it("should not affect cells left of deleted column", () => {
            store.set(0, 5, new Cell("stay"));

            store.deleteCol(10);

            expect(store.get(0, 5).value).toBe("stay");
        });

        it("should handle deletion at column 0", () => {
            store.set(0, 0, new Cell("deleted"));
            store.set(0, 1, new Cell("shifted"));

            store.deleteCol(0);

            expect(store.get(0, 0).value).toBe("shifted");
        });

        it("should handle deletion with cells across chunk boundaries", () => {
            store.set(0, 255, new Cell("chunk0"));
            store.set(0, 256, new Cell("chunk1"));
            store.set(0, 257, new Cell("chunk1-next"));

            store.deleteCol(256);

            expect(store.get(0, 255).value).toBe("chunk0");
            expect(store.get(0, 256).value).toBe("chunk1-next");
        });
    });

    describe("moveCol", () => {
        it("should move column right", () => {
            store.set(0, 2, new Cell("source"));
            store.set(0, 3, new Cell("mid3"));
            store.set(0, 4, new Cell("mid4"));
            store.set(0, 5, new Cell("target"));

            store.moveCol(2, 5);

            expect(store.get(0, 5).value).toBe("source");
            expect(store.get(0, 2).value).toBe("mid3");
            expect(store.get(0, 3).value).toBe("mid4");
            expect(store.get(0, 4).value).toBe("target");
        });

        it("should move column left", () => {
            store.set(0, 5, new Cell("source"));
            store.set(0, 2, new Cell("target"));
            store.set(0, 3, new Cell("mid3"));
            store.set(0, 4, new Cell("mid4"));

            store.moveCol(5, 2);

            expect(store.get(0, 2).value).toBe("source");
            expect(store.get(0, 3).value).toBe("target");
            expect(store.get(0, 4).value).toBe("mid3");
            expect(store.get(0, 5).value).toBe("mid4");
        });

        it("should do nothing when from === to", () => {
            store.set(0, 3, new Cell("stay"));

            store.moveCol(3, 3);

            expect(store.get(0, 3).value).toBe("stay");
        });

        it("should move column with multiple rows", () => {
            store.set(0, 2, new Cell("r0"));
            store.set(1, 2, new Cell("r1"));
            store.set(2, 2, new Cell("r2"));
            store.set(0, 3, new Cell("r0-mid"));

            store.moveCol(2, 3);

            expect(store.get(0, 3).value).toBe("r0");
            expect(store.get(1, 3).value).toBe("r1");
            expect(store.get(2, 3).value).toBe("r2");
            expect(store.get(0, 2).value).toBe("r0-mid");
        });

        it("should move column across chunk boundaries", () => {
            store.set(0, 255, new Cell("source"));
            store.set(0, 256, new Cell("next-chunk"));

            store.moveCol(255, 256);

            expect(store.get(0, 256).value).toBe("source");
            expect(store.get(0, 255).value).toBe("next-chunk");
        });

        it("should handle empty source column", () => {
            store.set(0, 3, new Cell("mid"));

            store.moveCol(2, 4);

            expect(store.get(0, 2).value).toBe("mid");
            expect(store.get(0, 3)).toBeUndefined();
        });
    });

    describe("moveRow", () => {
        it("should move row down", () => {
            store.set(2, 0, new Cell("source"));
            store.set(3, 0, new Cell("mid3"));
            store.set(4, 0, new Cell("mid4"));
            store.set(5, 0, new Cell("target"));

            store.moveRow(2, 5);

            expect(store.get(5, 0).value).toBe("source");
            expect(store.get(2, 0).value).toBe("mid3");
            expect(store.get(3, 0).value).toBe("mid4");
            expect(store.get(4, 0).value).toBe("target");
        });

        it("should move row up", () => {
            store.set(5, 0, new Cell("source"));
            store.set(2, 0, new Cell("target"));
            store.set(3, 0, new Cell("mid3"));
            store.set(4, 0, new Cell("mid4"));

            store.moveRow(5, 2);

            expect(store.get(2, 0).value).toBe("source");
            expect(store.get(3, 0).value).toBe("target");
            expect(store.get(4, 0).value).toBe("mid3");
            expect(store.get(5, 0).value).toBe("mid4");
        });

        it("should do nothing when from === to", () => {
            store.set(3, 0, new Cell("stay"));

            store.moveRow(3, 3);

            expect(store.get(3, 0).value).toBe("stay");
        });

        it("should move row with multiple columns", () => {
            store.set(5, 0, new Cell("c0"));
            store.set(5, 1, new Cell("c1"));
            store.set(5, 2, new Cell("c2"));

            store.moveRow(5, 7);

            expect(store.get(7, 0).value).toBe("c0");
            expect(store.get(7, 1).value).toBe("c1");
            expect(store.get(7, 2).value).toBe("c2");
            expect(store.get(5, 0)).toBeUndefined();
        });

        it("should move row across chunk boundaries", () => {
            store.set(1023, 0, new Cell("source"));
            store.set(1024, 0, new Cell("next-chunk"));

            store.moveRow(1023, 1024);

            expect(store.get(1024, 0).value).toBe("source");
            expect(store.get(1023, 0).value).toBe("next-chunk");
        });
    });

    describe("getMaxRow / getMaxCol", () => {
        it("should return -1 when no data", () => {
            expect(store.getMaxRow()).toBe(-1);
            expect(store.getMaxCol()).toBe(-1);
        });

        it("should return max row of non-empty chunk", () => {
            store.set(0, 0, new Cell("data"));

            expect(store.getMaxRow()).toBe(0);
            expect(store.getMaxCol()).toBe(255);
        });

        it("should return max across multiple chunks", () => {
            store.set(0, 0, new Cell("a"));
            store.set(1024, 0, new Cell("b"));

            expect(store.getMaxRow()).toBe(1024);
        });

        it("should return max col across multiple chunks", () => {
            store.set(0, 0, new Cell("a"));
            store.set(0, 256, new Cell("b"));

            expect(store.getMaxCol()).toBe(511);
        });

        it("should ignore empty chunks after deletion", () => {
            store.set(0, 0, new Cell("data"));
            store.delete(0, 0);

            expect(store.getMaxRow()).toBe(-1);
            expect(store.getMaxCol()).toBe(-1);
        });
    });

    describe("chunks generator", () => {
        it("should yield no chunks for empty store", () => {
            const result = [...store.chunks()];
            expect(result).toHaveLength(0);
        });

        it("should yield chunks with data", () => {
            store.set(0, 0, new Cell("a"));
            store.set(1024, 0, new Cell("b"));

            const result = [...store.chunks()];
            expect(result.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe("edge cases", () => {
        it("should handle large row/col numbers", () => {
            store.set(9999999, 69999, new Cell("max"));
            expect(store.get(9999999, 69999).value).toBe("max");
        });

        it("should handle set then delete then set again", () => {
            store.set(5, 5, new Cell("first"));
            store.delete(5, 5);
            store.set(5, 5, new Cell("second"));
            expect(store.get(5, 5).value).toBe("second");
        });

        it("should handle insertRow at position beyond all data", () => {
            store.set(5, 0, new Cell("data"));

            store.insertRow(100);

            expect(store.get(5, 0).value).toBe("data");
        });

        it("should handle insertCol at position beyond all data", () => {
            store.set(0, 5, new Cell("data"));

            store.insertCol(100);

            expect(store.get(0, 5).value).toBe("data");
        });

        it("should handle deleteRow at position beyond all data", () => {
            store.set(5, 0, new Cell("data"));

            store.deleteRow(100);

            expect(store.get(5, 0).value).toBe("data");
        });

        it("should handle deleteCol at position beyond all data", () => {
            store.set(0, 5, new Cell("data"));

            store.deleteCol(100);

            expect(store.get(0, 5).value).toBe("data");
        });

        it("should handle multiple sequential insertRow operations", () => {
            store.set(5, 0, new Cell("original"));

            store.insertRow(5);
            store.insertRow(5);

            expect(store.get(7, 0).value).toBe("original");
            expect(store.get(5, 0)).toBeUndefined();
            expect(store.get(6, 0)).toBeUndefined();
        });

        it("should handle multiple sequential insertCol operations", () => {
            store.set(0, 5, new Cell("original"));

            store.insertCol(5);
            store.insertCol(5);

            expect(store.get(0, 7).value).toBe("original");
            expect(store.get(0, 5)).toBeUndefined();
            expect(store.get(0, 6)).toBeUndefined();
        });

        it("should handle insertRow then deleteRow round-trip", () => {
            store.set(5, 0, new Cell("original"));

            store.insertRow(5);
            expect(store.get(6, 0).value).toBe("original");

            store.deleteRow(5);
            expect(store.get(5, 0).value).toBe("original");
        });
    });
});