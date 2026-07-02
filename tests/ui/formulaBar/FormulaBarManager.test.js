import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FormulaBarManager } from "@/ui/formulaBar/FormulaBarManager.js";
import { FORMULA_BAR_EVENTS } from "@/ui/formulaBar/formulaBarEvents.js";

describe("FormulaBarManager 功能", () => {
    let container;
    let mockWorkbook;
    let mockSheet;

    beforeEach(() => {
        container = document.createElement("div");
        container.style.width = "800px";
        container.style.height = "60px";
        document.body.appendChild(container);

        mockSheet = {
            selection: {
                getFocus: vi.fn().mockReturnValue([0, 0]),
                setActive: vi.fn(),
            },
            cellStore: {
                get: vi.fn().mockReturnValue(null),
            },
            setCell: vi.fn(),
            rowColManager: {
                realColCount: 26,
                rowCount: 100,
            },
        };

        mockWorkbook = {
            activeSheet: mockSheet,
            renderEngine: {
                render: vi.fn(),
                canvas: { focus: vi.fn() },
            },
        };
    });

    afterEach(() => {
        container.remove();
    });

    it("FBM-01: 创建时在容器中插入 formula-bar 元素", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);

        const element = container.querySelector("formula-bar");
        expect(element).not.toBeNull();
        expect(element instanceof HTMLElement).toBe(true);

        fb.destroy();
    });

    it("FBM-02: 创建时元素插入到容器最前面", () => {
        const existing = document.createElement("div");
        existing.id = "existing";
        container.appendChild(existing);

        const fb = new FormulaBarManager(mockWorkbook, container);

        expect(container.firstChild.tagName).toBe("FORMULA-BAR");

        fb.destroy();
    });

    it("FBM-03: commit 事件 — 将输入值写入当前单元格", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);
        fb.update();

        const element = container.querySelector("formula-bar");
        element.dispatchEvent(
            new CustomEvent("commit", {
                bubbles: true,
                composed: true,
                detail: { value: "Hello" },
            }),
        );

        expect(mockSheet.setCell).toHaveBeenCalledWith(0, 0, "Hello", 0);

        fb.destroy();
    });

    it("FBM-04: commit 事件 — 值与原始值相同时不写入", () => {
        mockSheet.cellStore.get.mockReturnValue({ value: "same", formula: null });
        const fb = new FormulaBarManager(mockWorkbook, container);
        fb.update();

        const element = container.querySelector("formula-bar");
        element.dispatchEvent(
            new CustomEvent("commit", {
                bubbles: true,
                composed: true,
                detail: { value: "same" },
            }),
        );

        expect(mockSheet.setCell).not.toHaveBeenCalled();

        fb.destroy();
    });

    it("FBM-05: commit 事件 — 空字符串清空单元格", () => {
        mockSheet.cellStore.get.mockReturnValue({ value: "old", formula: null });
        const fb = new FormulaBarManager(mockWorkbook, container);
        fb.update();

        const element = container.querySelector("formula-bar");
        element.dispatchEvent(
            new CustomEvent("commit", {
                bubbles: true,
                composed: true,
                detail: { value: "" },
            }),
        );

        expect(mockSheet.setCell).toHaveBeenCalledWith(0, 0, "");

        fb.destroy();
    });

    it("FBM-06: cancel 事件 — 恢复原始值并取消编辑", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);
        const element = container.querySelector("formula-bar");
        const cancelEditSpy = vi.spyOn(element, "cancelEdit");

        element.dispatchEvent(
            new CustomEvent("cancel", {
                bubbles: true,
                composed: true,
            }),
        );

        expect(cancelEditSpy).toHaveBeenCalled();

        fb.destroy();
    });

    it("FBM-07: commit-and-move 事件 — 提交值并移动到下一列", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);
        fb.update();

        const element = container.querySelector("formula-bar");
        element.dispatchEvent(
            new CustomEvent("commit-and-move", {
                bubbles: true,
                composed: true,
                detail: { value: "test", direction: "next" },
            }),
        );

        expect(mockSheet.setCell).toHaveBeenCalled();
        expect(mockSheet.selection.setActive).toHaveBeenCalledWith(0, 1);

        fb.destroy();
    });

    it("FBM-08: commit-and-move 事件 — direction=prev 移动到上一列", () => {
        mockSheet.selection.getFocus.mockReturnValue([0, 2]);
        const fb = new FormulaBarManager(mockWorkbook, container);
        fb.update();

        const element = container.querySelector("formula-bar");
        element.dispatchEvent(
            new CustomEvent("commit-and-move", {
                bubbles: true,
                composed: true,
                detail: { value: "test", direction: "prev" },
            }),
        );

        expect(mockSheet.selection.setActive).toHaveBeenCalledWith(0, 1);

        fb.destroy();
    });

    it("FBM-09: start-edit 事件 — 记录原始值", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);
        const element = container.querySelector("formula-bar");
        const getValueSpy = vi.spyOn(element, "getValue").mockReturnValue("original");

        element.dispatchEvent(
            new CustomEvent("start-edit", {
                bubbles: true,
                composed: true,
            }),
        );

        expect(getValueSpy).toHaveBeenCalled();

        fb.destroy();
    });

    it("FBM-10: update — 无活动 sheet 时清空显示", () => {
        mockWorkbook.activeSheet = null;
        const fb = new FormulaBarManager(mockWorkbook, container);

        const element = container.querySelector("formula-bar");
        const setAttrSpy = vi.spyOn(element, "setAttribute");
        const setValueSpy = vi.spyOn(element, "setValue");

        fb.update();

        expect(setAttrSpy).toHaveBeenCalledWith("cell-ref", "");
        expect(setValueSpy).toHaveBeenCalledWith("");

        fb.destroy();
    });

    it("FBM-11: update — 有公式时显示公式", () => {
        mockSheet.cellStore.get.mockReturnValue({ formula: "=SUM(A1:A10)", value: 55 });
        const fb = new FormulaBarManager(mockWorkbook, container);

        const element = container.querySelector("formula-bar");
        const setValueSpy = vi.spyOn(element, "setValue");

        fb.update();

        expect(setValueSpy).toHaveBeenCalledWith("=SUM(A1:A10)");

        fb.destroy();
    });

    it("FBM-12: update — 无公式时显示值", () => {
        mockSheet.cellStore.get.mockReturnValue({ value: 42, formula: null });
        const fb = new FormulaBarManager(mockWorkbook, container);

        const element = container.querySelector("formula-bar");
        const setValueSpy = vi.spyOn(element, "setValue");

        fb.update();

        expect(setValueSpy).toHaveBeenCalledWith(42);

        fb.destroy();
    });

    it("FBM-13: update — 单元格引用正确转换 (0,0)→A1", () => {
        mockSheet.selection.getFocus.mockReturnValue([0, 0]);
        const fb = new FormulaBarManager(mockWorkbook, container);

        const element = container.querySelector("formula-bar");
        const setAttrSpy = vi.spyOn(element, "setAttribute");

        fb.update();

        expect(setAttrSpy).toHaveBeenCalledWith("cell-ref", "A1");

        fb.destroy();
    });

    it("FBM-14: update — 单元格引用正确转换 (0,25)→Z1", () => {
        mockSheet.selection.getFocus.mockReturnValue([0, 25]);
        const fb = new FormulaBarManager(mockWorkbook, container);

        const element = container.querySelector("formula-bar");
        const setAttrSpy = vi.spyOn(element, "setAttribute");

        fb.update();

        expect(setAttrSpy).toHaveBeenCalledWith("cell-ref", "Z1");

        fb.destroy();
    });

    it("FBM-15: update — 单元格引用正确转换 (0,26)→AA1", () => {
        mockSheet.selection.getFocus.mockReturnValue([0, 26]);
        const fb = new FormulaBarManager(mockWorkbook, container);

        const element = container.querySelector("formula-bar");
        const setAttrSpy = vi.spyOn(element, "setAttribute");

        fb.update();

        expect(setAttrSpy).toHaveBeenCalledWith("cell-ref", "AA1");

        fb.destroy();
    });

    it("FBM-16: commit — 保留原有 styleId", () => {
        mockSheet.cellStore.get.mockReturnValue({ value: "old", formula: null, styleId: 5 });
        const fb = new FormulaBarManager(mockWorkbook, container);
        fb.update();

        const element = container.querySelector("formula-bar");
        element.dispatchEvent(
            new CustomEvent("commit", {
                bubbles: true,
                composed: true,
                detail: { value: "new" },
            }),
        );

        expect(mockSheet.setCell).toHaveBeenCalledWith(0, 0, "new", 5);

        fb.destroy();
    });

    it("FBM-17: commit-and-move — 最后一列换行到下一行第一列", () => {
        mockSheet.selection.getFocus.mockReturnValue([0, 25]);
        const fb = new FormulaBarManager(mockWorkbook, container);
        fb.update();

        const element = container.querySelector("formula-bar");
        element.dispatchEvent(
            new CustomEvent("commit-and-move", {
                bubbles: true,
                composed: true,
                detail: { value: "test", direction: "next" },
            }),
        );

        expect(mockSheet.selection.setActive).toHaveBeenCalledWith(1, 0);

        fb.destroy();
    });

    it("FBM-18: startEdit — 聚焦输入框", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);
        const element = container.querySelector("formula-bar");
        const focusSpy = vi.spyOn(element, "focus");

        fb.startEdit();

        expect(focusSpy).toHaveBeenCalled();

        fb.destroy();
    });

    it("FBM-19: commit — 无活动 sheet 时不写入", () => {
        mockWorkbook.activeSheet = null;
        const fb = new FormulaBarManager(mockWorkbook, container);

        const element = container.querySelector("formula-bar");
        element.dispatchEvent(
            new CustomEvent("commit", {
                bubbles: true,
                composed: true,
                detail: { value: "test" },
            }),
        );

        expect(mockSheet.setCell).not.toHaveBeenCalled();

        fb.destroy();
    });

    it("FBM-20: 构造函数 — workbook 为 null 时抛出 TypeError", () => {
        expect(() => new FormulaBarManager(null, container)).toThrow(TypeError);
    });

    it("FBM-21: 构造函数 — workbook 为 undefined 时抛出 TypeError", () => {
        expect(() => new FormulaBarManager(undefined, container)).toThrow(TypeError);
    });

    it("FBM-22: 构造函数 — container 为非 HTMLElement 时不插入 DOM", () => {
        const fb = new FormulaBarManager(mockWorkbook, "not-an-element");

        expect(document.querySelector("formula-bar")).toBeNull();

        fb.destroy();
    });

    it("FBM-23: 构造函数 — container 为 null 时创建 element 但不插入", () => {
        const fb = new FormulaBarManager(mockWorkbook, null);

        expect(document.querySelector("formula-bar")).toBeNull();

        fb.destroy();
    });
});