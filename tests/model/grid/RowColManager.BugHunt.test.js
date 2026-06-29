import { describe, it, expect, beforeEach } from "vitest";
import { RowColManager } from "@/model/grid/RowColManager";
import { CONFIG } from "@/constants/config";

describe("RowColManager - Bug Hunting", () => {
    let rcm;

    beforeEach(() => {
        rcm = new RowColManager();
    });

    describe("前缀和缓存一致性", () => {
        it("BUG: setRowHeight后getRowY应反映最新值", () => {
            rcm.ensureSize(5, 5);
            rcm.setRowHeight(0, 30);
            rcm.setRowHeight(1, 40);

            expect(rcm.getRowY(2)).toBe(70);

            rcm.setRowHeight(0, 50);

            expect(rcm.getRowY(1)).toBe(50);
            expect(rcm.getRowY(2)).toBe(90);
        });

        it("BUG: setColWidth后getColX应反映最新值", () => {
            rcm.ensureSize(5, 5);
            rcm.setColWidth(0, 80);
            rcm.setColWidth(1, 120);

            expect(rcm.getColX(2)).toBe(200);

            rcm.setColWidth(0, 150);

            expect(rcm.getColX(1)).toBe(150);
            expect(rcm.getColX(2)).toBe(270);
        });

        it("BUG: 连续修改同一行高后getRowY应正确", () => {
            rcm.ensureSize(5, 5);
            rcm.setRowHeight(0, 30);
            rcm.setRowHeight(0, 50);
            rcm.setRowHeight(0, 20);

            expect(rcm.getRowY(1)).toBe(20);
            expect(rcm.totalHeight).toBe(20 + 4 * CONFIG.DEFAULT_ROW_HEIGHT);
        });

        it("BUG: insertRow后前缀和应正确重建", () => {
            rcm.ensureSize(3, 3);
            rcm.setRowHeight(0, 10);
            rcm.setRowHeight(1, 20);
            rcm.setRowHeight(2, 30);

            expect(rcm.getRowY(2)).toBe(30);
            expect(rcm.getRowY(3)).toBe(60);

            rcm.insertRow(1);

            expect(rcm.getRowY(1)).toBe(10);
            expect(rcm.getRowY(2)).toBe(10 + CONFIG.DEFAULT_ROW_HEIGHT);
            expect(rcm.getRowY(3)).toBe(10 + CONFIG.DEFAULT_ROW_HEIGHT + 20);
            expect(rcm.getRowY(4)).toBe(10 + CONFIG.DEFAULT_ROW_HEIGHT + 20 + 30);
        });

        it("BUG: deleteRow后前缀和应正确重建", () => {
            rcm.ensureSize(3, 3);
            rcm.setRowHeight(0, 10);
            rcm.setRowHeight(1, 20);
            rcm.setRowHeight(2, 30);

            rcm.deleteRow(1);

            expect(rcm.getRowY(0)).toBe(0);
            expect(rcm.getRowY(1)).toBe(10);
            expect(rcm.getRowY(2)).toBe(10 + 30);
        });
    });

    describe("rowAt / colAt - 反向查找一致性", () => {
        it("BUG: rowAt(getRowY(n))应返回n", () => {
            rcm.ensureSize(10, 10);
            rcm.setRowHeight(0, 30);
            rcm.setRowHeight(1, 40);
            rcm.setRowHeight(2, 50);

            for (let r = 0; r < 5; r++) {
                const y = rcm.getRowY(r);
                expect(rcm.rowAt(y)).toBe(r);
            }
        });

        it("BUG: colAt(getColX(n))应返回n", () => {
            rcm.ensureSize(10, 10);
            rcm.setColWidth(0, 80);
            rcm.setColWidth(1, 120);
            rcm.setColWidth(2, 150);

            for (let c = 0; c < 5; c++) {
                const x = rcm.getColX(c);
                expect(rcm.colAt(x)).toBe(c);
            }
        });

        it("BUG: rowAt在行边界上应返回正确的行", () => {
            rcm.ensureSize(5, 5);
            rcm.setRowHeight(0, 30);
            rcm.setRowHeight(1, 40);

            expect(rcm.rowAt(29)).toBe(0);
            expect(rcm.rowAt(30)).toBe(1);
            expect(rcm.rowAt(69)).toBe(1);
            expect(rcm.rowAt(70)).toBe(2);
        });

        it("BUG: colAt在列边界上应返回正确的列", () => {
            rcm.ensureSize(5, 5);
            rcm.setColWidth(0, 100);
            rcm.setColWidth(1, 200);

            expect(rcm.colAt(99)).toBe(0);
            expect(rcm.colAt(100)).toBe(1);
            expect(rcm.colAt(299)).toBe(1);
            expect(rcm.colAt(300)).toBe(2);
        });

        it("BUG: rowAt在隐藏行处应跳过隐藏行", () => {
            rcm.ensureSize(5, 5);
            rcm.setRowHeight(0, 28);
            rcm.setRowHeight(1, 28);
            rcm.setRowHeight(2, 28);
            rcm.hideRow(1);

            expect(rcm.rowAt(0)).toBe(0);
            expect(rcm.rowAt(28)).toBe(2);
            expect(rcm.rowAt(55)).toBe(2);
        });

        it("BUG: colAt在隐藏列处应跳过隐藏列", () => {
            rcm.ensureSize(5, 5);
            rcm.setColWidth(0, 100);
            rcm.setColWidth(1, 100);
            rcm.setColWidth(2, 100);
            rcm.hideColumn(1);

            expect(rcm.colAt(0)).toBe(0);
            expect(rcm.colAt(100)).toBe(2);
            expect(rcm.colAt(199)).toBe(2);
        });
    });

    describe("隐藏行/列 - 边界条件", () => {
        it("BUG: hideRow后getRowHeight应返回0", () => {
            rcm.ensureSize(5, 5);
            rcm.setRowHeight(2, 50);
            rcm.hideRow(2);

            expect(rcm.getRowHeight(2)).toBe(0);
        });

        it("BUG: showRow应恢复原始高度", () => {
            rcm.ensureSize(5, 5);
            rcm.setRowHeight(2, 50);
            rcm.hideRow(2);
            rcm.showRow(2);

            expect(rcm.getRowHeight(2)).toBe(50);
        });

        it("BUG: hideColumn后getColWidth应返回0", () => {
            rcm.ensureSize(5, 5);
            rcm.setColWidth(2, 150);
            rcm.hideColumn(2);

            expect(rcm.getColWidth(2)).toBe(0);
        });

        it("BUG: showColumn应恢复原始宽度", () => {
            rcm.ensureSize(5, 5);
            rcm.setColWidth(2, 150);
            rcm.hideColumn(2);
            rcm.showColumn(2);

            expect(rcm.getColWidth(2)).toBe(150);
        });

        it("BUG: 隐藏行后totalHeight应减少", () => {
            rcm.ensureSize(5, 5);
            rcm.setRowHeight(0, 30);
            rcm.setRowHeight(1, 40);
            rcm.setRowHeight(2, 50);

            const h1 = rcm.totalHeight;
            rcm.hideRow(1);
            const h2 = rcm.totalHeight;

            expect(h2).toBe(h1 - 40);
        });

        it("BUG: 隐藏列后totalWidth应减少", () => {
            rcm.ensureSize(5, 5);
            rcm.setColWidth(0, 80);
            rcm.setColWidth(1, 120);
            rcm.setColWidth(2, 150);

            const w1 = rcm.totalWidth;
            rcm.hideColumn(1);
            const w2 = rcm.totalWidth;

            expect(w2).toBe(w1 - 120);
        });

        it("BUG: 隐藏行后getRowY应跳过隐藏行", () => {
            rcm.ensureSize(5, 5);
            rcm.setRowHeight(0, 30);
            rcm.setRowHeight(1, 40);
            rcm.setRowHeight(2, 50);
            rcm.setRowHeight(3, 60);

            rcm.hideRow(1);

            expect(rcm.getRowY(2)).toBe(30);
            expect(rcm.getRowY(3)).toBe(30 + 50);
            expect(rcm.getRowY(4)).toBe(30 + 50 + 60);
        });

        it("BUG: 连续隐藏多行后getRowY应正确", () => {
            rcm.ensureSize(5, 5);
            rcm.setRowHeight(0, 10);
            rcm.setRowHeight(1, 20);
            rcm.setRowHeight(2, 30);
            rcm.setRowHeight(3, 40);
            rcm.setRowHeight(4, 50);

            rcm.hideRow(1);
            rcm.hideRow(3);

            expect(rcm.getRowY(2)).toBe(10);
            expect(rcm.getRowY(4)).toBe(10 + 30);
            expect(rcm.getRowY(5)).toBe(10 + 30 + 50);
        });

        it("BUG: showRow对未隐藏的行应为no-op", () => {
            rcm.ensureSize(5, 5);
            rcm.setRowHeight(2, 50);

            rcm.showRow(2);

            expect(rcm.getRowHeight(2)).toBe(50);
        });

        it("BUG: 隐藏所有行后totalHeight应为0", () => {
            rcm.ensureSize(3, 3);
            rcm.setRowHeight(0, 10);
            rcm.setRowHeight(1, 20);
            rcm.setRowHeight(2, 30);

            rcm.hideRow(0);
            rcm.hideRow(1);
            rcm.hideRow(2);

            expect(rcm.totalHeight).toBe(0);
        });
    });

    describe("insertRow / deleteRow - 与隐藏行交互", () => {
        it("BUG: insertRow在隐藏行之前应正确移动隐藏标记", () => {
            rcm.ensureSize(5, 5);
            rcm.hideRow(2);

            rcm.insertRow(1);

            expect(rcm.isRowHidden(3)).toBe(true);
            expect(rcm.isRowHidden(2)).toBe(false);
        });

        it("BUG: deleteRow删除隐藏行后应清除隐藏标记", () => {
            rcm.ensureSize(5, 5);
            rcm.hideRow(2);

            rcm.deleteRow(2);

            expect(rcm.isRowHidden(2)).toBe(false);
            expect(rcm.hasHiddenRows).toBe(false);
        });

        it("BUG: deleteRow在隐藏行之上应正确移动隐藏标记", () => {
            rcm.ensureSize(5, 5);
            rcm.hideRow(3);

            rcm.deleteRow(1);

            expect(rcm.isRowHidden(2)).toBe(true);
        });

        it("BUG: insertCol在隐藏列之前应正确移动隐藏标记", () => {
            rcm.ensureSize(5, 5);
            rcm.hideColumn(2);

            rcm.insertCol(1);

            expect(rcm.isColumnHidden(3)).toBe(true);
            expect(rcm.isColumnHidden(2)).toBe(false);
        });

        it("BUG: deleteCol删除隐藏列后应清除隐藏标记", () => {
            rcm.ensureSize(5, 5);
            rcm.hideColumn(2);

            rcm.deleteCol(2);

            expect(rcm.isColumnHidden(2)).toBe(false);
            expect(rcm.hasHiddenColumns).toBe(false);
        });
    });

    describe("moveRow / moveCol - 隐藏行/列交互", () => {
        it("BUG: moveRow应正确移动隐藏标记", () => {
            rcm.ensureSize(5, 5);
            rcm.setRowHeight(0, 10);
            rcm.setRowHeight(1, 20);
            rcm.setRowHeight(2, 30);
            rcm.setRowHeight(3, 40);
            rcm.setRowHeight(4, 50);

            rcm.hideRow(1);
            rcm.moveRow(1, 3);

            expect(rcm.isRowHidden(3)).toBe(true);
            expect(rcm.getRowHeight(3)).toBe(0);
        });

        it("BUG: moveCol应正确移动隐藏标记", () => {
            rcm.ensureSize(5, 5);
            rcm.setColWidth(0, 10);
            rcm.setColWidth(1, 20);
            rcm.setColWidth(2, 30);
            rcm.setColWidth(3, 40);
            rcm.setColWidth(4, 50);

            rcm.hideColumn(1);
            rcm.moveCol(1, 3);

            expect(rcm.isColumnHidden(3)).toBe(true);
            expect(rcm.getColWidth(3)).toBe(0);
        });

        it("BUG: moveRow反向移动应正确移动隐藏标记", () => {
            rcm.ensureSize(5, 5);
            rcm.setRowHeight(0, 10);
            rcm.setRowHeight(1, 20);
            rcm.setRowHeight(2, 30);
            rcm.setRowHeight(3, 40);
            rcm.setRowHeight(4, 50);

            rcm.hideRow(3);
            rcm.moveRow(3, 1);

            expect(rcm.isRowHidden(1)).toBe(true);
            expect(rcm.getRowHeight(1)).toBe(0);
        });
    });

    describe("分页模式 - 边界条件", () => {
        it("BUG: 分页模式下rowCount应返回页内行数", () => {
            rcm.ensureSize(100, 10);
            rcm.setPaginationBounds(10, 30);

            expect(rcm.rowCount).toBe(20);
        });

        it("BUG: 分页模式下getRowHeight应返回页内行高", () => {
            rcm.ensureSize(100, 10);
            rcm.setRowHeight(15, 50);
            rcm.setPaginationBounds(10, 30);

            expect(rcm.getRowHeight(5)).toBe(50);
        });

        it("BUG: 分页模式下getRowY应返回页内相对坐标", () => {
            rcm.ensureSize(100, 10);
            rcm.setRowHeight(10, 30);
            rcm.setRowHeight(11, 40);
            rcm.setPaginationBounds(10, 30);

            expect(rcm.getRowY(0)).toBe(0);
            expect(rcm.getRowY(1)).toBe(30);
            expect(rcm.getRowY(2)).toBe(70);
        });

        it("BUG: 分页模式下rowAt应返回页内相对行号", () => {
            rcm.ensureSize(100, 10);
            rcm.setRowHeight(10, 30);
            rcm.setRowHeight(11, 40);
            rcm.setPaginationBounds(10, 30);

            expect(rcm.rowAt(0)).toBe(0);
            expect(rcm.rowAt(30)).toBe(1);
        });

        it("BUG: 分页模式下totalHeight应返回页高度", () => {
            rcm.ensureSize(100, 10);
            rcm.setPaginationBounds(10, 30);

            const pageHeight = rcm.totalHeight;
            expect(pageHeight).toBeGreaterThan(0);

            rcm.clearPaginationBounds();
            const fullHeight = rcm.totalHeight;
            expect(fullHeight).toBeGreaterThan(pageHeight);
        });

        it("BUG: clearPaginationBounds后rowCount应恢复", () => {
            rcm.ensureSize(100, 10);
            rcm.setPaginationBounds(10, 30);
            expect(rcm.rowCount).toBe(20);

            rcm.clearPaginationBounds();
            expect(rcm.rowCount).toBe(100);
        });
    });

    describe("ensureSize / resetSize - 交互", () => {
        it("BUG: resetSize后ensureSize不应覆盖", () => {
            rcm.resetSize(5, 3);
            rcm.ensureSize(10, 10);

            expect(rcm.rowCount).toBe(5);
            expect(rcm.colCount).toBe(3);
        });

        it("BUG: resetSize缩小后getRowHeight应返回默认值", () => {
            rcm.ensureSize(10, 10);
            rcm.setRowHeight(8, 50);
            rcm.resetSize(5, 5);

            expect(rcm.getRowHeight(8)).toBe(CONFIG.DEFAULT_ROW_HEIGHT);
        });

        it("BUG: resetSize扩大后新行高应为默认值", () => {
            rcm.ensureSize(3, 3);
            rcm.setRowHeight(0, 50);
            rcm.resetSize(10, 10);

            expect(rcm.getRowHeight(0)).toBe(50);
            expect(rcm.getRowHeight(5)).toBe(CONFIG.DEFAULT_ROW_HEIGHT);
        });

        it("BUG: 多次resetSize应正确覆盖", () => {
            rcm.resetSize(10, 10);
            rcm.resetSize(5, 3);

            expect(rcm.rowCount).toBe(5);
            expect(rcm.colCount).toBe(3);
        });
    });

    describe("getVisibleRange - 边界条件", () => {
        it("BUG: 视口在(0,0)时起始行列应为0", () => {
            rcm.ensureSize(100, 100);
            const range = rcm.getVisibleRange(0, 0, 500, 500);

            expect(range.topRow).toBe(0);
            expect(range.topCol).toBe(0);
        });

        it("BUG: 视口超出数据范围时应clamp", () => {
            rcm.ensureSize(10, 10);
            const range = rcm.getVisibleRange(0, 0, 10000, 10000);

            expect(range.bottomRow).toBeLessThanOrEqual(rcm.rowCount);
            expect(range.bottomCol).toBeLessThanOrEqual(rcm.colCount);
        });

        it("BUG: 隐藏行/列后getVisibleRange - rowAt跳过隐藏行列", () => {
            rcm.ensureSize(10, 10);
            rcm.hideRow(0);
            rcm.hideColumn(0);

            const range = rcm.getVisibleRange(0, 0, 500, 500);

            expect(range.topRow).toBe(1);
            expect(range.topCol).toBe(1);
        });
    });

    describe("allocatedHeight / allocatedWidth 一致性", () => {
        it("BUG: allocatedRowCount应等于rowHeights.length", () => {
            rcm.ensureSize(10, 5);

            expect(rcm.allocatedRowCount).toBe(10);
            expect(rcm.allocatedColCount).toBe(5);
        });

        it("BUG: insertRow后allocatedRowCount应增加", () => {
            rcm.ensureSize(5, 5);
            rcm.insertRow(2);

            expect(rcm.allocatedRowCount).toBe(6);
        });

        it("BUG: deleteRow后allocatedRowCount应减少", () => {
            rcm.ensureSize(5, 5);
            rcm.deleteRow(2);

            expect(rcm.allocatedRowCount).toBe(4);
        });

        it("BUG: insertCol后allocatedColCount应增加", () => {
            rcm.ensureSize(5, 5);
            rcm.insertCol(2);

            expect(rcm.allocatedColCount).toBe(6);
        });

        it("BUG: deleteCol后allocatedColCount应减少", () => {
            rcm.ensureSize(5, 5);
            rcm.deleteCol(2);

            expect(rcm.allocatedColCount).toBe(4);
        });
    });

    describe("极端值处理", () => {
        it("BUG: getRowY(负数)应返回0", () => {
            expect(rcm.getRowY(-1)).toBe(0);
            expect(rcm.getRowY(-100)).toBe(0);
        });

        it("BUG: getColX(负数)应返回0", () => {
            expect(rcm.getColX(-1)).toBe(0);
            expect(rcm.getColX(-100)).toBe(0);
        });

        it("BUG: rowAt(负数)应返回0", () => {
            expect(rcm.rowAt(-1)).toBe(0);
            expect(rcm.rowAt(-100)).toBe(0);
        });

        it("BUG: colAt(负数)应返回0", () => {
            expect(rcm.colAt(-1)).toBe(0);
            expect(rcm.colAt(-100)).toBe(0);
        });

        it("BUG: setRowHeight(0, 0)应允许零高度", () => {
            rcm.ensureSize(5, 5);
            rcm.setRowHeight(0, 0);

            expect(rcm.getRowHeight(0)).toBe(0);
            expect(rcm.getRowY(1)).toBe(0);
        });

        it("BUG: setColWidth(0, 0)应允许零宽度", () => {
            rcm.ensureSize(5, 5);
            rcm.setColWidth(0, 0);

            expect(rcm.getColWidth(0)).toBe(0);
            expect(rcm.getColX(1)).toBe(0);
        });
    });
});