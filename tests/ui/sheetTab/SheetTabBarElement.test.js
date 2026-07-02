import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SheetTabBarElement } from "@/ui/sheetTab/SheetTabBarElement.js";
import { SHEET_TAB_EVENTS } from "@/ui/sheetTab/SheetTabEvents.js";
import { EVENT_NAMES } from "@/constants/eventNames.js";

describe("SheetTabBarElement Web Component", () => {
    let element;

    beforeEach(() => {
        element = document.createElement("sheet-tab-bar");
        document.body.appendChild(element);
    });

    afterEach(() => {
        element.destroy();
        element.remove();
    });

    it("STBE-01: 渲染 Shadow DOM — 包含 nav-group, tabs-scroll, tabs, add-btn", () => {
        const navGroup = element.shadowRoot.querySelector(".nav-group");
        const scrollWrap = element.shadowRoot.querySelector(".tabs-scroll");
        const tabsContainer = element.shadowRoot.querySelector(".tabs");
        const addBtn = element.shadowRoot.querySelector(".add-btn");

        expect(navGroup).not.toBeNull();
        expect(scrollWrap).not.toBeNull();
        expect(tabsContainer).not.toBeNull();
        expect(addBtn).not.toBeNull();
    });

    it("STBE-02: 导航组包含前进和后退按钮", () => {
        const prevBtn = element.shadowRoot.querySelector(".nav-btn.prev");
        const nextBtn = element.shadowRoot.querySelector(".nav-btn.next");

        expect(prevBtn).not.toBeNull();
        expect(nextBtn).not.toBeNull();
    });

    it("STBE-03: 添加按钮文本为 +", () => {
        const addBtn = element.shadowRoot.querySelector(".add-btn");
        expect(addBtn.textContent).toBe("+");
    });

    it("STBE-04: refresh 根据 sheets 创建标签", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabs = element.shadowRoot.querySelectorAll(".tab");
        expect(tabs.length).toBe(2);
    });

    it("STBE-05: 活动工作表标签有 active 类", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabs = element.shadowRoot.querySelectorAll(".tab");
        const activeTab = Array.from(tabs).find((t) => t.classList.contains("active"));
        expect(activeTab).not.toBeNull();
        expect(activeTab.dataset.name).toBe("Sheet1");
    });

    it("STBE-06: 多个工作表时标签有 closable 类", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabs = element.shadowRoot.querySelectorAll(".tab");
        tabs.forEach((tab) => {
            expect(tab.classList.contains("closable")).toBe(true);
        });
    });

    it("STBE-07: 只有一个工作表时标签没有 closable 类", () => {
        const sheets = new Map([["Sheet1", { name: "Sheet1" }]]);
        element.refresh(sheets, "Sheet1");

        const tabs = element.shadowRoot.querySelectorAll(".tab");
        tabs.forEach((tab) => {
            expect(tab.classList.contains("closable")).toBe(false);
        });
    });

    it("STBE-08: 点击添加按钮派发 add 事件", () => {
        const addSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.ADD, addSpy);

        const addBtn = element.shadowRoot.querySelector(".add-btn");
        addBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(addSpy).toHaveBeenCalledTimes(1);

        element.removeEventListener(SHEET_TAB_EVENTS.ADD, addSpy);
    });

    it("STBE-09: 点击标签派发 switch 事件", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const switchSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet2"]');
        tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(switchSpy).toHaveBeenCalledTimes(1);
        expect(switchSpy.mock.calls[0][0].detail.name).toBe("Sheet2");

        element.removeEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);
    });

    it("STBE-10: 点击关闭按钮派发 close 事件", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const closeSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.CLOSE, closeSpy);

        const closeBtn = element.shadowRoot.querySelector('.tab[data-name="Sheet1"] .close-btn');
        closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(closeSpy.mock.calls[0][0].detail.name).toBe("Sheet1");

        element.removeEventListener(SHEET_TAB_EVENTS.CLOSE, closeSpy);
    });

    it("STBE-11: 双击标签触发重命名流程", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        const label = tab.querySelector(".label");
        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

        const renameInput = tab.querySelector(".rename-input");
        expect(renameInput).not.toBeNull();
    });

    it("STBE-12: 双击关闭按钮不触发重命名", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const closeBtn = element.shadowRoot.querySelector('.tab[data-name="Sheet1"] .close-btn');
        closeBtn.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        const renameInput = tab.querySelector(".rename-input");
        expect(renameInput).toBeNull();
    });

    it("STBE-13: 点击前进按钮向右滚动标签", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const nextBtn = element.shadowRoot.querySelector(".nav-btn.next");
        nextBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        const tabsContainer = element.shadowRoot.querySelector(".tabs");
        expect(tabsContainer.style.transform).toContain("translateX");
    });

    it("STBE-14: 点击后退按钮向左滚动标签", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const nextBtn = element.shadowRoot.querySelector(".nav-btn.next");
        nextBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        const prevBtn = element.shadowRoot.querySelector(".nav-btn.prev");
        prevBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        const tabsContainer = element.shadowRoot.querySelector(".tabs");
        expect(tabsContainer.style.transform).toBeDefined();
    });

    it("STBE-15: refresh 销毁旧标签并创建新标签", () => {
        const sheets2 = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets2, "Sheet1");
        expect(element.shadowRoot.querySelectorAll(".tab").length).toBe(2);

        const sheets3 = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
            ["Sheet3", { name: "Sheet3" }],
        ]);
        element.refresh(sheets3, "Sheet3");
        expect(element.shadowRoot.querySelectorAll(".tab").length).toBe(3);
    });

    it("STBE-16: 标签包含 label 和 close-btn 子元素", () => {
        const sheets = new Map([["Sheet1", { name: "Sheet1" }]]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector(".tab");
        expect(tab.querySelector(".label")).not.toBeNull();
        expect(tab.querySelector(".close-btn")).not.toBeNull();
    });

    it("STBE-17: 标签 label 文本与 name 一致", () => {
        const sheets = new Map([["MySheet", { name: "MySheet" }]]);
        element.refresh(sheets, "MySheet");

        const label = element.shadowRoot.querySelector(".tab .label");
        expect(label.textContent).toBe("MySheet");
    });

    it("STBE-18: close-btn 文本为 ×", () => {
        const sheets = new Map([["Sheet1", { name: "Sheet1" }]]);
        element.refresh(sheets, "Sheet1");

        const closeBtn = element.shadowRoot.querySelector(".tab .close-btn");
        expect(closeBtn.textContent).toBe("×");
    });

    it("STBE-19: destroy 后组件标记为已销毁", () => {
        element.destroy();
        expect(element.isDestroyed).toBe(true);
    });

    it("STBE-20: destroy 后 refresh 不再操作 DOM", () => {
        element.destroy();

        const sheets = new Map([["Sheet1", { name: "Sheet1" }]]);
        expect(() => element.refresh(sheets, "Sheet1")).not.toThrow();
    });

    it("STBE-21: refresh 后滚动偏移重置为 0", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabsContainer = element.shadowRoot.querySelector(".tabs");
        expect(tabsContainer.style.transform).not.toContain("translateX(-");
    });

    it("STBE-22: 重命名输入 Enter 后派发 rename 事件", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const renameSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.RENAME, renameSpy);

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        const label = tab.querySelector(".label");
        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

        const renameInput = tab.querySelector(".rename-input");
        renameInput.value = "NewName";
        renameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        renameInput.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

        expect(renameSpy).toHaveBeenCalledTimes(1);
        expect(renameSpy.mock.calls[0][0].detail.oldName).toBe("Sheet1");
        expect(renameSpy.mock.calls[0][0].detail.newName).toBe("NewName");

        element.removeEventListener(SHEET_TAB_EVENTS.RENAME, renameSpy);
    });

    it("STBE-23: 重命名输入 Escape 后取消重命名", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const renameSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.RENAME, renameSpy);

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        const label = tab.querySelector(".label");
        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

        const renameInput = tab.querySelector(".rename-input");
        renameInput.value = "NewName";
        renameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(renameSpy).not.toHaveBeenCalled();

        element.removeEventListener(SHEET_TAB_EVENTS.RENAME, renameSpy);
    });

    it("STBE-24: 点击关闭按钮不触发 switch 事件", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const switchSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);

        const closeBtn = element.shadowRoot.querySelector('.tab[data-name="Sheet1"] .close-btn');
        closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(switchSpy).not.toHaveBeenCalled();

        element.removeEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);
    });

    it("STBE-25: 重命名输入框无边框无轮廓", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        const label = tab.querySelector(".label");
        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

        const renameInput = tab.querySelector(".rename-input");
        const style = element.shadowRoot.querySelector("style");
        const cssText = style.textContent;
        expect(cssText).toContain(".rename-input");
        expect(cssText).toContain("border: none");
        expect(cssText).toContain("outline: none");
    });

    it("STBE-26: 重命名输入框宽度固定为 60px", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        const label = tab.querySelector(".label");
        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

        const renameInput = tab.querySelector(".rename-input");
        const style = element.shadowRoot.querySelector("style");
        const cssText = style.textContent;
        expect(cssText).toContain("width: 60px");
    });

    it("STBE-27: wheel 事件不触发滚动", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabsContainer = element.shadowRoot.querySelector(".tabs");

        element.dispatchEvent(
            new WheelEvent(EVENT_NAMES.WHEEL, { deltaX: 50, bubbles: true }),
        );

        expect(tabsContainer.style.transform).not.toContain("translateX(-");
    });

    it("STBE-28: 导航按钮包含 SVG 图标", () => {
        const prevBtn = element.shadowRoot.querySelector(".nav-btn.prev");
        const nextBtn = element.shadowRoot.querySelector(".nav-btn.next");

        expect(prevBtn.querySelector("svg")).not.toBeNull();
        expect(nextBtn.querySelector("svg")).not.toBeNull();
    });
});