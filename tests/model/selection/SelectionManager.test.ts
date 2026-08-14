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
        expect(sm.getRange()).toEqual({ topRow: 1, topCol: 2, bottomRow: 5, bottomCol: 8 });
    });

    it("should normalize when anchor > focus", () => {
        const sm = new SelectionManager();
        sm.setRange(5, 8, 1, 2);
        expect(sm.getRange()).toEqual({ topRow: 1, topCol: 2, bottomRow: 5, bottomCol: 8 });
    });

    it("should normalize mixed anchor/focus", () => {
        const sm = new SelectionManager();
        sm.setRange(5, 2, 1, 8);
        expect(sm.getRange()).toEqual({ topRow: 1, topCol: 2, bottomRow: 5, bottomCol: 8 });
    });
});

describe("SelectionManager - contains", () => {
    it("should return true for cell inside range", () => {
        const sm = new SelectionManager();
        sm.setRange(1, 1, 5, 5);
        expect(sm.contains(3, 3)).toBe(true);
    });

    it("should return false for cell outside range", () => {
        const sm = new SelectionManager();
        sm.setRange(1, 1, 5, 5);
        expect(sm.contains(0, 0)).toBe(false);
        expect(sm.contains(6, 6)).toBe(false);
    });

    it("should return true for cell on boundary", () => {
        const sm = new SelectionManager();
        sm.setRange(1, 1, 5, 5);
        expect(sm.contains(1, 1)).toBe(true);
        expect(sm.contains(5, 5)).toBe(true);
    });
});

describe("SelectionManager - selectAll", () => {
    it("should select entire sheet", () => {
        const sm = new SelectionManager();
        sm.selectAll(100, 26);
        expect(sm.getAnchor()).toEqual([0, 0]);
        expect(sm.getFocus()).toEqual([100, 26]);
    });
});

describe("SelectionManager - selectRow", () => {
    it("should select entire row", () => {
        const sm = new SelectionManager();
        sm.selectRow(3, 26);
        expect(sm.getAnchor()).toEqual([3, 0]);
        expect(sm.getFocus()).toEqual([3, 26]);
    });
});

describe("SelectionManager - selectCol", () => {
    it("should select entire column", () => {
        const sm = new SelectionManager();
        sm.selectCol(5, 100);
        expect(sm.getAnchor()).toEqual([0, 5]);
        expect(sm.getFocus()).toEqual([100, 5]);
    });
});