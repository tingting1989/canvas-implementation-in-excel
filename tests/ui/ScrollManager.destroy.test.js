import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ScrollManager } from "@/ui/ScrollManager.js";
import { EVENT_NAMES } from "@/constants/eventNames.js";

describe("ScrollManager 销毁", () => {
    let wrap;
    let canvas;

    beforeEach(() => {
        wrap = document.createElement("div");
        wrap.style.width = "800px";
        wrap.style.height = "600px";
        document.body.appendChild(wrap);

        canvas = document.createElement("canvas");
        wrap.appendChild(canvas);
    });

    afterEach(() => {
        document.body.removeChild(wrap);
    });

    it("SM-01: 滚动条 DOM 移除 — hBar/vBar/corner 从 wrap 中移除", () => {
        const sm = new ScrollManager(wrap, canvas);
        
        // 验证初始状态：wrap 包含滚动条元素
        expect(wrap.querySelectorAll(".cs-scrollbar-h").length).toBe(1);
        expect(wrap.querySelectorAll(".cs-scrollbar-v").length).toBe(1);
        expect(wrap.querySelectorAll(".cs-scrollbar-corner").length).toBe(1);
        
        sm.destroy();
        
        // 验证滚动条 DOM 已移除
        expect(wrap.querySelectorAll(".cs-scrollbar-h").length).toBe(0);
        expect(wrap.querySelectorAll(".cs-scrollbar-v").length).toBe(0);
        expect(wrap.querySelectorAll(".cs-scrollbar-corner").length).toBe(0);
    });

    it("SM-02: thumb 事件移除 — mousedown 监听被移除", () => {
        const sm = new ScrollManager(wrap, canvas);
        const hThumb = wrap.querySelector(".cs-scrollbar-h-thumb");
        
        // 创建一个 mock 来验证 removeEventListener 被调用
        const removeSpy = vi.spyOn(hThumb, "removeEventListener");
        
        sm.destroy();
        
        const mousedownCalls = removeSpy.mock.calls.filter(call => call[0] === EVENT_NAMES.MOUSEDOWN);
        expect(mousedownCalls.length).toBeGreaterThan(0);
        removeSpy.mockRestore();
    });

    it("SM-03: wheel 事件移除 — wrap 上的 wheel 监听被移除", () => {
        const sm = new ScrollManager(wrap, canvas);
        sm.bind(); // 绑定 wheel 事件
        
        const removeSpy = vi.spyOn(wrap, "removeEventListener");
        
        sm.destroy();
        
        const wheelCalls = removeSpy.mock.calls.filter(call => call[0] === EVENT_NAMES.WHEEL);
        expect(wheelCalls.length).toBeGreaterThan(0);
        removeSpy.mockRestore();
    });

    it("SM-04: 多实例样式隔离 — 销毁一个不影响另一个", () => {
        const wrapB = document.createElement("div");
        wrapB.style.width = "800px";
        wrapB.style.height = "600px";
        document.body.appendChild(wrapB);
        
        const canvasB = document.createElement("canvas");
        wrapB.appendChild(canvasB);
        
        const smA = new ScrollManager(wrap, canvas);
        const smB = new ScrollManager(wrapB, canvasB);
        
        // 验证两个实例都有滚动条
        expect(wrap.querySelectorAll(".cs-scrollbar-h").length).toBe(1);
        expect(wrapB.querySelectorAll(".cs-scrollbar-h").length).toBe(1);
        
        // 销毁 A
        smA.destroy();
        
        // 验证 A 的滚动条已移除，B 的滚动条仍存在
        expect(wrap.querySelectorAll(".cs-scrollbar-h").length).toBe(0);
        expect(wrapB.querySelectorAll(".cs-scrollbar-h").length).toBe(1);
        
        // 清理
        smB.destroy();
        document.body.removeChild(wrapB);
    });

    it("SM-05: destroy 幂等 — 连续调用两次不抛异常", () => {
        const sm = new ScrollManager(wrap, canvas);
        
        expect(() => {
            sm.destroy();
            sm.destroy();
        }).not.toThrow();
        
        expect(sm.isDisposed).toBe(true);
    });
});