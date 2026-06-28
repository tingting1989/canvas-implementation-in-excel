import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RenderEngine } from "@/render/RenderEngine.js";
import { ScrollManager } from "@/ui/ScrollManager.js";
import { SheetTabBar } from "@/ui/SheetTabBar.js";
import { EVENT_NAMES } from "@/constants/eventNames.js";

describe("RenderEngine 销毁（P0 修复验证）", () => {
    let container;
    let canvas;

    beforeEach(() => {
        container = document.createElement("div");
        container.style.width = "800px";
        container.style.height = "600px";
        document.body.appendChild(container);

        canvas = document.createElement("canvas");
        canvas.id = "test-canvas-" + Math.random().toString(36).substr(2, 9);
        container.appendChild(canvas);
    });

    afterEach(() => {
        document.body.removeChild(container);
    });

    it("RE-01: wrap div 移除 — destroy 后 wrap 从 outerWrap 中移除", () => {
        const re = new RenderEngine(canvas.id);
        expect(re.wrap.parentElement).toBe(container);
        
        re.destroy();
        expect(container.contains(re.wrap)).toBe(false);
    });

    it("RE-02: sheetTabBar 级联销毁 — destroy 时调用 sheetTabBar.destroy()", () => {
        const re = new RenderEngine(canvas.id);
        const spy = vi.spyOn(re.sheetTabBar, "destroy");
        
        re.destroy();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(re.sheetTabBar.isDisposed).toBe(true);
    });

    it("RE-03: scrollMgr 级联销毁 — destroy 时调用 scrollMgr.destroy()", () => {
        const re = new RenderEngine(canvas.id);
        const spy = vi.spyOn(re.scrollMgr, "destroy");
        
        re.destroy();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(re.scrollMgr.isDisposed).toBe(true);
    });

    it("RE-04: resize 事件移除 — destroy 时 window resize 监听被移除", () => {
        const removeSpy = vi.spyOn(window, "removeEventListener");
        const re = new RenderEngine(canvas.id);
        
        re.destroy();
        
        const resizeCalls = removeSpy.mock.calls.filter(call => call[0] === EVENT_NAMES.RESIZE);
        expect(resizeCalls.length).toBeGreaterThan(0);
        removeSpy.mockRestore();
    });

    it("RE-05: rAF 取消 — destroy 时 pending rAF 被取消", () => {
        const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
        const re = new RenderEngine(canvas.id);
        
        // 触发一次 requestRender 来设置 rafId
        re.requestRender();
        
        re.destroy();
        
        expect(cancelSpy).toHaveBeenCalled();
        cancelSpy.mockRestore();
    });

    it("RE-06: 完整销毁无残留 — DOM 全部移除", () => {
        const re = new RenderEngine(canvas.id);
        const wrap = re.wrap;
        
        // 验证初始状态
        expect(wrap.children.length).toBeGreaterThan(0); // canvas + scrollbar + tabbar
        
        re.destroy();
        
        // 验证 wrap 已移除
        expect(container.contains(wrap)).toBe(false);
        // canvas 应该回到 container（因为 RenderEngine 只是移除 wrap，不移除 canvas）
        expect(container.contains(canvas)).toBe(true);
    });
});