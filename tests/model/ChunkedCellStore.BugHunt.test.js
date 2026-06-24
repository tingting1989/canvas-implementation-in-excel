import { describe, it, expect, beforeEach } from "vitest";
import { ChunkedCellStore } from "../../src/model/store/ChunkedCellStore.js";
import { Cell } from "../../src/model/store/Cell.js";

describe("ChunkedCellStore - Bug Hunting", () => {
    let store;

    beforeEach(() => {
        store = new ChunkedCellStore();
    });

    describe("insertRow - 数据完整性不变量", () => {
        it("BUG: insertRow后总Cell数应保持不变（不应丢失或复制Cell）", () => {
            store.set(5, 0, new Cell("A"));
            store.set(5, 1, new Cell("B"));
            store.set(5, 2, new Cell("C"));
            const countBefore = countCells(store);

            store.insertRow(5);

            const countAfter = countCells(store);
            expect(countAfter).toBe(countBefore);
        });

        it("BUG: insertRow不应影响插入点以上的数据", () => {
            store.set(0, 0, new Cell("top-left"));
            store.set(0, 255, new Cell("top-right"));
            store.set(3, 0, new Cell("row3"));

            store.insertRow(5);

            expect(store.get(0, 0).value).toBe("top-left");
            expect(store.get(0, 255).value).toBe("top-right");
            expect(store.get(3, 0).value).toBe("row3");
        });

        it("BUG: insertRow在chunk边界(1024)处不应丢失跨chunk数据", () => {
            store.set(1023, 0, new Cell("last-row-chunk0"));
            store.set(1023, 255, new Cell("last-row-chunk0-col255"));
            store.set(1024, 0, new Cell("first-row-chunk1"));
            store.set(1024, 1, new Cell("first-row-chunk1-col1"));

            store.insertRow(1024);

            expect(store.get(1023, 0).value).toBe("last-row-chunk0");
            expect(store.get(1023, 255).value).toBe("last-row-chunk0-col255");
            expect(store.get(1025, 0).value).toBe("first-row-chunk1");
            expect(store.get(1025, 1).value).toBe("first-row-chunk1-col1");
            expect(store.get(1024, 0)).toBeUndefined();
        });

        it("BUG: 连续insertRow后数据一致性", () => {
            store.set(5, 0, new Cell("original"));

            store.insertRow(5);
            store.insertRow(5);
            store.insertRow(5);

            expect(store.get(8, 0).value).toBe("original");
            expect(store.get(5, 0)).toBeUndefined();
            expect(store.get(6, 0)).toBeUndefined();
            expect(store.get(7, 0)).toBeUndefined();
        });
    });

    describe("deleteRow - 数据完整性不变量", () => {
        it("BUG: deleteRow后总Cell数应减少被删行的Cell数", () => {
            store.set(5, 0, new Cell("to-delete"));
            store.set(5, 1, new Cell("also-delete"));
            store.set(6, 0, new Cell("shift-up"));
            const countBefore = countCells(store);

            store.deleteRow(5);

            const countAfter = countCells(store);
            expect(countAfter).toBe(countBefore - 2);
            expect(store.get(5, 0).value).toBe("shift-up");
        });

        it("BUG: deleteRow在chunk边界处不应丢失跨chunk数据", () => {
            store.set(1023, 0, new Cell("chunk0-last"));
            store.set(1024, 0, new Cell("chunk1-first"));
            store.set(1025, 0, new Cell("chunk1-second"));

            store.deleteRow(1024);

            expect(store.get(1023, 0).value).toBe("chunk0-last");
            expect(store.get(1024, 0).value).toBe("chunk1-second");
        });

        it("BUG: deleteRow删除最后一行有数据的行不应影响其他行", () => {
            store.set(0, 0, new Cell("row0"));
            store.set(100, 0, new Cell("row100"));

            store.deleteRow(100);

            expect(store.get(0, 0).value).toBe("row0");
            expect(store.get(100, 0)).toBeUndefined();
        });
    });

    describe("insertCol - 数据完整性不变量", () => {
        it("BUG: insertCol后总Cell数应保持不变", () => {
            store.set(0, 5, new Cell("A"));
            store.set(0, 6, new Cell("B"));
            store.set(1, 5, new Cell("C"));
            const countBefore = countCells(store);

            store.insertCol(5);

            const countAfter = countCells(store);
            expect(countAfter).toBe(countBefore);
        });

        it("BUG: insertCol在chunk边界(256)处不应丢失跨chunk数据", () => {
            store.set(0, 255, new Cell("last-col-chunk0"));
            store.set(0, 256, new Cell("first-col-chunk1"));
            store.set(1, 256, new Cell("row1-chunk1"));

            store.insertCol(256);

            expect(store.get(0, 255).value).toBe("last-col-chunk0");
            expect(store.get(0, 257).value).toBe("first-col-chunk1");
            expect(store.get(1, 257).value).toBe("row1-chunk1");
            expect(store.get(0, 256)).toBeUndefined();
        });
    });

    describe("deleteCol - 数据完整性不变量", () => {
        it("BUG: deleteCol后总Cell数应减少被删列的Cell数", () => {
            store.set(0, 5, new Cell("delete-me"));
            store.set(0, 6, new Cell("shift-left"));
            store.set(1, 5, new Cell("also-delete"));
            const countBefore = countCells(store);

            store.deleteCol(5);

            const countAfter = countCells(store);
            expect(countAfter).toBe(countBefore - 2);
            expect(store.get(0, 5).value).toBe("shift-left");
        });

        it("BUG: deleteCol在chunk边界处不应丢失跨chunk数据", () => {
            store.set(0, 255, new Cell("chunk0-last"));
            store.set(0, 256, new Cell("chunk1-first"));
            store.set(0, 257, new Cell("chunk1-second"));

            store.deleteCol(256);

            expect(store.get(0, 255).value).toBe("chunk0-last");
            expect(store.get(0, 256).value).toBe("chunk1-second");
        });
    });

    describe("moveRow - 数据完整性不变量", () => {
        it("BUG: moveRow后总Cell数应保持不变", () => {
            store.set(2, 0, new Cell("A"));
            store.set(2, 1, new Cell("B"));
            store.set(3, 0, new Cell("C"));
            store.set(4, 0, new Cell("D"));
            store.set(5, 0, new Cell("E"));
            const countBefore = countCells(store);

            store.moveRow(2, 5);

            const countAfter = countCells(store);
            expect(countAfter).toBe(countBefore);
        });

        it("BUG: moveRow向下移动后中间行应正确顺移", () => {
            store.set(2, 0, new Cell("source"));
            store.set(3, 0, new Cell("mid3"));
            store.set(4, 0, new Cell("mid4"));
            store.set(5, 0, new Cell("mid5"));

            store.moveRow(2, 5);

            expect(store.get(5, 0).value).toBe("source");
            expect(store.get(2, 0).value).toBe("mid3");
            expect(store.get(3, 0).value).toBe("mid4");
            expect(store.get(4, 0).value).toBe("mid5");
        });

        it("BUG: moveRow向上移动后中间行应正确顺移", () => {
            store.set(5, 0, new Cell("source"));
            store.set(4, 0, new Cell("mid4"));
            store.set(3, 0, new Cell("mid3"));
            store.set(2, 0, new Cell("mid2"));

            store.moveRow(5, 2);

            expect(store.get(2, 0).value).toBe("source");
            expect(store.get(3, 0).value).toBe("mid2");
            expect(store.get(4, 0).value).toBe("mid3");
            expect(store.get(5, 0).value).toBe("mid4");
        });

        it("BUG: moveRow跨chunk边界不应丢失数据", () => {
            store.set(1023, 0, new Cell("chunk0-row"));
            store.set(1023, 1, new Cell("chunk0-col1"));
            store.set(1024, 0, new Cell("chunk1-row"));
            store.set(1025, 0, new Cell("chunk1-row2"));

            store.moveRow(1023, 1025);

            expect(store.get(1025, 0).value).toBe("chunk0-row");
            expect(store.get(1025, 1).value).toBe("chunk0-col1");
            expect(store.get(1023, 0).value).toBe("chunk1-row");
            expect(store.get(1024, 0).value).toBe("chunk1-row2");
        });

        it("BUG: moveRow后中间行应正确上移", () => {
            store.set(5, 0, new Cell("source"));
            store.set(5, 3, new Cell("source-col3"));
            store.set(6, 0, new Cell("below"));

            store.moveRow(5, 10);

            expect(store.get(10, 0).value).toBe("source");
            expect(store.get(10, 3).value).toBe("source-col3");
            expect(store.get(5, 0).value).toBe("below");
            expect(store.get(5, 3)).toBeUndefined();
            expect(store.get(6, 0)).toBeUndefined();
        });
    });

    describe("moveCol - 数据完整性不变量", () => {
        it("BUG: moveCol后总Cell数应保持不变", () => {
            store.set(0, 2, new Cell("A"));
            store.set(0, 3, new Cell("B"));
            store.set(1, 2, new Cell("C"));
            store.set(0, 4, new Cell("D"));
            const countBefore = countCells(store);

            store.moveCol(2, 4);

            const countAfter = countCells(store);
            expect(countAfter).toBe(countBefore);
        });

        it("BUG: moveCol跨chunk边界不应丢失数据", () => {
            store.set(0, 255, new Cell("chunk0-col"));
            store.set(1, 255, new Cell("chunk0-col-row1"));
            store.set(0, 256, new Cell("chunk1-col"));
            store.set(0, 257, new Cell("chunk1-col2"));

            store.moveCol(255, 257);

            expect(store.get(0, 257).value).toBe("chunk0-col");
            expect(store.get(1, 257).value).toBe("chunk0-col-row1");
            expect(store.get(0, 255).value).toBe("chunk1-col");
            expect(store.get(0, 256).value).toBe("chunk1-col2");
        });

        it("BUG: moveCol后中间列应正确左移", () => {
            store.set(0, 5, new Cell("source"));
            store.set(3, 5, new Cell("source-row3"));
            store.set(0, 6, new Cell("right"));

            store.moveCol(5, 10);

            expect(store.get(0, 10).value).toBe("source");
            expect(store.get(3, 10).value).toBe("source-row3");
            expect(store.get(0, 5).value).toBe("right");
            expect(store.get(3, 5)).toBeUndefined();
            expect(store.get(0, 6)).toBeUndefined();
        });
    });

    describe("复合操作 - 不变量测试", () => {
        it("BUG: insertRow + deleteRow应恢复原状态", () => {
            store.set(5, 0, new Cell("A"));
            store.set(5, 1, new Cell("B"));
            store.set(6, 0, new Cell("C"));

            store.insertRow(5);
            store.deleteRow(5);

            expect(store.get(5, 0).value).toBe("A");
            expect(store.get(5, 1).value).toBe("B");
            expect(store.get(6, 0).value).toBe("C");
        });

        it("BUG: insertCol + deleteCol应恢复原状态", () => {
            store.set(0, 5, new Cell("A"));
            store.set(0, 6, new Cell("B"));

            store.insertCol(5);
            store.deleteCol(5);

            expect(store.get(0, 5).value).toBe("A");
            expect(store.get(0, 6).value).toBe("B");
        });

        it("BUG: moveRow + moveRow(反向)应恢复原状态", () => {
            store.set(2, 0, new Cell("A"));
            store.set(3, 0, new Cell("B"));
            store.set(4, 0, new Cell("C"));

            store.moveRow(2, 4);
            store.moveRow(4, 2);

            expect(store.get(2, 0).value).toBe("A");
            expect(store.get(3, 0).value).toBe("B");
            expect(store.get(4, 0).value).toBe("C");
        });

        it("BUG: moveCol + moveCol(反向)应恢复原状态", () => {
            store.set(0, 2, new Cell("A"));
            store.set(0, 3, new Cell("B"));
            store.set(0, 4, new Cell("C"));

            store.moveCol(2, 4);
            store.moveCol(4, 2);

            expect(store.get(0, 2).value).toBe("A");
            expect(store.get(0, 3).value).toBe("B");
            expect(store.get(0, 4).value).toBe("C");
        });

        it("BUG: 大量数据操作后Cell总数应符合预期", () => {
            for (let r = 0; r < 10; r++) {
                for (let c = 0; c < 10; c++) {
                    store.set(r, c, new Cell(`r${r}c${c}`));
                }
            }

            store.insertRow(5);
            store.deleteRow(3);
            store.insertCol(3);
            store.deleteCol(7);
            store.moveRow(2, 6);
            store.moveCol(1, 4);

            const deletedByDeleteRow = 10;
            const deletedByDeleteCol = 9;
            const expectedCount = 100 - deletedByDeleteRow - deletedByDeleteCol;
            expect(countCells(store)).toBe(expectedCount);
        });

        it("BUG: deleteRow后再insertRow不应产生幽灵数据", () => {
            store.set(5, 0, new Cell("real"));

            store.deleteRow(5);
            store.insertRow(5);

            expect(store.get(5, 0)).toBeUndefined();
        });
    });

    describe("边界条件 - 可能触发off-by-one", () => {
        it("BUG: deleteRow(0)不应导致索引偏移", () => {
            store.set(0, 0, new Cell("row0"));
            store.set(1, 0, new Cell("row1"));
            store.set(2, 0, new Cell("row2"));

            store.deleteRow(0);

            expect(store.get(0, 0).value).toBe("row1");
            expect(store.get(1, 0).value).toBe("row2");
        });

        it("BUG: deleteCol(0)不应导致索引偏移", () => {
            store.set(0, 0, new Cell("col0"));
            store.set(0, 1, new Cell("col1"));
            store.set(0, 2, new Cell("col2"));

            store.deleteCol(0);

            expect(store.get(0, 0).value).toBe("col1");
            expect(store.get(0, 1).value).toBe("col2");
        });

        it("BUG: moveRow到row 0应正确处理", () => {
            store.set(3, 0, new Cell("source"));
            store.set(0, 0, new Cell("row0"));
            store.set(1, 0, new Cell("row1"));
            store.set(2, 0, new Cell("row2"));

            store.moveRow(3, 0);

            expect(store.get(0, 0).value).toBe("source");
            expect(store.get(1, 0).value).toBe("row0");
            expect(store.get(2, 0).value).toBe("row1");
            expect(store.get(3, 0).value).toBe("row2");
        });

        it("BUG: moveCol到col 0应正确处理", () => {
            store.set(0, 3, new Cell("source"));
            store.set(0, 0, new Cell("col0"));
            store.set(0, 1, new Cell("col1"));
            store.set(0, 2, new Cell("col2"));

            store.moveCol(3, 0);

            expect(store.get(0, 0).value).toBe("source");
            expect(store.get(0, 1).value).toBe("col0");
            expect(store.get(0, 2).value).toBe("col1");
            expect(store.get(0, 3).value).toBe("col2");
        });

        it("BUG: 空store上deleteRow/deleteCol不应报错", () => {
            expect(() => store.deleteRow(0)).not.toThrow();
            expect(() => store.deleteCol(0)).not.toThrow();
        });

        it("BUG: 空store上moveRow/moveCol不应报错", () => {
            expect(() => store.moveRow(0, 5)).not.toThrow();
            expect(() => store.moveCol(0, 5)).not.toThrow();
        });

        it("BUG: 同一行多列数据insertRow后列关系应保持", () => {
            store.set(5, 0, new Cell("A"));
            store.set(5, 1, new Cell("B"));
            store.set(5, 2, new Cell("C"));

            store.insertRow(5);

            expect(store.get(6, 0).value).toBe("A");
            expect(store.get(6, 1).value).toBe("B");
            expect(store.get(6, 2).value).toBe("C");
        });

        it("BUG: 同一列多行数据insertCol后行关系应保持", () => {
            store.set(0, 5, new Cell("A"));
            store.set(1, 5, new Cell("B"));
            store.set(2, 5, new Cell("C"));

            store.insertCol(5);

            expect(store.get(0, 6).value).toBe("A");
            expect(store.get(1, 6).value).toBe("B");
            expect(store.get(2, 6).value).toBe("C");
        });
    });

    describe("Cell属性保持不变量", () => {
        it("BUG: insertRow后Cell的styleId/disabled/formula应保持", () => {
            const cell = new Cell("value", 5, true, "=SUM(A1:A10)");
            store.set(5, 0, cell);

            store.insertRow(5);

            const moved = store.get(6, 0);
            expect(moved).toBeDefined();
            expect(moved.value).toBe("value");
            expect(moved.styleId).toBe(5);
            expect(moved.disabled).toBe(true);
            expect(moved.formula).toBe("=SUM(A1:A10)");
        });

        it("BUG: moveRow后Cell的styleId/disabled/formula应保持", () => {
            const cell = new Cell(42, 3, true, "=A1+B1");
            store.set(5, 0, cell);

            store.moveRow(5, 10);

            const moved = store.get(10, 0);
            expect(moved).toBeDefined();
            expect(moved.value).toBe(42);
            expect(moved.styleId).toBe(3);
            expect(moved.disabled).toBe(true);
            expect(moved.formula).toBe("=A1+B1");
        });

        it("BUG: moveCol后Cell的styleId/disabled/formula应保持", () => {
            const cell = new Cell("test", 7, false, "=C1");
            store.set(0, 5, cell);

            store.moveCol(5, 10);

            const moved = store.get(0, 10);
            expect(moved).toBeDefined();
            expect(moved.value).toBe("test");
            expect(moved.styleId).toBe(7);
            expect(moved.disabled).toBe(false);
            expect(moved.formula).toBe("=C1");
        });
    });
});

function countCells(store) {
    let count = 0;
    for (const chunk of store.chunks()) {
        count += chunk.cells.size;
    }
    return count;
}