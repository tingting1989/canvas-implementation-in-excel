import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Workbook } from "@/workbook/Workbook.js";

describe("多实例隔离", () => {
    let containerA;
    let containerB;

    beforeEach(() => {
        containerA = document.createElement("div");
        containerA.id = "test-container-A-" + Math.random().toString(36).substr(2, 9);
        containerA.style.width = "600px";
        containerA.style.height = "400px";
        containerA.style.float = "left";
        document.body.appendChild(containerA);

        containerB = document.createElement("div");
        containerB.id = "test-container-B-" + Math.random().toString(36).substr(2, 9);
        containerB.style.width = "600px";
        containerB.style.height = "400px";
        containerB.style.float = "left";
        containerB.style.marginLeft = "20px";
        document.body.appendChild(containerB);
    });

    afterEach(() => {
        document.body.removeChild(containerA);
        document.body.removeChild(containerB);
    });

    it("MI-01: 两个 Workbook 独立初始化 — 各自创建独立的 DOM", () => {
        const workbookA = new Workbook(containerA);
        const workbookB = new Workbook(containerB);
        
        workbookA.initRender();
        workbookB.initRender();
        
        // 验证两个 Workbook 都有 wrap 元素
        expect(containerA.querySelectorAll(".cs-canvas-wrap").length).toBe(1);
        expect(containerB.querySelectorAll(".cs-canvas-wrap").length).toBe(1);
        
        // 验证滚动条
        expect(containerA.querySelectorAll(".cs-scrollbar-h").length).toBe(1);
        expect(containerB.querySelectorAll(".cs-scrollbar-h").length).toBe(1);
        
        // 验证 tab bar
        expect(containerA.querySelectorAll(".cs-sheet-tab-bar").length).toBe(1);
        expect(containerB.querySelectorAll(".cs-sheet-tab-bar").length).toBe(1);
        
        workbookA.destroy();
        workbookB.destroy();
    });

    it("MI-02: 销毁一个不影响另一个 — workbookA destroy 后 workbookB 正常工作", () => {
        const workbookA = new Workbook(containerA);
        const workbookB = new Workbook(containerB);
        
        workbookA.initRender();
        workbookB.initRender();
        
        // 销毁 A
        workbookA.destroy();
        
        // 验证 A 的 DOM 已移除
        expect(containerA.querySelectorAll(".cs-canvas-wrap").length).toBe(0);
        
        // 验证 B 仍然正常
        expect(containerB.querySelectorAll(".cs-canvas-wrap").length).toBe(1);
        expect(containerB.querySelectorAll(".cs-scrollbar-h").length).toBe(1);
        expect(containerB.querySelectorAll(".cs-sheet-tab-bar").length).toBe(1);
        
        // B 应该还能正常渲染
        expect(() => {
            workbookB.render();
        }).not.toThrow();
        
        workbookB.destroy();
    });

    it("MI-03: 编辑器无 ID 冲突 — 两个编辑器同时显示", () => {
        const workbookA = new Workbook(containerA);
        const workbookB = new Workbook(containerB);
        
        workbookA.initRender();
        workbookB.initRender();
        
        // 创建编辑器
        const editorA = workbookA.editor.getEditor("text");
        const editorB = workbookB.editor.getEditor("text");
        
        editorA.createEditor();
        editorB.createEditor();
        
        // 获取所有编辑器元素
        const allEditors = document.querySelectorAll(".cs-cell-editor");
        
        // 应该有两个编辑器
        expect(allEditors.length).toBe(2);
        
        // 验证两个编辑器没有 ID 属性（避免冲突）
        for (const editor of allEditors) {
            expect(editor.hasAttribute("id")).toBe(false);
        }
        
        workbookA.destroy();
        workbookB.destroy();
    });

    it("MI-04: 连续创建销毁不泄漏 — 循环创建销毁后无累积 DOM", () => {
        const tempContainer = document.createElement("div");
        tempContainer.style.width = "400px";
        tempContainer.style.height = "300px";
        document.body.appendChild(tempContainer);
        
        const initialStyleCount = document.querySelectorAll("style").length;
        
        // 循环 5 次创建销毁
        for (let i = 0; i < 5; i++) {
            const wb = new Workbook(tempContainer);
            wb.initRender();
            wb.destroy();
        }
        
        // 验证没有累积的 style 元素
        const finalStyleCount = document.querySelectorAll("style").length;
        // 允许少量差异（webpack 注入的全局样式）
        expect(finalStyleCount - initialStyleCount).toBeLessThanOrEqual(2);
        
        // 验证 tempContainer 中无残留 DOM
        expect(tempContainer.children.length).toBe(1); // canvas 应该还在
        
        document.body.removeChild(tempContainer);
    });
});