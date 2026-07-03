import { describe, it, expect } from "vitest";
import { FrozenBoundaryInfo } from "../../../../src/render/header/models/FrozenBoundaryInfo.js";
import { LogicalCell } from "../../../../src/render/header/models/LogicalCell.js";

describe("FrozenBoundaryInfo", () => {
    describe("构造与属性", () => {
        it("应正确存储 fixedCols 和 fixedRows", () => {
            const fb = new FrozenBoundaryInfo({ fixedCols: 2, fixedRows: 3 });
            expect(fb.fixedCols).toBe(2);
            expect(fb.fixedRows).toBe(3);
        });

        it("应支持 fixedCols=0, fixedRows=0", () => {
            const fb = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });
            expect(fb.fixedCols).toBe(0);
            expect(fb.fixedRows).toBe(0);
        });
    });

    describe("hasHorizontalBoundary", () => {
        it("fixedCols > 0 时为 true", () => {
            const fb = new FrozenBoundaryInfo({ fixedCols: 1, fixedRows: 0 });
            expect(fb.hasHorizontalBoundary).toBe(true);
        });

        it("fixedCols = 0 时为 false", () => {
            const fb = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });
            expect(fb.hasHorizontalBoundary).toBe(false);
        });
    });

    describe("hasVerticalBoundary", () => {
        it("fixedRows > 0 时为 true", () => {
            const fb = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 1 });
            expect(fb.hasVerticalBoundary).toBe(true);
        });

        it("fixedRows = 0 时为 false", () => {
            const fb = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });
            expect(fb.hasVerticalBoundary).toBe(false);
        });
    });

    describe("splitsCellHorizontally", () => {
        it("无水平边界时始终返回 false", () => {
            const fb = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });
            const cell = new LogicalCell({ layerIndex: 0, startCol: 0, endCol: 5, colspan: 6, label: "X" });
            expect(fb.splitsCellHorizontally(cell)).toBe(false);
        });

        it("单元格完全在冻结区内 → 不拆分", () => {
            const fb = new FrozenBoundaryInfo({ fixedCols: 2, fixedRows: 0 });
            const cell = new LogicalCell({ layerIndex: 0, startCol: 0, endCol: 1, colspan: 2, label: "AB" });
            expect(fb.splitsCellHorizontally(cell)).toBe(false);
        });

        it("单元格完全在滚动区 → 不拆分", () => {
            const fb = new FrozenBoundaryInfo({ fixedCols: 2, fixedRows: 0 });
            const cell = new LogicalCell({ layerIndex: 0, startCol: 2, endCol: 3, colspan: 2, label: "CD" });
            expect(fb.splitsCellHorizontally(cell)).toBe(false);
        });

        it("单元格跨越冻结边界 → 需拆分", () => {
            const fb = new FrozenBoundaryInfo({ fixedCols: 1, fixedRows: 0 });
            const cell = new LogicalCell({ layerIndex: 0, startCol: 0, endCol: 1, colspan: 2, label: "AB" });
            expect(fb.splitsCellHorizontally(cell)).toBe(true);
        });

        it("colspan=3 跨越 fixedCols=1 → 需拆分", () => {
            const fb = new FrozenBoundaryInfo({ fixedCols: 1, fixedRows: 0 });
            const cell = new LogicalCell({ layerIndex: 0, startCol: 0, endCol: 2, colspan: 3, label: "ABC" });
            expect(fb.splitsCellHorizontally(cell)).toBe(true);
        });

        it("colspan=3 跨越 fixedCols=2 → 需拆分", () => {
            const fb = new FrozenBoundaryInfo({ fixedCols: 2, fixedRows: 0 });
            const cell = new LogicalCell({ layerIndex: 0, startCol: 0, endCol: 2, colspan: 3, label: "ABC" });
            expect(fb.splitsCellHorizontally(cell)).toBe(true);
        });
    });

    describe("splitsCellVertically", () => {
        it("无垂直边界时始终返回 false", () => {
            const fb = new FrozenBoundaryInfo({ fixedCols: 0, fixedRows: 0 });
            const cell = new LogicalCell({ layerIndex: 0, startCol: 0, endCol: 0, colspan: 1, label: "X" });
            expect(fb.splitsCellVertically(cell)).toBe(false);
        });
    });
});