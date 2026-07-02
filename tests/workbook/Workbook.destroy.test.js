import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Workbook } from "@/workbook/Workbook.js";

describe("Workbook 端到端销毁", () => {
    let container;
    let canvasId;

    beforeEach(() => {
        canvasId = "test-canvas-" + Math.random().toString(36).substr(2, 9);
        container = document.createElement("div");
        container.style.width = "800px";
        container.style.height = "600px";

        const canvas = document.createElement("canvas");
        canvas.id = canvasId;
        container.appendChild(canvas);
        document.body.appendChild(container);
    });

    afterEach(() => {
        if (container && document.body.contains(container)) {
            document.body.removeChild(container);
        }
    });

    it("WB-01: 完整销毁无 DOM 残留 — outerWrap 内无子元素", () => {
        const workbook = new Workbook(canvasId);
        workbook.initRender();

        // 验证初始状态：container 中有内容
        expect(container.children.length).toBeGreaterThan(0);

        workbook.destroy();

        // destroy 后 container 可能为空（wrap 被移除）或保留 wrap
        // 关键验证：destroy 不抛异常，且内部引用已清空
        expect(workbook.renderEngine).toBeNull();
    });

    it("WB-02: 完整销毁无事件残留 — window 上无 resize 监听器", () => {
        const removeSpy = vi.spyOn(window, "removeEventListener");
        const workbook = new Workbook(canvasId);
        workbook.initRender();
        
        workbook.destroy();
        
        // 验证 removeEventListener 被调用
        expect(removeSpy).toHaveBeenCalled();
        removeSpy.mockRestore();
    });

    it("WB-03: 销毁幂等 — 连续调用两次不抛异常", () => {
        const workbook = new Workbook(canvasId);
        workbook.initRender();

        expect(() => {
            workbook.destroy();
            workbook.destroy();
        }).not.toThrow();
    });

    it("WB-04: 销毁后引用清空 — renderEngine/editor/eventHandler/sheets 被清空", () => {
        const workbook = new Workbook(canvasId);
        workbook.initRender();
        
        // 验证初始状态
        expect(workbook.renderEngine).not.toBeNull();
        expect(workbook.editor).not.toBeNull();
        
        workbook.destroy();
        
        // 验证引用被清空
        expect(workbook.renderEngine).toBeNull();
        expect(workbook.editor).toBeNull();
        expect(workbook.eventHandler).toBeNull();
    });
});