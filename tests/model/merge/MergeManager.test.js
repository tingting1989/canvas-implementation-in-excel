import { describe, it, expect } from "vitest";
import { MergeManager } from "@/model/merge/MergeManager";

describe("MergeManager - merge", () => {
    it("should merge cells", () => {
        const mm = new MergeManager();
        const result = mm.merge(0, 0, 2, 3);
        expect(result).toBe(true);
        expect(mm.getCount()).toBe(1);
    });

    it("should not merge invalid range (topRow > bottomRow)", () => {
        const mm = new MergeManager();
        const result = mm.merge(2, 0, 0, 3);
        expect(result).toBe(false);
    });

    it("should not merge invalid range (topCol > bottomCol)", () => {
        const mm = new MergeManager();
        const result = mm.merge(0, 3, 2, 0);
        expect(result).toBe(false);
    });

    it("should not merge overlapping regions", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 2);
        const result = mm.merge(1, 1, 3, 3);
        expect(result).toBe(false);
    });

    it("should allow adjacent non-overlapping merges", () => {
        const mm = new MergeManager();
        expect(mm.merge(0, 0, 1, 1)).toBe(true);
        expect(mm.merge(0, 2, 1, 3)).toBe(true);
        expect(mm.getCount()).toBe(2);
    });

    it("should merge single cell (1x1)", () => {
        const mm = new MergeManager();
        expect(mm.merge(5, 5, 5, 5)).toBe(true);
    });

    it("should not merge if touching at edge", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 2);
        expect(mm.merge(0, 3, 2, 5)).toBe(true);
    });

    it("should not merge if partially overlapping on row", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 2);
        expect(mm.merge(1, 0, 3, 2)).toBe(false);
    });

    it("should not merge if partially overlapping on col", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 2);
        expect(mm.merge(0, 1, 2, 3)).toBe(false);
    });
});

describe("MergeManager - getMerge", () => {
    it("should return merge info for merged cell", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        const info = mm.getMerge(0, 0);
        expect(info).toEqual({
            topRow: 0,
            topCol: 0,
            bottomRow: 2,
            bottomCol: 3,
            rowSpan: 3,
            colSpan: 4,
        });
    });

    it("should return merge info for non-top-left cell", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        const info = mm.getMerge(1, 2);
        expect(info.topRow).toBe(0);
        expect(info.topCol).toBe(0);
    });

    it("should return null for unmerged cell", () => {
        const mm = new MergeManager();
        expect(mm.getMerge(5, 5)).toBeNull();
    });
});

describe("MergeManager - isTopLeft / isMerged", () => {
    it("isTopLeft should be true for top-left cell", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        expect(mm.isTopLeft(0, 0)).toBe(true);
    });

    it("isTopLeft should be false for non-top-left cell", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        expect(mm.isTopLeft(1, 1)).toBe(false);
    });

    it("isMerged should be true for non-top-left merged cell", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        expect(mm.isMerged(1, 1)).toBe(true);
    });

    it("isMerged should be false for top-left cell", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        expect(mm.isMerged(0, 0)).toBe(false);
    });

    it("isMerged should be false for unmerged cell", () => {
        const mm = new MergeManager();
        expect(mm.isMerged(5, 5)).toBe(false);
    });

    it("isTopLeft should be false for unmerged cell", () => {
        const mm = new MergeManager();
        expect(mm.isTopLeft(5, 5)).toBe(false);
    });
});

describe("MergeManager - unmerge", () => {
    it("should unmerge a merged region", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        expect(mm.unmerge(0, 0)).toBe(true);
        expect(mm.getCount()).toBe(0);
    });

    it("should unmerge from any cell in the region", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        expect(mm.unmerge(1, 2)).toBe(true);
        expect(mm.getCount()).toBe(0);
    });

    it("should return false for unmerged cell", () => {
        const mm = new MergeManager();
        expect(mm.unmerge(5, 5)).toBe(false);
    });

    it("should clean up cellMap after unmerge", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        mm.unmerge(0, 0);
        expect(mm.getMerge(1, 1)).toBeNull();
    });
});

describe("MergeManager - getAllMerges / clear", () => {
    it("should return all merges", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 1, 1);
        mm.merge(3, 3, 5, 5);
        const all = mm.getAllMerges();
        expect(all).toHaveLength(2);
    });

    it("clear should remove all merges", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 1, 1);
        mm.merge(3, 3, 5, 5);
        mm.clear();
        expect(mm.getCount()).toBe(0);
        expect(mm.getMerge(0, 0)).toBeNull();
    });
});

describe("MergeManager - isRegionMerged", () => {
    it("should return true if region is within a merge", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 3, 3);
        expect(mm.isRegionMerged(0, 0, 2, 2)).toBe(true);
    });

    it("should return false if region extends beyond merge", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 3, 3);
        expect(mm.isRegionMerged(0, 0, 4, 4)).toBe(false);
    });

    it("should return false if no merge at top-left", () => {
        const mm = new MergeManager();
        expect(mm.isRegionMerged(0, 0, 2, 2)).toBe(false);
    });
});

describe("MergeManager - insertRow", () => {
    it("should shift merge below insertion point", () => {
        const mm = new MergeManager();
        mm.merge(5, 0, 7, 2);
        mm.insertRow(3);
        const info = mm.getMerge(6, 0);
        expect(info).not.toBeNull();
        expect(info.topRow).toBe(6);
        expect(info.bottomRow).toBe(8);
    });

    it("should expand merge that spans insertion point", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 5, 2);
        mm.insertRow(3);
        const info = mm.getMerge(0, 0);
        expect(info.bottomRow).toBe(6);
    });

    it("should not affect merge above insertion point", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 2);
        mm.insertRow(5);
        const info = mm.getMerge(0, 0);
        expect(info.bottomRow).toBe(2);
    });
});

