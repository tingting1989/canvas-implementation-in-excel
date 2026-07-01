import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FormulaBarElement } from "@/ui/formulaBar/FormulaBarElement.js";

describe("FormulaBarElement Web Component", () => {
    let element;

    beforeEach(() => {
        element = document.createElement("formula-bar");
        document.body.appendChild(element);
    });

    afterEach(() => {
        element.destroy();
        element.remove();
    });

    it("FBE-01: 渲染 Shadow DOM — 包含 cell-ref 和 formula-input", () => {
        const cellRef = element.shadowRoot.querySelector(".cell-ref");
        const input = element.shadowRoot.querySelector(".formula-input");

        expect(cellRef).not.toBeNull();
        expect(input).not.toBeNull();
    });

    it("FBE-02: 默认 cell-ref 为 A1", () => {
        const cellRef = element.shadowRoot.querySelector(".cell-ref");
        expect(cellRef.textContent).toBe("A1");
    });

    it("FBE-03: 设置 cell-ref 属性后更新显示", () => {
        element.setAttribute("cell-ref", "B3");

        const cellRef = element.shadowRoot.querySelector(".cell-ref");
        expect(cellRef.textContent).toBe("B3");
    });

    it("FBE-04: 设置 value 属性后更新输入框", () => {
        element.setAttribute("value", "=SUM(A1:A10)");

        const input = element.shadowRoot.querySelector(".formula-input");
        expect(input.value).toBe("=SUM(A1:A10)");
    });

    it("FBE-05: Enter 键派发 commit 事件", () => {
        const commitSpy = vi.fn();
        element.addEventListener("commit", commitSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.value = "Hello";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

        expect(commitSpy).toHaveBeenCalledTimes(1);
        expect(commitSpy.mock.calls[0][0].detail.value).toBe("Hello");

        element.removeEventListener("commit", commitSpy);
    });

    it("FBE-06: Escape 键派发 cancel 事件", () => {
        const cancelSpy = vi.fn();
        element.addEventListener("cancel", cancelSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(cancelSpy).toHaveBeenCalledTimes(1);

        element.removeEventListener("cancel", cancelSpy);
    });

    it("FBE-07: Tab 键派发 commit-and-move 事件 (direction=next)", () => {
        const moveSpy = vi.fn();
        element.addEventListener("commit-and-move", moveSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.value = "test";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

        expect(moveSpy).toHaveBeenCalledTimes(1);
        expect(moveSpy.mock.calls[0][0].detail.value).toBe("test");
        expect(moveSpy.mock.calls[0][0].detail.direction).toBe("next");

        element.removeEventListener("commit-and-move", moveSpy);
    });

    it("FBE-08: Shift+Tab 派发 commit-and-move 事件 (direction=prev)", () => {
        const moveSpy = vi.fn();
        element.addEventListener("commit-and-move", moveSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));

        expect(moveSpy).toHaveBeenCalledTimes(1);
        expect(moveSpy.mock.calls[0][0].detail.direction).toBe("prev");

        element.removeEventListener("commit-and-move", moveSpy);
    });

    it("FBE-09: Focus 派发 start-edit 事件", () => {
        const editSpy = vi.fn();
        element.addEventListener("start-edit", editSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new Event("focus", { bubbles: true }));

        expect(editSpy).toHaveBeenCalledTimes(1);

        element.removeEventListener("start-edit", editSpy);
    });

    it("FBE-10: Focus 时设置 editing 属性", () => {
        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new Event("focus", { bubbles: true }));

        expect(element.hasAttribute("editing")).toBe(true);
    });

    it("FBE-11: Blur 时移除 editing 属性", () => {
        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new Event("focus", { bubbles: true }));
        expect(element.hasAttribute("editing")).toBe(true);

        input.dispatchEvent(new Event("blur", { bubbles: true }));
        expect(element.hasAttribute("editing")).toBe(false);
    });

    it("FBE-12: setValue 方法更新输入框值", () => {
        element.setValue("new value");

        const input = element.shadowRoot.querySelector(".formula-input");
        expect(input.value).toBe("new value");
    });

    it("FBE-13: getValue 方法返回输入框值", () => {
        const input = element.shadowRoot.querySelector(".formula-input");
        input.value = "test value";

        expect(element.getValue()).toBe("test value");
    });

    it("FBE-14: cancelEdit 方法移除 editing 属性", () => {
        element.setAttribute("editing", "");
        expect(element.hasAttribute("editing")).toBe(true);

        element.cancelEdit();

        expect(element.hasAttribute("editing")).toBe(false);
    });

    it("FBE-15: IME 输入中不触发 commit", () => {
        const commitSpy = vi.fn();
        element.addEventListener("commit", commitSpy);

        const input = element.shadowRoot.querySelector(".formula-input");

        input.dispatchEvent(new Event("compositionstart", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

        expect(commitSpy).not.toHaveBeenCalled();

        input.dispatchEvent(new Event("compositionend", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

        expect(commitSpy).toHaveBeenCalledTimes(1);

        element.removeEventListener("commit", commitSpy);
    });

    it("FBE-16: commit 事件穿越 Shadow DOM (composed: true)", () => {
        const wrapper = document.createElement("div");
        wrapper.appendChild(element);
        document.body.appendChild(wrapper);

        const commitSpy = vi.fn();
        wrapper.addEventListener("commit", commitSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

        expect(commitSpy).toHaveBeenCalledTimes(1);

        wrapper.removeEventListener("commit", commitSpy);
        wrapper.remove();
    });

    it("FBE-17: destroy 后组件标记为已销毁", () => {
        element.destroy();

        expect(element.isDestroyed).toBe(true);
    });

    it("FBE-18: observedAttributes 包含 cell-ref, value, editing", () => {
        expect(FormulaBarElement.observedAttributes).toEqual(
            expect.arrayContaining(["cell-ref", "value", "editing"]),
        );
    });

    it("FBE-19: XSS 防护 — cell-ref 中的 HTML 不会被渲染为标签", () => {
        element.setAttribute("cell-ref", '<script>alert("xss")</script>');

        const cellRef = element.shadowRoot.querySelector(".cell-ref");
        expect(cellRef.querySelector("script")).toBeNull();
    });
});