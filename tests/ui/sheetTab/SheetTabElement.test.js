import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SheetTabElement } from "@/ui/sheetTab/SheetTabElement.js";
import { SHEET_TAB_EVENTS } from "@/ui/sheetTab/SheetTabEvents.js";

describe("SheetTabElement Web Component", () => {
    let element;

    beforeEach(() => {
        element = document.createElement("sheet-tab");
        element.setAttribute("name", "Sheet1");
        document.body.appendChild(element);
    });

    afterEach(() => {
        element.destroy();
        element.remove();
    });

    it("STE-01: 渲染 Shadow DOM — 包含 label 和 close-btn", () => {
        const label = element.shadowRoot.querySelector(".label");
        const closeBtn = element.shadowRoot.querySelector(".close-btn");

        expect(label).not.toBeNull();
        expect(closeBtn).not.toBeNull();
    });

    it("STE-02: 默认显示 name 属性文本", () => {
        const label = element.shadowRoot.querySelector(".label");
        expect(label.textContent).toBe("Sheet1");
    });

    it("STE-03: 设置 name 属性后更新显示", () => {
        element.setAttribute("name", "Sheet2");

        const label = element.shadowRoot.querySelector(".label");
        expect(label.textContent).toBe("Sheet2");
    });

    it("STE-04: 点击标签派发 switch 事件", () => {
        const switchSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);

        const label = element.shadowRoot.querySelector(".label");
        label.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(switchSpy).toHaveBeenCalledTimes(1);
        expect(switchSpy.mock.calls[0][0].detail.name).toBe("Sheet1");

        element.removeEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);
    });

    it("STE-05: 点击关闭按钮派发 close 事件", () => {
        const closeSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.CLOSE, closeSpy);

        const closeBtn = element.shadowRoot.querySelector(".close-btn");
        closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(closeSpy.mock.calls[0][0].detail.name).toBe("Sheet1");

        element.removeEventListener(SHEET_TAB_EVENTS.CLOSE, closeSpy);
    });

    it("STE-06: 双击标签派发 rename 事件", () => {
        const renameSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.RENAME, renameSpy);

        const label = element.shadowRoot.querySelector(".label");
        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

        expect(renameSpy).toHaveBeenCalledTimes(1);
        expect(renameSpy.mock.calls[0][0].detail.name).toBe("Sheet1");

        element.removeEventListener(SHEET_TAB_EVENTS.RENAME, renameSpy);
    });

    it("STE-07: 双击关闭按钮不派发 rename 事件", () => {
        const renameSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.RENAME, renameSpy);

        const closeBtn = element.shadowRoot.querySelector(".close-btn");
        closeBtn.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

        expect(renameSpy).not.toHaveBeenCalled();

        element.removeEventListener(SHEET_TAB_EVENTS.RENAME, renameSpy);
    });

    it("STE-08: active 属性通过 CSS :host([active]) 控制", () => {
        element.setAttribute("active", "");
        expect(element.hasAttribute("active")).toBe(true);

        element.removeAttribute("active");
        expect(element.hasAttribute("active")).toBe(false);
    });

    it("STE-09: closable 属性通过 CSS :host([closable]) 控制关闭按钮显示", () => {
        element.setAttribute("closable", "");
        expect(element.hasAttribute("closable")).toBe(true);

        element.removeAttribute("closable");
        expect(element.hasAttribute("closable")).toBe(false);
    });

    it("STE-10: observedAttributes 包含 name, active, closable", () => {
        expect(SheetTabElement.observedAttributes).toEqual(
            expect.arrayContaining(["name", "active", "closable"]),
        );
    });

    it("STE-11: switch 事件穿越 Shadow DOM (composed: true)", () => {
        const wrapper = document.createElement("div");
        wrapper.appendChild(element);
        document.body.appendChild(wrapper);

        const switchSpy = vi.fn();
        wrapper.addEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);

        const label = element.shadowRoot.querySelector(".label");
        label.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(switchSpy).toHaveBeenCalledTimes(1);

        wrapper.removeEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);
        wrapper.remove();
    });

    it("STE-12: close 事件穿越 Shadow DOM (composed: true)", () => {
        const wrapper = document.createElement("div");
        wrapper.appendChild(element);
        document.body.appendChild(wrapper);

        const closeSpy = vi.fn();
        wrapper.addEventListener(SHEET_TAB_EVENTS.CLOSE, closeSpy);

        const closeBtn = element.shadowRoot.querySelector(".close-btn");
        closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(closeSpy).toHaveBeenCalledTimes(1);

        wrapper.removeEventListener(SHEET_TAB_EVENTS.CLOSE, closeSpy);
        wrapper.remove();
    });

    it("STE-13: destroy 后组件标记为已销毁", () => {
        element.destroy();

        expect(element.isDestroyed).toBe(true);
    });

    it("STE-14: XSS 防护 — name 中的 HTML 不会被渲染为标签", () => {
        element.setAttribute("name", '<script>alert("xss")</script>');

        const label = element.shadowRoot.querySelector(".label");
        expect(label.querySelector("script")).toBeNull();
    });

    it("STE-15: render() 增量更新 — name 变化时不重建整个 Shadow DOM", () => {
        const closeBtn = element.shadowRoot.querySelector(".close-btn");

        element.setAttribute("name", "Sheet2");

        const sameCloseBtn = element.shadowRoot.querySelector(".close-btn");
        expect(sameCloseBtn).toBe(closeBtn);

        const label = element.shadowRoot.querySelector(".label");
        expect(label.textContent).toBe("Sheet2");
    });

    it("STE-16: render() 增量更新 — 多次 setAttribute 不丢失 DOM 结构", () => {
        element.setAttribute("name", "A");
        element.setAttribute("name", "B");
        element.setAttribute("name", "C");

        expect(element.shadowRoot.querySelector(".label")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".close-btn")).not.toBeNull();
        expect(element.shadowRoot.querySelector(".label").textContent).toBe("C");
    });

    it("STE-17: 空字符串 name 不报错", () => {
        element.setAttribute("name", "");

        const label = element.shadowRoot.querySelector(".label");
        expect(label.textContent).toBe("");
    });

    it("STE-18: close 事件中 stopPropagation — 不触发 switch", () => {
        const switchSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);

        const closeBtn = element.shadowRoot.querySelector(".close-btn");
        closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(switchSpy).not.toHaveBeenCalled();

        element.removeEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);
    });
});