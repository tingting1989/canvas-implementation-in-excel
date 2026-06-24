import { describe, it, expect } from "vitest";
import { SelectionManager } from "@/model/selection/SelectionManager";

describe("SelectionManager - setActive", () => {
    it("should set active cell", () => {
        const sm = new SelectionManager();
        sm.setActive(3, 5);
        expect(sm.getActive()).toEqual([3, 5]);
    });

    it("should set anchor = focus for active cell", () => {
        const sm = new SelectionManager();
        sm.setActive(3, 5);
        expect(sm.getAnchor()).toEqual([3, 5]);
        expect(sm.getFocus()).toEqual([3, 5]);
    });

    it("should be single cell after setActive", () => {
        const sm = new SelectionManager();
        sm.setActive(3, 5);
        expect(sm.isSingleCell()).toBe(true);
    });

    it("should default to (0, 0)", () => {
        const sm = new SelectionManager();
        expect(sm.getActive()).toEqual([0, 0]);
    });
});

describe("SelectionManager - setRange", () => {
    it("should set anchor and focus independently", () => {
        const sm = new SelectionManager();
        sm.setRange(1, 2, 5, 8);
        expect(sm.getAnchor()).toEqual([1, 2]);
        expect(sm.getFocus()).toEqual([5, 8]);
    });

    it("should not be single cell when anchor != focus", () => {
        const sm = new SelectionManager();
        sm.setRange(1, 2, 5, 8);
        expect(sm.isSingleCell()).toBe(false);
    });

    it("should be single cell when anchor == focus", () => {
        const sm = new SelectionManager();
        sm.setRange(3, 4, 3, 4);
        expect(sm.isSingleCell()).toBe(true);
    });
});

describe("SelectionManager - getRange (normalized)", () => {
    it("should normalize when anchor < focus", () => {
        const sm = new SelectionManager();
        sm.setRange(1, 2, 5, 8);
        const range = sm.getRange();
        expect(range).toEqual({ topRow: 1, topCol: 2, bottomRow: 5, bottomCol: 8 });
    });

    it("should normalize when anchor > focus", () => {
        const sm = new SelectionManager();
        sm.setRange(5, 8, 1, 2);
        const range = sm.getRange();
        expect(range).toEqual({ topRow: 1, topCol: 2, bottomRow: 5, bottomCol: 8 });
    });

    it("should normalize when anchor row > focus row but anchor col < focus col", () => {
        const sm = new SelectionManager();
        sm.setRange(5, 2, 1, 8);
        const range = sm.getRange();
        expect(range).toEqual({ topRow: 1, topCol: 2, bottomRow: 5, bottomCol: 8 });
    });

    it("should normalize when anchor row < focus row but anchor col > focus col", () => {
        const sm = new SelectionManager();
        sm.setRange(1, 8, 5, 2);
        const range = sm.getRange();
        expect(range).toEqual({ topRow: 1, topCol: 2, bottomRow: 5, bottomCol: 8 });
    });

    it("should return single cell range when anchor == focus", () => {
        const sm = new SelectionManager();
        sm.setActive(3, 5);
        const range = sm.getRange();
        expect(range).toEqual({ topRow: 3, topCol: 5, bottomRow: 3, bottomCol: 5 });
    });
});

describe("SelectionManager - contains", () => {
    it("should contain cells within range", () => {
        const sm = new SelectionManager();
        sm.setRange(1, 2, 5, 8);
        expect(sm.contains(1, 2)).toBe(true);
        expect(sm.contains(5, 8)).toBe(true);
        expect(sm.contains(3, 5)).toBe(true);
    });

    it("should not contain cells outside range", () => {
        const sm = new SelectionManager();
        sm.setRange(1, 2, 5, 8);
        expect(sm.contains(0, 2)).toBe(false);
        expect(sm.contains(1, 1)).toBe(false);
        expect(sm.contains(6, 8)).toBe(false);
        expect(sm.contains(5, 9)).toBe(false);
    });

    it("should work with reversed range", () => {
        const sm = new SelectionManager();
        sm.setRange(5, 8, 1, 2);
        expect(sm.contains(3, 5)).toBe(true);
        expect(sm.contains(0, 5)).toBe(false);
    });

    it("should contain the active cell", () => {
        const sm = new SelectionManager();
        sm.setActive(3, 5);
        expect(sm.contains(3, 5)).toBe(true);
    });
});

describe("SelectionManager - selectAll", () => {
    it("should select entire sheet", () => {
        const sm = new SelectionManager();
        sm.selectAll(100, 26);
        const range = sm.getRange();
        expect(range.topRow).toBe(0);
        expect(range.topCol).toBe(0);
        expect(range.bottomRow).toBe(100);
        expect(range.bottomCol).toBe(26);
    });

    it("should not be single cell after selectAll", () => {
        const sm = new SelectionManager();
        sm.selectAll(100, 26);
        expect(sm.isSingleCell()).toBe(false);
    });
});

describe("SelectionManager - selectRow", () => {
    it("should select entire row", () => {
        const sm = new SelectionManager();
        sm.selectRow(5, 26);
        const range = sm.getRange();
        expect(range.topRow).toBe(5);
        expect(range.bottomRow).toBe(5);
        expect(range.topCol).toBe(0);
        expect(range.bottomCol).toBe(26);
    });

    it("should contain cells in the selected row", () => {
        const sm = new SelectionManager();
        sm.selectRow(5, 26);
        expect(sm.contains(5, 0)).toBe(true);
        expect(sm.contains(5, 26)).toBe(true);
        expect(sm.contains(4, 0)).toBe(false);
    });
});

describe("SelectionManager - selectCol", () => {
    it("should select entire column", () => {
        const sm = new SelectionManager();
        sm.selectCol(3, 100);
        const range = sm.getRange();
        expect(range.topRow).toBe(0);
        expect(range.bottomRow).toBe(100);
        expect(range.topCol).toBe(3);
        expect(range.bottomCol).toBe(3);
    });

    it("should contain cells in the selected column", () => {
        const sm = new SelectionManager();
        sm.selectCol(3, 100);
        expect(sm.contains(0, 3)).toBe(true);
        expect(sm.contains(100, 3)).toBe(true);
        expect(sm.contains(0, 2)).toBe(false);
    });
});

describe("SelectionManager - State transitions", () => {
    it("should override previous selection", () => {
        const sm = new SelectionManager();
        sm.setRange(1, 2, 5, 8);
        sm.setActive(10, 20);
        expect(sm.isSingleCell()).toBe(true);
        expect(sm.getActive()).toEqual([10, 20]);
    });

    it("should expand from active to range", () => {
        const sm = new SelectionManager();
        sm.setActive(3, 3);
        sm.setRange(3, 3, 8, 10);
        expect(sm.isSingleCell()).toBe(false);
        expect(sm.getAnchor()).toEqual([3, 3]);
        expect(sm.getFocus()).toEqual([8, 10]);
    });

    it("should handle selectAll then setActive", () => {
        const sm = new SelectionManager();
        sm.selectAll(100, 26);
        sm.setActive(5, 5);
        expect(sm.isSingleCell()).toBe(true);
    });
});