import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebComponent } from "@/core/WebComponent.js";

class TestElement extends WebComponent {
    static get observedAttributes() {
        return ["label"];
    }

    renderCalls = [];
    connectCalls = 0;
    disconnectCalls = 0;

    render(changedAttr) {
        this.renderCalls.push(changedAttr);
        if (!this.shadowRoot.querySelector(".content")) {
            this.shadowRoot.innerHTML = `<span class="content">${this.getAttribute("label") || ""}</span>`;
        } else {
            this.shadowRoot.querySelector(".content").textContent = this.getAttribute("label") || "";
        }
    }

    onConnect(disposable) {
        this.connectCalls++;
    }

    onDisconnect() {
        this.disconnectCalls++;
    }
}

customElements.define("test-wc", TestElement);

describe("WebComponent 基类", () => {
    let element;

    beforeEach(() => {
        element = document.createElement("test-wc");
        document.body.appendChild(element);
    });

    afterEach(() => {
        element.destroy();
        element.remove();
    });

    describe("生命周期", () => {
        it("WC-01: connectedCallback 触发 render 和 onConnect", () => {
            expect(element.renderCalls.length).toBeGreaterThanOrEqual(1);
            expect(element.connectCalls).toBe(1);
        });

        it("WC-02: disconnectedCallback 不触发 onDisconnect（未标记销毁）", () => {
            element.remove();
            expect(element.disconnectCalls).toBe(0);
        });

        it("WC-03: destroy → onDisconnect 被调用", () => {
            element.destroy();
            expect(element.disconnectCalls).toBe(1);
        });

        it("WC-04: destroy 幂等 — onDisconnect 只调用一次", () => {
            element.destroy();
            element.destroy();
            expect(element.disconnectCalls).toBe(1);
        });

        it("WC-05: isDestroyed 标记", () => {
            expect(element.isDestroyed).toBe(false);
            element.destroy();
            expect(element.isDestroyed).toBe(true);
        });

        it("WC-06: isComponentConnected 标记", () => {
            expect(element.isComponentConnected).toBe(true);
            element.remove();
            expect(element.isComponentConnected).toBe(false);
        });
    });

    describe("attributeChangedCallback", () => {
        it("WC-07: setAttribute 触发 render 并传入属性名", () => {
            element.renderCalls.length = 0;
            element.setAttribute("label", "hello");
            expect(element.renderCalls).toContain("label");
        });

        it("WC-08: 相同值不触发 render", () => {
            element.setAttribute("label", "same");
            element.renderCalls.length = 0;
            element.setAttribute("label", "same");
            expect(element.renderCalls).not.toContain("label");
        });

        it("WC-09: 未观察的属性不触发 render", () => {
            element.renderCalls.length = 0;
            element.setAttribute("unknown", "val");
            expect(element.renderCalls).not.toContain("unknown");
        });
    });

    describe("emit 方法", () => {
        it("WC-10: emit 默认 bubbles: true", () => {
            const spy = vi.fn();
            element.parentNode.addEventListener("my-event", spy);
            element.emit("my-event", { x: 1 });
            expect(spy).toHaveBeenCalledTimes(1);
            element.parentNode.removeEventListener("my-event", spy);
        });

        it("WC-11: emit 默认 composed: true — 穿透 Shadow DOM", () => {
            const spy = vi.fn();
            document.addEventListener("composed-event", spy);
            element.emit("composed-event", { y: 2 });
            expect(spy).toHaveBeenCalledTimes(1);
            document.removeEventListener("composed-event", spy);
        });

        it("WC-12: emit 传递 detail", () => {
            const spy = vi.fn();
            element.addEventListener("detail-test", spy);
            element.emit("detail-test", { foo: "bar", num: 42 });
            expect(spy).toHaveBeenCalledWith(expect.objectContaining({
                detail: { foo: "bar", num: 42 },
            }));
        });

        it("WC-13: emit 无 detail 时默认为空对象", () => {
            const spy = vi.fn();
            element.addEventListener("no-detail", spy);
            element.emit("no-detail");
            expect(spy).toHaveBeenCalledWith(expect.objectContaining({
                detail: {},
            }));
        });

        it("WC-14: emit options 覆盖 — bubbles: false", () => {
            const parentSpy = vi.fn();
            element.parentNode.addEventListener("no-bubble", parentSpy);

            element.emit("no-bubble", {}, { bubbles: false });

            expect(parentSpy).not.toHaveBeenCalled();
            element.parentNode.removeEventListener("no-bubble", parentSpy);
        });

        it("WC-15: emit options 覆盖 — composed: false", () => {
            const spy = vi.fn();
            element.addEventListener("no-compose", spy);

            element.emit("no-compose", {}, { composed: false });

            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.mock.calls[0][0].composed).toBe(false);
        });

        it("WC-16: emit options — cancelable: true", () => {
            const spy = vi.fn();
            element.addEventListener("cancelable-event", spy);
            element.emit("cancelable-event", {}, { cancelable: true });
            expect(spy).toHaveBeenCalledWith(expect.objectContaining({
                cancelable: true,
            }));
        });

        it("WC-17: emit 默认 cancelable: false", () => {
            const spy = vi.fn();
            element.addEventListener("not-cancelable", spy);
            element.emit("not-cancelable");
            expect(spy).toHaveBeenCalledWith(expect.objectContaining({
                cancelable: false,
            }));
        });

        it("WC-18: emit detail 不被 options 覆盖", () => {
            const spy = vi.fn();
            element.addEventListener("detail-safe", spy);
            element.emit("detail-safe", { key: "val" }, { bubbles: false });
            expect(spy).toHaveBeenCalledWith(expect.objectContaining({
                detail: { key: "val" },
            }));
        });

        it("WC-19: emit 多次派发不同事件", () => {
            const spyA = vi.fn();
            const spyB = vi.fn();
            element.addEventListener("event-a", spyA);
            element.addEventListener("event-b", spyB);

            element.emit("event-a", { id: 1 });
            element.emit("event-b", { id: 2 });

            expect(spyA).toHaveBeenCalledTimes(1);
            expect(spyB).toHaveBeenCalledTimes(1);
            expect(spyA.mock.calls[0][0].detail).toEqual({ id: 1 });
            expect(spyB.mock.calls[0][0].detail).toEqual({ id: 2 });
        });
    });

    describe("escapeHtml", () => {
        it("WC-20: 转义 <script> 标签", () => {
            expect(element.escapeHtml('<script>alert("xss")</script>')).not.toContain("<script>");
        });

        it("WC-21: 转义 HTML 实体", () => {
            expect(element.escapeHtml("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
        });

        it("WC-22: 普通文本不转义", () => {
            expect(element.escapeHtml("hello world")).toBe("hello world");
        });
    });
});