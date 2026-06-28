import { describe, it, expect, vi } from "vitest";
import { DOMComponent } from "@/core/DOMComponent.js";

describe("DOMComponent 基类", () => {
    it("DC-01: createElement 跟踪 — 创建 div 并 append 到 parent", () => {
        const comp = new DOMComponent();
        const parent = document.createElement("div");
        const el = comp.createElement("div", { className: "test" }, parent);
        expect(el.tagName).toBe("DIV");
        expect(el.className).toBe("test");
        expect(parent.children.length).toBe(1);
        expect(parent.children[0]).toBe(el);
    });

    it("DC-02: destroy 移除跟踪的 DOM — 3 个元素均从 DOM 树移除", () => {
        const comp = new DOMComponent();
        const parent = document.createElement("div");
        comp.createElement("div", {}, parent);
        comp.createElement("span", {}, parent);
        comp.createElement("p", {}, parent);
        expect(parent.children.length).toBe(3);
        comp.destroy();
        expect(parent.children.length).toBe(0);
    });

    it("DC-03: injectStyle 注入与去重 — 两次调用只创建一个 <style>", () => {
        const comp = new DOMComponent();
        comp.injectStyle("test-css-dc03", ".a{color:red}");
        comp.injectStyle("test-css-dc03", ".a{color:blue}");
        const styles = document.querySelectorAll("#test-css-dc03");
        expect(styles.length).toBe(1);
        // 内容应该是第一次注入的
        expect(styles[0].textContent).toBe(".a{color:red}");
        comp.destroy();
    });

    it("DC-04: injectStyle destroy 清理 — <style> 从 head 移除", () => {
        const comp = new DOMComponent();
        comp.injectStyle("test-css-dc04", ".b{color:green}");
        expect(document.querySelector("#test-css-dc04")).not.toBeNull();
        comp.destroy();
        expect(document.querySelector("#test-css-dc04")).toBeNull();
    });

    it("DC-05: injectInstanceStyle 实例隔离 — 两个实例各自独立的 <style>", () => {
        const a = new DOMComponent();
        const b = new DOMComponent();
        a.injectInstanceStyle("ns", ".x{color:red}");
        b.injectInstanceStyle("ns", ".x{color:blue}");
        const idA = `ns-${a.instanceId}`;
        const idB = `ns-${b.instanceId}`;
        expect(idA).not.toBe(idB);
        expect(document.querySelector(`#${idA}`)).not.toBeNull();
        expect(document.querySelector(`#${idB}`)).not.toBeNull();
        a.destroy();
        b.destroy();
    });

    it("DC-06: destroy 同时清理 DOM 和 style", () => {
        const comp = new DOMComponent();
        const parent = document.createElement("div");
        comp.createElement("div", {}, parent);
        comp.injectStyle("test-css-dc06", ".c{}");
        comp.destroy();
        expect(parent.children.length).toBe(0);
        expect(document.querySelector("#test-css-dc06")).toBeNull();
    });

    it("DC-07: instanceId 唯一性 — 3 个实例互不相同", () => {
        const a = new DOMComponent();
        const b = new DOMComponent();
        const c = new DOMComponent();
        const ids = new Set([a.instanceId, b.instanceId, c.instanceId]);
        expect(ids.size).toBe(3);
    });

    it("createElement 支持 textContent 属性", () => {
        const comp = new DOMComponent();
        const parent = document.createElement("div");
        const el = comp.createElement("span", { textContent: "hello" }, parent);
        expect(el.textContent).toBe("hello");
        comp.destroy();
    });

    it("createElement 支持 style 对象属性", () => {
        const comp = new DOMComponent();
        const parent = document.createElement("div");
        const el = comp.createElement("div", { style: { color: "red", fontSize: "14px" } }, parent);
        expect(el.style.color).toBe("red");
        expect(el.style.fontSize).toBe("14px");
        comp.destroy();
    });

    it("createElement 无 parent 时不 append", () => {
        const comp = new DOMComponent();
        const el = comp.createElement("div");
        expect(el.tagName).toBe("DIV");
        expect(el.parentElement).toBeNull();
        comp.destroy();
    });

    it("继承 Disposable 的 trackEvent 能力", () => {
        const comp = new DOMComponent();
        const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
        const handler = vi.fn();
        comp.trackEvent(target, "click", handler);
        expect(target.addEventListener).toHaveBeenCalled();
        comp.destroy();
        expect(target.removeEventListener).toHaveBeenCalled();
    });

    it("继承 Disposable 的 trackChild 能力", () => {
        const parent = new DOMComponent();
        const child = new DOMComponent();
        parent.trackChild(child);
        parent.destroy();
        expect(child.isDisposed).toBe(true);
    });
});
