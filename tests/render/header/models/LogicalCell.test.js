import { describe, it, expect } from "vitest";
import { LogicalCell } from "../../../../src/render/header/models/LogicalCell.js";

describe("LogicalCell", () => {
    describe("构造与属性", () => {
        it("应正确存储所有属性", () => {
            const cell = new LogicalCell({
                layerIndex: 0,
                startCol: 2,
                endCol: 4,
                colspan: 3,
                label: "Info",
                style: { backgroundColor: "#4472C4" },
            });

            expect(cell.layerIndex).toBe(0);
            expect(cell.startCol).toBe(2);
            expect(cell.endCol).toBe(4);
            expect(cell.colspan).toBe(3);
            expect(cell.label).toBe("Info");
            expect(cell.style).toEqual({ backgroundColor: "#4472C4" });
        });

        it("style 未传入时为 undefined", () => {
            const cell = new LogicalCell({
                layerIndex: 1, startCol: 0, endCol: 0, colspan: 1, label: "A",
            });
            expect(cell.style).toBeUndefined();
        });
    });

    describe("isMerged", () => {
        it("colspan=1 时 isMerged 为 false", () => {
            const cell = new LogicalCell({ layerIndex: 0, startCol: 0, endCol: 0, colspan: 1, label: "A" });
            expect(cell.isMerged).toBe(false);
        });

        it("colspan>1 时 isMerged 为 true", () => {
            const cell = new LogicalCell({ layerIndex: 0, startCol: 0, endCol: 1, colspan: 2, label: "AB" });
            expect(cell.isMerged).toBe(true);
        });

        it("colspan=3 时 isMerged 为 true", () => {
            const cell = new LogicalCell({ layerIndex: 0, startCol: 0, endCol: 2, colspan: 3, label: "ABC" });
            expect(cell.isMerged).toBe(true);
        });
    });

    describe("crossesBoundary", () => {
        it("单元格完全在边界左侧 → 不跨越", () => {
            const cell = new LogicalCell({ layerIndex: 0, startCol: 0, endCol: 0, colspan: 1, label: "A" });
            expect(cell.crossesBoundary(1)).toBe(false);
        });

        it("单元格完全在边界右侧 → 不跨越", () => {
            const cell = new LogicalCell({ layerIndex: 0, startCol: 2, endCol: 3, colspan: 2, label: "CD" });
            expect(cell.crossesBoundary(1)).toBe(false);
        });

        it("单元格跨越边界 → 跨越", () => {
            const cell = new LogicalCell({ layerIndex: 0, startCol: 0, endCol: 1, colspan: 2, label: "AB" });
            expect(cell.crossesBoundary(1)).toBe(true);
        });

        it("单元格起始列等于边界 → 不跨越（边界列属于右侧）", () => {
            const cell = new LogicalCell({ layerIndex: 0, startCol: 1, endCol: 2, colspan: 2, label: "BC" });
            expect(cell.crossesBoundary(1)).toBe(false);
        });

        it("colspan=3 跨越边界1", () => {
            const cell = new LogicalCell({ layerIndex: 0, startCol: 0, endCol: 2, colspan: 3, label: "ABC" });
            expect(cell.crossesBoundary(1)).toBe(true);
            expect(cell.crossesBoundary(2)).toBe(true);
            expect(cell.crossesBoundary(3)).toBe(false);
        });

        it("边界为0时任何单元格都不跨越", () => {
            const cell = new LogicalCell({ layerIndex: 0, startCol: 0, endCol: 5, colspan: 6, label: "X" });
            expect(cell.crossesBoundary(0)).toBe(false);
        });
    });
});