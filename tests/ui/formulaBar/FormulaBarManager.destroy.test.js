import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FormulaBarManager } from "@/ui/formulaBar/FormulaBarManager.js";

describe("FormulaBarManager 销毁", () => {
    let container;
    let mockWorkbook;

    beforeEach(() => {
        container = document.createElement("div");
        container.style.width = "800px";
        container.style.height = "60px";
        document.body.appendChild(container);

        mockWorkbook = {
            activeSheet: {
                selection: {
                    getFocus: vi.fn().mockReturnValue([0, 0]),
                },
                cellStore: {
                    get: vi.fn().mockReturnValue(null),
                },
            },
            renderEngine: {
                render: vi.fn(),
            },
        };
    });

    afterEach(() => {
        container.remove();
    });

    it("FBM-DESTROY-01: 销毁后 Web Component 从容器中移除", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);

        expect(container.querySelector("formula-bar")).not.toBeNull();

        fb.destroy();

        expect(container.querySelector("formula-bar")).toBeNull();
    });

    it("FBM-DESTROY-02: 销毁后 workbook 引用被清空", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);

        fb.destroy();

        expect(fb.isDisposed).toBe(true);
    });

    it("FBM-DESTROY-03: 销毁后事件不再触发", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);
        const commitSpy = vi.fn();

        container.addEventListener("commit", commitSpy);

        fb.destroy();

        const element = container.querySelector("formula-bar");
        if (element) {
            element.dispatchEvent(new CustomEvent("commit", { bubbles: true, composed: true, detail: { value: "test" } }));
        }

        expect(commitSpy).not.toHaveBeenCalled();
        container.removeEventListener("commit", commitSpy);
    });

    it("FBM-DESTROY-04: destroy 幂等 — 连续调用两次不抛异常", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);

        expect(() => {
            fb.destroy();
            fb.destroy();
        }).not.toThrow();
    });
});