describe("MergeManager - insertCol", () => {
    it("should shift merge right of insertion point", () => {
        const mm = new MergeManager();
        mm.merge(0, 5, 2, 7);
        mm.insertCol(3);
        const info = mm.getMerge(0, 6);
        expect(info).not.toBeNull();
        expect(info.topCol).toBe(6);
    });

    it("should expand merge that spans insertion point", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 5);
        mm.insertCol(3);
        const info = mm.getMerge(0, 0);
        expect(info.bottomCol).toBe(6);
    });
});

describe("MergeManager - deleteRow", () => {
    it("should shift merge above deleted row", () => {
        const mm = new MergeManager();
        mm.merge(5, 0, 7, 2);
        mm.deleteRow(3);
        const info = mm.getMerge(4, 0);
        expect(info).not.toBeNull();
        expect(info.topRow).toBe(4);
        expect(info.bottomRow).toBe(6);
    });

    it("should shrink merge that spans deleted row", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 5, 2);
        mm.deleteRow(3);
        const info = mm.getMerge(0, 0);
        expect(info.bottomRow).toBe(4);
    });

    it("should remove single-row merge when that row is deleted", () => {
        const mm = new MergeManager();
        mm.merge(3, 0, 3, 5);
        mm.deleteRow(3);
        expect(mm.getCount()).toBe(0);
    });
});

describe("MergeManager - deleteCol", () => {
    it("should shift merge left of deleted col", () => {
        const mm = new MergeManager();
        mm.merge(0, 5, 2, 7);
        mm.deleteCol(3);
        const info = mm.getMerge(0, 4);
        expect(info).not.toBeNull();
        expect(info.topCol).toBe(4);
    });

    it("should shrink merge that spans deleted col", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 5);
        mm.deleteCol(3);
        const info = mm.getMerge(0, 0);
        expect(info.bottomCol).toBe(4);
    });

    it("should remove single-col merge when that col is deleted", () => {
        const mm = new MergeManager();
        mm.merge(0, 3, 2, 3);
        mm.deleteCol(3);
        expect(mm.getCount()).toBe(0);
    });
});

describe("MergeManager - moveCol", () => {
    it("should shift merge when column before merge is moved after it", () => {
        const mm = new MergeManager();
        mm.merge(0, 3, 2, 5);
        mm.moveCol(1, 7);
        const info = mm.getMerge(0, 2);
        expect(info).not.toBeNull();
        expect(info.topCol).toBe(2);
        expect(info.bottomCol).toBe(4);
    });

    it("moveCol same index should be no-op", () => {
        const mm = new MergeManager();
        mm.merge(0, 2, 2, 4);
        mm.moveCol(2, 2);
        const info = mm.getMerge(0, 2);
        expect(info.topCol).toBe(2);
    });

    it("should not affect merge when moving column outside merge range", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 1);
        mm.moveCol(5, 8);
        const info = mm.getMerge(0, 0);
        expect(info).not.toBeNull();
        expect(info.topCol).toBe(0);
        expect(info.bottomCol).toBe(1);
    });
});

describe("MergeManager - moveRow", () => {
    it("should shift merge when row before merge is moved after it", () => {
        const mm = new MergeManager();
        mm.merge(3, 0, 5, 2);
        mm.moveRow(1, 7);
        const info = mm.getMerge(2, 0);
        expect(info).not.toBeNull();
        expect(info.topRow).toBe(2);
        expect(info.bottomRow).toBe(4);
    });

    it("moveRow same index should be no-op", () => {
        const mm = new MergeManager();
        mm.merge(2, 0, 4, 2);
        mm.moveRow(2, 2);
        const info = mm.getMerge(2, 0);
        expect(info.topRow).toBe(2);
    });

    it("should not affect merge when moving row outside merge range", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 1, 2);
        mm.moveRow(5, 8);
        const info = mm.getMerge(0, 0);
        expect(info).not.toBeNull();
        expect(info.topRow).toBe(0);
        expect(info.bottomRow).toBe(1);
    });
});

describe("MergeManager - Complex scenarios", () => {
    it("should handle merge then unmerge then re-merge", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 2);
        mm.unmerge(0, 0);
        expect(mm.getCount()).toBe(0);
        expect(mm.merge(0, 0, 2, 2)).toBe(true);
        expect(mm.getCount()).toBe(1);
    });

    it("should handle multiple merges and selective unmerge", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 1, 1);
        mm.merge(3, 3, 5, 5);
        mm.unmerge(0, 0);
        expect(mm.getCount()).toBe(1);
        expect(mm.getMerge(0, 0)).toBeNull();
        expect(mm.getMerge(3, 3)).not.toBeNull();
    });

    it("should handle insertRow then deleteRow round-trip", () => {
        const mm = new MergeManager();
        mm.merge(2, 0, 4, 2);
        mm.insertRow(3);
        const afterInsert = mm.getMerge(2, 0);
        expect(afterInsert.bottomRow).toBe(5);

        mm.deleteRow(3);
        const afterDelete = mm.getMerge(2, 0);
        expect(afterDelete.bottomRow).toBe(4);
    });
});