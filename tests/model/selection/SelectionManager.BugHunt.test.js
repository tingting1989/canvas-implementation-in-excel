import { describe, it, expect, beforeEach } from "vitest";
import { SelectionManager } from "@/model/selection/SelectionManager";

describe("SelectionManager - Bug Hunting", () => {
    let sel;

    beforeEach(() => {
        sel = new SelectionManager();
    });

    describe("setActive / getActive - 基本不变量", () => {
        it("BUG: setActive后getActive应返回相同位置", () => {
            sel.setActive(5, 3);
            const [r, c] = sel.getActive();
            expect(r).toBe(5);
            expect(c).toBe(3);
        });

        it("BUG: setActive后isSingleCell应为true", () => {
            sel.setActive(5, 3);
            expect(sel.isSingleCell()).toBe(true);
        });

        it("BUG: setActive后getAnchor和getFocus应相同", () => {
            sel.setActive(5, 3);
            const [ar, ac] = sel.getAnchor();
            const [fr, fc] = sel.getFocus();
            expect(ar).toBe(fr);
            expect(ac).toBe(fc);
        });

        it("BUG: setActive(0, 0)应正确", () => {
            sel.setActive(0, 0);
            const [r, c] = sel.getActive();
            expect(r).toBe(0);
            expect(c).toBe(0);
        });
    });

    describe("setRange / getRange - 范围选区", () => {
        it("BUG: setRange后isSingleCell应为false", () => {
            sel.setRange(0, 0, 3, 3);
            expect(sel.isSingleCell()).toBe(false);
        });

        it("BUG: getRange应返回归一化的范围", () => {
            sel.setRange(5, 5, 2, 2);
            const range = sel.getRange();
            expect(range.topRow).toBe(2);
            expect(range.topCol).toBe(2);
            expect(range.bottomRow).toBe(5);
            expect(range.bottomCol).toBe(5);
        });

        it("BUG: setRange锚点=焦点时isSingleCell应为true", () => {
            sel.setRange(3, 3, 3, 3);
            expect(sel.isSingleCell()).toBe(true);
        });

        it("BUG: setRange后getAnchor和getFocus应不同", () => {
            sel.setRange(0, 0, 5, 5);
            const [ar, ac] = sel.getAnchor();
            const [fr, fc] = sel.getFocus();
            expect(ar).toBe(0);
            expect(ac).toBe(0);
            expect(fr).toBe(5);
            expect(fc).toBe(5);
        });

        it("BUG: 反向setRange后getRange应正确归一化", () => {
            sel.setRange(10, 8, 3, 2);
            const range = sel.getRange();
            expect(range.topRow).toBe(3);
            expect(range.topCol).toBe(2);
            expect(range.bottomRow).toBe(10);
            expect(range.bottomCol).toBe(8);
        });
    });

    describe("contains - 包含判断", () => {
        it("BUG: 选区内的单元格应返回true", () => {
            sel.setRange(0, 0, 5, 5);
            expect(sel.contains(0, 0)).toBe(true);
            expect(sel.contains(5, 5)).toBe(true);
            expect(sel.contains(3, 3)).toBe(true);
        });

        it("BUG: 选区外的单元格应返回false", () => {
            sel.setRange(0, 0, 5, 5);
            expect(sel.contains(6, 5)).toBe(false);
            expect(sel.contains(5, 6)).toBe(false);
            expect(sel.contains(-1, 0)).toBe(false);
        });

        it("BUG: 边界上的单元格应返回true", () => {
            sel.setRange(2, 2, 5, 5);
            expect(sel.contains(2, 2)).toBe(true);
            expect(sel.contains(5, 5)).toBe(true);
            expect(sel.contains(2, 5)).toBe(true);
            expect(sel.contains(5, 2)).toBe(true);
        });

        it("BUG: 单个单元格选区应只包含自身", () => {
            sel.setActive(3, 3);
            expect(sel.contains(3, 3)).toBe(true);
            expect(sel.contains(3, 4)).toBe(false);
            expect(sel.contains(4, 3)).toBe(false);
        });
    });

    describe("selectAll - 全选", () => {
        it("BUG: selectAll后getRange应覆盖整个表", () => {
            sel.selectAll(100, 50);
            const range = sel.getRange();
            expect(range.topRow).toBe(0);
            expect(range.topCol).toBe(0);
            expect(range.bottomRow).toBe(100);
            expect(range.bottomCol).toBe(50);
        });

        it("BUG: selectAll后isSingleCell应为false", () => {
            sel.selectAll(100, 50);
            expect(sel.isSingleCell()).toBe(false);
        });
    });

    describe("selectRow - 整行选中", () => {
        it("BUG: selectRow后getRange应覆盖整行", () => {
            sel.selectRow(5, 100);
            const range = sel.getRange();
            expect(range.topRow).toBe(5);
            expect(range.bottomRow).toBe(5);
            expect(range.topCol).toBe(0);
            expect(range.bottomCol).toBe(100);
        });

        it("BUG: selectRow后contains应正确", () => {
            sel.selectRow(3, 100);
            expect(sel.contains(3, 0)).toBe(true);
            expect(sel.contains(3, 100)).toBe(true);
            expect(sel.contains(2, 50)).toBe(false);
            expect(sel.contains(4, 50)).toBe(false);
        });
    });

    describe("selectCol - 整列选中", () => {
        it("BUG: selectCol后getRange应覆盖整列", () => {
            sel.selectCol(5, 100);
            const range = sel.getRange();
            expect(range.topRow).toBe(0);
            expect(range.bottomRow).toBe(100);
            expect(range.topCol).toBe(5);
            expect(range.bottomCol).toBe(5);
        });

        it("BUG: selectCol后contains应正确", () => {
            sel.selectCol(3, 100);
            expect(sel.contains(0, 3)).toBe(true);
            expect(sel.contains(100, 3)).toBe(true);
            expect(sel.contains(50, 2)).toBe(false);
            expect(sel.contains(50, 4)).toBe(false);
        });
    });

    describe("状态切换一致性", () => {
        it("BUG: setActive后setRange应覆盖", () => {
            sel.setActive(5, 5);
            sel.setRange(0, 0, 10, 10);

            expect(sel.isSingleCell()).toBe(false);
            const range = sel.getRange();
            expect(range.topRow).toBe(0);
            expect(range.bottomRow).toBe(10);
        });

        it("BUG: setRange后setActive应覆盖", () => {
            sel.setRange(0, 0, 10, 10);
            sel.setActive(5, 5);

            expect(sel.isSingleCell()).toBe(true);
            const [r, c] = sel.getActive();
            expect(r).toBe(5);
            expect(c).toBe(5);
        });

        it("BUG: 多次setActive应只保留最后一次", () => {
            sel.setActive(1, 1);
            sel.setActive(2, 2);
            sel.setActive(3, 3);

            const [r, c] = sel.getActive();
            expect(r).toBe(3);
            expect(c).toBe(3);
        });
    });

    describe("极端值", () => {
        it("BUG: setActive(0, 0)应正确", () => {
            sel.setActive(0, 0);
            expect(sel.isSingleCell()).toBe(true);
            expect(sel.contains(0, 0)).toBe(true);
        });

        it("BUG: selectAll(0, 0)应正确", () => {
            sel.selectAll(0, 0);
            const range = sel.getRange();
            expect(range.topRow).toBe(0);
            expect(range.topCol).toBe(0);
            expect(range.bottomRow).toBe(0);
            expect(range.bottomCol).toBe(0);
        });
    });
});