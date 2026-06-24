import { describe, it, expect, beforeEach } from "vitest";
import { MergeManager } from "@/model/merge/MergeManager";

describe("MergeManager - Bug Hunting", () => {
    let mm;

    beforeEach(() => {
        mm = new MergeManager();
    });

    describe("merge - 基本不变量", () => {
        it("BUG: merge后getMerge应返回正确的合并信息", () => {
            mm.merge(0, 0, 2, 3);

            const info = mm.getMerge(0, 0);
            expect(info).not.toBeNull();
            expect(info.topRow).toBe(0);
            expect(info.topCol).toBe(0);
            expect(info.bottomRow).toBe(2);
            expect(info.bottomCol).toBe(3);
            expect(info.rowSpan).toBe(3);
            expect(info.colSpan).toBe(4);
        });

        it("BUG: merge后所有内部单元格应属于同一合并区", () => {
            mm.merge(1, 1, 3, 3);

            for (let r = 1; r <= 3; r++) {
                for (let c = 1; c <= 3; c++) {
                    const info = mm.getMerge(r, c);
                    expect(info).not.toBeNull();
                    expect(info.topRow).toBe(1);
                    expect(info.topCol).toBe(1);
                }
            }
        });

        it("BUG: merge后isTopLeft只在左上角返回true", () => {
            mm.merge(0, 0, 2, 2);

            expect(mm.isTopLeft(0, 0)).toBe(true);
            expect(mm.isTopLeft(0, 1)).toBe(false);
            expect(mm.isTopLeft(1, 0)).toBe(false);
            expect(mm.isTopLeft(1, 1)).toBe(false);
        });

        it("BUG: merge后isMerged对非左上角单元格返回true", () => {
            mm.merge(0, 0, 2, 2);

            expect(mm.isMerged(0, 1)).toBe(true);
            expect(mm.isMerged(1, 0)).toBe(true);
            expect(mm.isMerged(1, 1)).toBe(true);
        });

        it("BUG: merge后isMerged对左上角返回false", () => {
            mm.merge(0, 0, 2, 2);

            expect(mm.isMerged(0, 0)).toBe(false);
        });

        it("BUG: 重叠的merge应失败", () => {
            expect(mm.merge(0, 0, 3, 3)).toBe(true);
            expect(mm.merge(2, 2, 5, 5)).toBe(false);
        });

        it("BUG: 完全包含的merge应失败", () => {
            expect(mm.merge(0, 0, 5, 5)).toBe(true);
            expect(mm.merge(1, 1, 3, 3)).toBe(false);
        });

        it("BUG: 边缘接触的merge应失败", () => {
            expect(mm.merge(0, 0, 2, 2)).toBe(true);
            expect(mm.merge(2, 2, 4, 4)).toBe(false);
        });

        it("BUG: 不重叠的merge应成功", () => {
            expect(mm.merge(0, 0, 2, 2)).toBe(true);
            expect(mm.merge(0, 3, 2, 5)).toBe(true);
        });

        it("BUG: 反向参数的merge应失败", () => {
            expect(mm.merge(3, 3, 0, 0)).toBe(false);
        });

        it("BUG: 单个单元格的merge应成功", () => {
            expect(mm.merge(0, 0, 0, 0)).toBe(true);
            expect(mm.getCount()).toBe(1);
        });
    });

    describe("unmerge - 撤销合并", () => {
        it("BUG: unmerge后所有单元格应不再属于合并区", () => {
            mm.merge(0, 0, 2, 2);
            mm.unmerge(0, 0);

            for (let r = 0; r <= 2; r++) {
                for (let c = 0; c <= 2; c++) {
                    expect(mm.getMerge(r, c)).toBeNull();
                }
            }
        });

        it("BUG: unmerge非左上角应也能取消合并", () => {
            mm.merge(0, 0, 2, 2);

            expect(mm.unmerge(1, 1)).toBe(true);
            expect(mm.getCount()).toBe(0);
        });

        it("BUG: unmerge不存在的合并应返回false", () => {
            expect(mm.unmerge(0, 0)).toBe(false);
        });

        it("BUG: unmerge后应可以重新merge同一区域", () => {
            mm.merge(0, 0, 2, 2);
            mm.unmerge(0, 0);

            expect(mm.merge(0, 0, 2, 2)).toBe(true);
        });
    });

    describe("insertRow - 合并区域调整", () => {
        it("BUG: insertRow在合并区域下方应下移合并区", () => {
            mm.merge(0, 0, 2, 2);
            mm.insertRow(3);

            const info = mm.getMerge(0, 0);
            expect(info).not.toBeNull();
            expect(info.bottomRow).toBe(2);
        });

        it("BUG: insertRow在合并区域上方应下移合并区", () => {
            mm.merge(2, 0, 4, 2);
            mm.insertRow(1);

            const info = mm.getMerge(1, 0);
            expect(info).not.toBeNull();
            expect(info.topRow).toBe(1);
            expect(info.bottomRow).toBe(5);
        });

        it("BUG: insertRow在合并区域中间应扩展合并区", () => {
            mm.merge(0, 0, 4, 2);
            mm.insertRow(2);

            const info = mm.getMerge(0, 0);
            expect(info).not.toBeNull();
            expect(info.bottomRow).toBe(5);
            expect(info.rowSpan).toBe(6);
        });

        it("BUG: insertRow在合并区域顶部应扩展合并区", () => {
            mm.merge(2, 0, 4, 2);
            mm.insertRow(2);

            const info = mm.getMerge(2, 0);
            expect(info).not.toBeNull();
            expect(info.bottomRow).toBe(5);
        });
    });

    describe("deleteRow - 合并区域调整", () => {
        it("BUG: deleteRow删除单行合并区应取消合并", () => {
            mm.merge(2, 0, 2, 3);
            mm.deleteRow(2);

            expect(mm.getCount()).toBe(0);
        });

        it("BUG: deleteRow在合并区域中间应收缩合并区", () => {
            mm.merge(0, 0, 4, 2);
            mm.deleteRow(2);

            const info = mm.getMerge(0, 0);
            expect(info).not.toBeNull();
            expect(info.bottomRow).toBe(3);
            expect(info.rowSpan).toBe(4);
        });

        it("BUG: deleteRow在合并区域下方不应影响合并区", () => {
            mm.merge(0, 0, 2, 2);
            mm.deleteRow(5);

            const info = mm.getMerge(0, 0);
            expect(info).not.toBeNull();
            expect(info.bottomRow).toBe(2);
        });

        it("BUG: deleteRow在合并区域上方应上移合并区", () => {
            mm.merge(3, 0, 5, 2);
            mm.deleteRow(1);

            const info = mm.getMerge(2, 0);
            expect(info).not.toBeNull();
            expect(info.topRow).toBe(2);
            expect(info.bottomRow).toBe(4);
        });
    });

    describe("insertCol / deleteCol - 合并区域调整", () => {
        it("BUG: insertCol在合并区域中间应扩展合并区", () => {
            mm.merge(0, 0, 2, 4);
            mm.insertCol(2);

            const info = mm.getMerge(0, 0);
            expect(info).not.toBeNull();
            expect(info.bottomCol).toBe(5);
            expect(info.colSpan).toBe(6);
        });

        it("BUG: deleteCol删除单列合并区应取消合并", () => {
            mm.merge(0, 2, 3, 2);
            mm.deleteCol(2);

            expect(mm.getCount()).toBe(0);
        });

        it("BUG: deleteCol在合并区域中间应收缩合并区", () => {
            mm.merge(0, 0, 2, 4);
            mm.deleteCol(2);

            const info = mm.getMerge(0, 0);
            expect(info).not.toBeNull();
            expect(info.bottomCol).toBe(3);
            expect(info.colSpan).toBe(4);
        });
    });

    describe("moveRow - 合并区域调整", () => {
        it("BUG: moveRow将合并区域整体移动", () => {
            mm.merge(2, 0, 4, 2);
            mm.moveRow(2, 6);

            const info = mm.getMerge(6, 0);
            expect(info).not.toBeNull();
            expect(info.topRow).toBe(6);
            expect(info.bottomRow).toBe(8);
        });

        it("BUG: moveRow反向移动合并区域", () => {
            mm.merge(5, 0, 7, 2);
            mm.moveRow(5, 1);

            const info = mm.getMerge(1, 0);
            expect(info).not.toBeNull();
            expect(info.topRow).toBe(1);
            expect(info.bottomRow).toBe(3);
        });
    });

    describe("moveCol - 合并区域调整", () => {
        it("BUG: moveCol将合并区域整体移动", () => {
            mm.merge(0, 2, 2, 4);
            mm.moveCol(2, 6);

            const info = mm.getMerge(0, 6);
            expect(info).not.toBeNull();
            expect(info.topCol).toBe(6);
            expect(info.bottomCol).toBe(8);
        });
    });

    describe("clear - 清空", () => {
        it("BUG: clear后所有合并区应消失", () => {
            mm.merge(0, 0, 2, 2);
            mm.merge(5, 5, 7, 7);
            mm.clear();

            expect(mm.getCount()).toBe(0);
            expect(mm.getMerge(0, 0)).toBeNull();
            expect(mm.getMerge(5, 5)).toBeNull();
        });
    });

    describe("getAllMerges - 获取所有合并区", () => {
        it("BUG: getAllMerges应返回所有合并区", () => {
            mm.merge(0, 0, 2, 2);
            mm.merge(5, 5, 7, 7);

            const all = mm.getAllMerges();
            expect(all).toHaveLength(2);
        });
    });

    describe("isRegionMerged - 区域判断", () => {
        it("BUG: 完全在合并区内的区域应返回true", () => {
            mm.merge(0, 0, 4, 4);

            expect(mm.isRegionMerged(0, 0, 2, 2)).toBe(true);
        });

        it("BUG: 超出合并区的区域应返回false", () => {
            mm.merge(0, 0, 4, 4);

            expect(mm.isRegionMerged(0, 0, 5, 5)).toBe(false);
        });

        it("BUG: 非合并区应返回false", () => {
            expect(mm.isRegionMerged(0, 0, 2, 2)).toBe(false);
        });
    });

    describe("复合操作 - 不变量测试", () => {
        it("BUG: merge + unmerge后cellMap应为空", () => {
            mm.merge(0, 0, 2, 2);
            mm.unmerge(0, 0);

            expect(mm.cellMap.size).toBe(0);
        });

        it("BUG: 多次merge + unmerge后不应有残留", () => {
            mm.merge(0, 0, 2, 2);
            mm.unmerge(0, 0);
            mm.merge(0, 0, 2, 2);
            mm.unmerge(0, 0);

            expect(mm.getCount()).toBe(0);
            expect(mm.cellMap.size).toBe(0);
        });

        it("BUG: insertRow + deleteRow后合并区应恢复", () => {
            mm.merge(2, 0, 4, 2);
            mm.insertRow(3);
            mm.deleteRow(3);

            const info = mm.getMerge(2, 0);
            expect(info).not.toBeNull();
            expect(info.topRow).toBe(2);
            expect(info.bottomRow).toBe(4);
        });
    });
});