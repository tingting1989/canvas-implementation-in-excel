import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SheetTabBar } from "@/ui/SheetTabBar.js";
import { EVENT_NAMES } from "@/constants/eventNames.js";

describe("SheetTabBar 销毁", () => {
    let wrap;

    beforeEach(() => {
        wrap = document.createElement("div");
        wrap.style.width = "800px";
        wrap.style.height = "600px";
        document.body.appendChild(wrap);
    });

    afterEach(() => {
        document.body.removeChild(wrap);
    });

    it("ST-01: tab bar DOM 移除 — bar 元素从 wrap 中移除", () => {
        const stb = new SheetTabBar(wrap, null);
        
        // 验证初始状态
        expect(wrap.querySelectorAll(".cs-sheet-tab-bar").length).toBe(1);
        
        stb.destroy();
        
        // 验证 DOM 已移除
        expect(wrap.querySelectorAll(".cs-sheet-tab-bar").length).toBe(0);
    });

    it("ST-02: 事件监听器移除 — click 监听被移除", () => {
        const stb = new SheetTabBar(wrap, null);
        const tabsContainer = wrap.querySelector(".cs-sheet-tabs");
        
        const removeSpy = vi.spyOn(tabsContainer, "removeEventListener");
        
        stb.destroy();
        
        const clickCalls = removeSpy.mock.calls.filter(call => call[0] === EVENT_NAMES.CLICK);
        expect(clickCalls.length).toBeGreaterThan(0);
        removeSpy.mockRestore();
    });

    it("ST-03: wheel 事件移除 — bar 上的 wheel 监听被移除", () => {
        const stb = new SheetTabBar(wrap, null);
        const bar = wrap.querySelector(".cs-sheet-tab-bar");
        
        const removeSpy = vi.spyOn(bar, "removeEventListener");
        
        stb.destroy();
        
        const wheelCalls = removeSpy.mock.calls.filter(call => call[0] === EVENT_NAMES.WHEEL);
        expect(wheelCalls.length).toBeGreaterThan(0);
        removeSpy.mockRestore();
    });

    it("ST-04: 多实例样式隔离 — 销毁一个不影响另一个", () => {
        const wrapB = document.createElement("div");
        wrapB.style.width = "800px";
        wrapB.style.height = "600px";
        document.body.appendChild(wrapB);
        
        const stbA = new SheetTabBar(wrap, null);
        const stbB = new SheetTabBar(wrapB, null);
        
        // 验证两个实例都有 tab bar
        expect(wrap.querySelectorAll(".cs-sheet-tab-bar").length).toBe(1);
        expect(wrapB.querySelectorAll(".cs-sheet-tab-bar").length).toBe(1);
        
        // 销毁 A
        stbA.destroy();
        
        // 验证 A 的 tab bar 已移除，B 的仍存在
        expect(wrap.querySelectorAll(".cs-sheet-tab-bar").length).toBe(0);
        expect(wrapB.querySelectorAll(".cs-sheet-tab-bar").length).toBe(1);
        
        // 清理
        stbB.destroy();
        document.body.removeChild(wrapB);
    });
});