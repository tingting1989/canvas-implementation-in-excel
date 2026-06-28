import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FormulaBar } from "@/ui/FormulaBar.js";
import { EVENT_NAMES } from "@/constants/eventNames.js";

describe("FormulaBar 销毁", () => {
    let container;
    let mockWorkbook;

    beforeEach(() => {
        container = document.createElement("div");
        container.style.width = "800px";
        container.style.height = "60px";
        document.body.appendChild(container);

        // 创建 mock workbook
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
        document.body.removeChild(container);
    });

    it("FB-01: 公式栏 DOM 移除 — bar 元素从 container 中移除", () => {
        const fb = new FormulaBar(mockWorkbook, container);
        
        // 验证初始状态
        expect(container.querySelectorAll(".cs-formula-bar").length).toBe(1);
        
        fb.destroy();
        
        // 验证 DOM 已移除
        expect(container.querySelectorAll(".cs-formula-bar").length).toBe(0);
    });

    it("FB-02: 事件监听器移除 — input 上的 keydown 和 focus 监听器被移除", () => {
        const fb = new FormulaBar(mockWorkbook, container);
        const inputEl = container.querySelector(".cs-formula-input");
        
        const removeSpy = vi.spyOn(inputEl, "removeEventListener");
        
        fb.destroy();
        
        // 验证事件监听器被移除
        const keydownCalls = removeSpy.mock.calls.filter(call => call[0] === EVENT_NAMES.KEYDOWN);
        const focusCalls = removeSpy.mock.calls.filter(call => call[0] === EVENT_NAMES.FOCUS);
        
        expect(keydownCalls.length).toBeGreaterThan(0);
        expect(focusCalls.length).toBeGreaterThan(0);
        
        removeSpy.mockRestore();
    });
});