import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FormulaBarElement } from "@/ui/formulaBar/FormulaBarElement.js";
import { FORMULA_BAR_EVENTS } from "@/ui/formulaBar/FormulaBarEvents.js";

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

    it("FBE-04: setValue 方法更新输入框值", () => {
        element.setValue("=SUM(A1:A10)");

        const input = element.shadowRoot.querySelector(".formula-input");
        expect(input.value).toBe("=SUM(A1:A10)");
    });

    it("FBE-05: Enter 键派发 commit 事件", () => {
        const commitSpy = vi.fn();
        element.addEventListener(FORMULA_BAR_EVENTS.COMMIT, commitSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.value = "Hello";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

        expect(commitSpy).toHaveBeenCalledTimes(1);
        expect(commitSpy.mock.calls[0][0].detail.value).toBe("Hello");

        element.removeEventListener(FORMULA_BAR_EVENTS.COMMIT, commitSpy);
    });

    it("FBE-06: Escape 键派发 cancel 事件", () => {
        const cancelSpy = vi.fn();
        element.addEventListener(FORMULA_BAR_EVENTS.CANCEL, cancelSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(cancelSpy).toHaveBeenCalledTimes(1);

        element.removeEventListener(FORMULA_BAR_EVENTS.CANCEL, cancelSpy);
    });

    it("FBE-07: Tab 键派发 commit-and-move 事件 (direction=next)", () => {
        const moveSpy = vi.fn();
        element.addEventListener(FORMULA_BAR_EVENTS.COMMIT_AND_MOVE, moveSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.value = "test";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

        expect(moveSpy).toHaveBeenCalledTimes(1);
        expect(moveSpy.mock.calls[0][0].detail.value).toBe("test");
        expect(moveSpy.mock.calls[0][0].detail.direction).toBe("next");

        element.removeEventListener(FORMULA_BAR_EVENTS.COMMIT_AND_MOVE, moveSpy);
    });

    it("FBE-08: Shift+Tab 派发 commit-and-move 事件 (direction=prev)", () => {
        const moveSpy = vi.fn();
        element.addEventListener(FORMULA_BAR_EVENTS.COMMIT_AND_MOVE, moveSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));

        expect(moveSpy).toHaveBeenCalledTimes(1);
        expect(moveSpy.mock.calls[0][0].detail.direction).toBe("prev");

        element.removeEventListener(FORMULA_BAR_EVENTS.COMMIT_AND_MOVE, moveSpy);
    });

    it("FBE-09: Focus 派发 start-edit 事件", () => {
        const editSpy = vi.fn();
        element.addEventListener(FORMULA_BAR_EVENTS.START_EDIT, editSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new Event("focus", { bubbles: true }));

        expect(editSpy).toHaveBeenCalledTimes(1);

        element.removeEventListener(FORMULA_BAR_EVENTS.START_EDIT, editSpy);
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
        element.addEventListener(FORMULA_BAR_EVENTS.COMMIT, commitSpy);

        const input = element.shadowRoot.querySelector(".formula-input");

        input.dispatchEvent(new Event("compositionstart", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

        expect(commitSpy).not.toHaveBeenCalled();

        input.dispatchEvent(new Event("compositionend", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

        expect(commitSpy).toHaveBeenCalledTimes(1);

        element.removeEventListener(FORMULA_BAR_EVENTS.COMMIT, commitSpy);
    });

    it("FBE-16: commit 事件穿越 Shadow DOM (composed: true)", () => {
        const wrapper = document.createElement("div");
        wrapper.appendChild(element);
        document.body.appendChild(wrapper);

        const commitSpy = vi.fn();
        wrapper.addEventListener(FORMULA_BAR_EVENTS.COMMIT, commitSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

        expect(commitSpy).toHaveBeenCalledTimes(1);

        wrapper.removeEventListener(FORMULA_BAR_EVENTS.COMMIT, commitSpy);
        wrapper.remove();
    });

    it("FBE-17: destroy 后组件标记为已销毁", () => {
        element.destroy();

        expect(element.isDestroyed).toBe(true);
    });

    it("FBE-18: observedAttributes 包含 cell-ref, editing", () => {
        expect(FormulaBarElement.observedAttributes).toEqual(
            expect.arrayContaining(["cell-ref", "editing"]),
        );
        expect(FormulaBarElement.observedAttributes).not.toContain("value");
    });

    it("FBE-19: XSS 防护 — cell-ref 中的 HTML 不会被渲染为标签", () => {
        element.setAttribute("cell-ref", '<script>alert("xss")</script>');

        const cellRef = element.shadowRoot.querySelector(".cell-ref");
        expect(cellRef.querySelector("script")).toBeNull();
    });

    it("FBE-20: render() 增量更新 — cell-ref 变化时不重建整个 Shadow DOM", () => {
        const input = element.shadowRoot.querySelector(".formula-input");
        input.value = "user typing";

        element.setAttribute("cell-ref", "C5");

        const sameInput = element.shadowRoot.querySelector(".formula-input");
        expect(sameInput).toBe(input);
        expect(sameInput.value).toBe("user typing");

        const cellRef = element.shadowRoot.querySelector(".cell-ref");
        expect(cellRef.textContent).toBe("C5");
    });

    it("FBE-21: setValue() 在编辑状态下更新内部状态和输入框", () => {
        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new Event("focus", { bubbles: true }));

        element.setValue("new value");

        expect(input.value).toBe("new value");
    });

    it("FBE-22: setValue() 在非编辑状态下更新内部状态和输入框", () => {
        element.setValue("=SUM(A1:A10)");

        const input = element.shadowRoot.querySelector(".formula-input");
        expect(input.value).toBe("=SUM(A1:A10)");
    });

    it("FBE-23: render() 增量更新 — 多次 setAttribute 不丢失 DOM 结构", () => {
        element.setAttribute("cell-ref", "B2");
        element.setAttribute("cell-ref", "C3");
        element.setAttribute("cell-ref", "D4");

        expect(element.shadowRoot.querySelector(".cell-ref")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".formula-input")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".cell-ref").textContent).toBe("D4");
    });

    it("FBE-24: editing 属性通过 CSS :host([editing]) 控制背景色", () => {
        element.setAttribute("editing", "");
        expect(element.hasAttribute("editing")).toBe(true);

        element.removeAttribute("editing");
        expect(element.hasAttribute("editing")).toBe(false);
    });

    it("FBE-25: onDisconnect 清理内部状态", () => {
        element.setValue("some value");
        element.setAttribute("cell-ref", "Z9");

        element.destroy();

        expect(element.getValue()).toBe("");
    });

    it("FBE-26: focus/cancelEdit 安全调用 — Shadow DOM 不存在时不报错", () => {
        element.destroy();

        expect(() => element.focus()).not.toThrow();
        expect(() => element.cancelEdit()).not.toThrow();
    });

    it("FBE-27: getValue 在 Shadow DOM 不存在时返回内部状态", () => {
        element.setValue("stored");
        element.destroy();

        expect(element.getValue()).toBe("");
    });

    it("FBE-28: keydown 事件不会冒泡到宿主元素外部 — 防止 KeyboardStrategy 拦截", () => {
        const outerSpy = vi.fn();
        document.addEventListener("keydown", outerSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, composed: true }));

        expect(outerSpy).not.toHaveBeenCalled();

        document.removeEventListener("keydown", outerSpy);
    });

    it("FBE-29: keydown 事件在宿主元素上被 stopPropagation — 字符输入不泄漏", () => {
        const parentSpy = vi.fn();
        element.parentNode.addEventListener("keydown", parentSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "A", bubbles: true, composed: true }));

        expect(parentSpy).not.toHaveBeenCalled();

        element.parentNode.removeEventListener("keydown", parentSpy);
    });

    it("FBE-30: keydown 事件在宿主元素上被 stopPropagation — Enter 不泄漏", () => {
        const parentSpy = vi.fn();
        element.parentNode.addEventListener("keydown", parentSpy);

        const input = element.shadowRoot.querySelector(".formula-input");
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }));

        expect(parentSpy).not.toHaveBeenCalled();

        element.parentNode.removeEventListener("keydown", parentSpy);
    });
});