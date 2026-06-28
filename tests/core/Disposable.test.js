import { describe, it, expect, vi } from "vitest";
import { Disposable } from "@/core/Disposable.js";

describe("Disposable 基类", () => {
    it("D-01: destroy 幂等 — 连续调用两次不抛异常，onDestroy 仅调用一次", () => {
        const d = new Disposable();
        const spy = vi.spyOn(d, "onDestroy");
        d.destroy();
        d.destroy();
        expect(d.isDisposed).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it("D-02: trackEvent 自动清理 — destroy 时调用 removeEventListener", () => {
        const d = new Disposable();
        const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
        const handler = vi.fn();
        d.trackEvent(target, "click", handler);
        expect(target.addEventListener).toHaveBeenCalledWith("click", handler, undefined);
        d.destroy();
        expect(target.removeEventListener).toHaveBeenCalledWith("click", handler, undefined);
    });

    it("D-03: trackChild 级联销毁 — 父级 destroy 时子级均被销毁", () => {
        const parent = new Disposable();
        const childA = new Disposable();
        const childB = new Disposable();
        parent.trackChild(childA);
        parent.trackChild(childB);
        parent.destroy();
        expect(childA.isDisposed).toBe(true);
        expect(childB.isDisposed).toBe(true);
    });

    it("D-04: 多层级联销毁 — A → B → C 三层", () => {
        const order = [];
        const a = new Disposable();
        const b = new Disposable();
        const c = new Disposable();
        vi.spyOn(a, "onDestroy").mockImplementation(() => order.push("A"));
        vi.spyOn(b, "onDestroy").mockImplementation(() => order.push("B"));
        vi.spyOn(c, "onDestroy").mockImplementation(() => order.push("C"));
        a.trackChild(b);
        b.trackChild(c);
        a.destroy();
        expect(a.isDisposed).toBe(true);
        expect(b.isDisposed).toBe(true);
        expect(c.isDisposed).toBe(true);
        expect(order).toEqual(["A", "B", "C"]);
    });

    it("D-05: onDestroy 子类钩子 — 在事件清理和子对象销毁之前被调用", () => {
        const calls = [];
        class Child extends Disposable {
            onDestroy() {
                calls.push("onDestroy");
            }
        }
        const d = new Child();
        const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
        d.trackEvent(target, "click", () => calls.push("event"));
        const child = new Disposable();
        vi.spyOn(child, "onDestroy").mockImplementation(() => calls.push("child-destroy"));
        d.trackChild(child);
        d.destroy();
        // onDestroy 应在 removeEventListener 和 child.destroy 之前调用
        expect(calls.indexOf("onDestroy")).toBeLessThan(calls.indexOf("child-destroy"));
    });

    it("D-06: 已销毁实例 trackEvent/trackChild 不抛异常", () => {
        const d = new Disposable();
        d.destroy();
        expect(() => d.trackEvent({ addEventListener: vi.fn() }, "x", () => {})).not.toThrow();
        expect(() => d.trackChild(new Disposable())).not.toThrow();
    });

    it("trackEvent 支持 options 参数", () => {
        const d = new Disposable();
        const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
        const handler = vi.fn();
        const options = { capture: true };
        d.trackEvent(target, "scroll", handler, options);
        expect(target.addEventListener).toHaveBeenCalledWith("scroll", handler, options);
        d.destroy();
        expect(target.removeEventListener).toHaveBeenCalledWith("scroll", handler, options);
    });
});
