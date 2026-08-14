import { describe, it, expect } from "vitest";
import { MergeManager } from "@/model/merge/MergeManager";

describe("MergeManager - merge", () => {
    it("should merge cells", () => {
        const mm = new MergeManager();
        expect(mm.merge(0, 0, 2, 3)).toBe(true);
        expect(mm.getCount()).toBe(1);
    });

    it("should not merge invalid range (topRow > bottomRow)", () => {
        const mm = new MergeManager();
        expect(mm.merge(2, 0, 0, 3)).toBe(false);
    });

    it("should not merge invalid range (topCol > bottomCol)", () => {
        const mm = new MergeManager();
        expect(mm.merge(0, 3, 2, 0)).toBe(false);
    });

    it("should not merge overlapping regions", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 2);
        expect(mm.merge(1, 1, 3, 3)).toBe(false);
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
        expect(info).not.toBeNull();
        expect(info?.topRow).toBe(0);
        expect(info?.topCol).toBe(0);
    });

    it("should return null for non-merged cell", () => {
        const mm = new MergeManager();
        expect(mm.getMerge(0, 0)).toBeNull();
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
        expect(mm.unmerge(1, 1)).toBe(true);
        expect(mm.getCount()).toBe(0);
    });

    it("should return false for non-merged cell", () => {
        const mm = new MergeManager();
        expect(mm.unmerge(0, 0)).toBe(false);
    });
});

describe("MergeManager - isTopLeft / isMerged", () => {
    it("should identify top-left cell", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        expect(mm.isTopLeft(0, 0)).toBe(true);
        expect(mm.isTopLeft(1, 1)).toBe(false);
    });

    it("should identify merged (non-top-left) cell", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 3);
        expect(mm.isMerged(1, 1)).toBe(true);
        expect(mm.isMerged(0, 0)).toBe(false);
    });
});

describe("MergeManager - getAllMerges / clear / getCount", () => {
    it("should get all merges", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 1, 1);
        mm.merge(3, 3, 4, 4);
        expect(mm.getAllMerges()).toHaveLength(2);
    });

    it("should clear all merges", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 1, 1);
        mm.clear();
        expect(mm.getCount()).toBe(0);
    });
});

describe("MergeManager - isRegionMerged", () => {
    it("should return true when region is fully contained in merge", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 4, 4);
        expect(mm.isRegionMerged(1, 1, 3, 3)).toBe(true);
    });

    it("should return false when region exceeds merge", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 2);
        expect(mm.isRegionMerged(0, 0, 3, 3)).toBe(false);
    });

    it("should return false when not in any merge", () => {
        const mm = new MergeManager();
        expect(mm.isRegionMerged(0, 0, 1, 1)).toBe(false);
    });
});

describe("MergeManager - insertRow", () => {
    it("should shift merge regions below insertion point", () => {
        const mm = new MergeManager();
        mm.merge(2, 0, 4, 2);
        mm.insertRow(1);
        const info = mm.getMerge(3, 0);
        expect(info).not.toBeNull();
        expect(info?.topRow).toBe(3);
        expect(info?.bottomRow).toBe(5);
    });

    it("should expand merge region that spans insertion point", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 4, 2);
        mm.insertRow(2);
        const info = mm.getMerge(0, 0);
        expect(info).not.toBeNull();
        expect(info?.bottomRow).toBe(5);
    });
});

describe("MergeManager - deleteRow", () => {
    it("should shift merge regions above deleted row", () => {
        const mm = new MergeManager();
        mm.merge(3, 0, 5, 2);
        mm.deleteRow(2);
        const info = mm.getMerge(2, 0);
        expect(info).not.toBeNull();
        expect(info?.topRow).toBe(2);
        expect(info?.bottomRow).toBe(4);
    });

    it("should shrink merge region that spans deleted row", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 4, 2);
        mm.deleteRow(2);
        const info = mm.getMerge(0, 0);
        expect(info).not.toBeNull();
        expect(info?.bottomRow).toBe(3);
    });
});

describe("MergeManager - moveCol", () => {
    it("should move merge region when column is moved", () => {
        const mm = new MergeManager();
        mm.merge(0, 0, 2, 2);
        mm.moveCol(0, 4);
        const info = mm.getMerge(0, 4);
        expect(info).not.toBeNull();
        expect(info?.topCol).toBe(4);
        expect(info?.bottomCol).toBe(6);
    });
});