import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContextMenuStrategy } from "@/editor/strategies/ContextMenuStrategy.js";

describe("ContextMenuStrategy 销毁", () => {
    let mockHandler;

    beforeEach(() => {
        mockHandler = {
            sheet: {
                rowColManager: {
                    rowCount: 100,
                    colCount: 26,
                },
                selection: {
                    getRange: vi.fn().mockReturnValue({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 }),
                    contains: vi.fn().mockReturnValue(true),
                    setActive: vi.fn(),
                    setRange: vi.fn(),
                },
                getMerge: vi.fn().mockReturnValue(null),
                readOnly: false,
            },
            viewport: {
                hitTest: vi.fn().mockReturnValue(null),
            },
            render: vi.fn(),
        };
    });

    afterEach(() => {
        // 清理可能残留的菜单元素
        const menuEl = document.querySelector(".ctx-menu");
        if (menuEl) {
            menuEl.remove();
        }
    });

    it("CM-01: 菜单 DOM 移除 — destroy 后 menuEl 从 document.body 移除", () => {
        const strategy = new ContextMenuStrategy(mockHandler);
        strategy.init();
        
        // 验证菜单已创建
        expect(document.querySelectorAll(".ctx-menu").length).toBe(1);
        
        strategy.destroy();
        
        // 验证菜单已移除
        expect(document.querySelectorAll(".ctx-menu").length).toBe(0);
    });

    it("CM-02: destroy 幂等 — 连续调用两次不抛异常", () => {
        const strategy = new ContextMenuStrategy(mockHandler);
        strategy.init();
        
        expect(() => {
            strategy.destroy();
            strategy.destroy();
        }).not.toThrow();
    });

    it("CM-03: 未初始化时 destroy 安全", () => {
        const strategy = new ContextMenuStrategy(mockHandler);
        // 没有调用 init()
        
        expect(() => {
            strategy.destroy();
        }).not.toThrow();
    });
});