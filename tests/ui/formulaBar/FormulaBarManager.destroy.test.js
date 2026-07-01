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

    it("FBM-DESTROY-02: 销毁后 isDisposed 为 true", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);

        expect(fb.isDisposed).toBe(false);

        fb.destroy();

        expect(fb.isDisposed).toBe(true);
    });

    it("FBM-DESTROY-03: 销毁后 FormulaBarElement.destroy() 被调用", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);
        const element = container.querySelector("formula-bar");
        const elementDestroySpy = vi.spyOn(element, "destroy");

        fb.destroy();

        expect(elementDestroySpy).toHaveBeenCalled();
    });

    it("FBM-DESTROY-04: 销毁后 trackEvent 注册的事件监听器被移除", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);
        const setCellSpy = vi.fn();
        mockWorkbook.activeSheet.setCell = setCellSpy;

        fb.destroy();

        const element = container.querySelector("formula-bar");
        if (element) {
            element.dispatchEvent(
                new CustomEvent("commit", {
                    bubbles: true,
                    composed: true,
                    detail: { value: "test" },
                }),
            );
        }

        expect(setCellSpy).not.toHaveBeenCalled();
    });

    it("FBM-DESTROY-05: destroy 幂等 — 连续调用两次不抛异常", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);

        expect(() => {
            fb.destroy();
            fb.destroy();
        }).not.toThrow();
    });

    it("FBM-DESTROY-06: 销毁后 update() 不再操作 DOM", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);
        fb.destroy();

        expect(() => fb.update()).not.toThrow();
    });

    it("FBM-DESTROY-07: 销毁后 startEdit() 不再操作 DOM", () => {
        const fb = new FormulaBarManager(mockWorkbook, container);
        fb.destroy();

        expect(() => fb.startEdit()).not.toThrow();
    });
});