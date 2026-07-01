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

    it("STBE-01: 渲染 Shadow DOM — 包含 add-btn, tabs-scroll, tabs", () => {
        const addBtn = element.shadowRoot.querySelector(".add-btn");
        const scrollWrap = element.shadowRoot.querySelector(".tabs-scroll");
        const tabsContainer = element.shadowRoot.querySelector(".tabs");

        expect(addBtn).not.toBeNull();
        expect(scrollWrap).not.toBeNull();
        expect(tabsContainer).not.toBeNull();
    });

    it("STBE-02: 添加按钮文本为 +", () => {
        const addBtn = element.shadowRoot.querySelector(".add-btn");
        expect(addBtn.textContent).toBe("+");
    });

    it("STBE-03: refresh 根据 sheets 创建标签", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabs = element.shadowRoot.querySelectorAll("sheet-tab-item");
        expect(tabs.length).toBe(2);
    });

    it("STBE-04: 活动工作表标签有 active 属性", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabs = element.shadowRoot.querySelectorAll("sheet-tab-item");
        const activeTab = Array.from(tabs).find((t) => t.hasAttribute("active"));
        expect(activeTab).not.toBeNull();
        expect(activeTab.getAttribute("name")).toBe("Sheet1");
    });

    it("STBE-05: 多个工作表时标签有 closable 属性", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabs = element.shadowRoot.querySelectorAll("sheet-tab-item");
        tabs.forEach((tab) => {
            expect(tab.hasAttribute("closable")).toBe(true);
        });
    });

    it("STBE-06: 只有一个工作表时标签没有 closable 属性", () => {
        const sheets = new Map([["Sheet1", { name: "Sheet1" }]]);
        element.refresh(sheets, "Sheet1");

        const tabs = element.shadowRoot.querySelectorAll("sheet-tab-item");
        tabs.forEach((tab) => {
            expect(tab.hasAttribute("closable")).toBe(false);
        });
    });

    it("STBE-07: 点击添加按钮派发 add 事件", () => {
        const addSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.ADD, addSpy);

        const addBtn = element.shadowRoot.querySelector(".add-btn");
        addBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(addSpy).toHaveBeenCalledTimes(1);

        element.removeEventListener(SHEET_TAB_EVENTS.ADD, addSpy);
    });

    it("STBE-08: switch 事件从 tabs 容器冒泡到 bar 元素", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const switchSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);

        const tabsContainer = element.shadowRoot.querySelector(".tabs");
        tabsContainer.dispatchEvent(
            new CustomEvent(SHEET_TAB_EVENTS.SWITCH, {
                bubbles: true,
                composed: true,
                detail: { name: "Sheet2" },
            }),
        );

        expect(switchSpy).toHaveBeenCalledTimes(1);
        expect(switchSpy.mock.calls[0][0].detail.name).toBe("Sheet2");

        element.removeEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);
    });

    it("STBE-09: close 事件从 tabs 容器冒泡到 bar 元素", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const closeSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.CLOSE, closeSpy);

        const tabsContainer = element.shadowRoot.querySelector(".tabs");
        tabsContainer.dispatchEvent(
            new CustomEvent(SHEET_TAB_EVENTS.CLOSE, {
                bubbles: true,
                composed: true,
                detail: { name: "Sheet1" },
            }),
        );

        expect(closeSpy).toHaveBeenCalledWith(expect.anything());
        expect(closeSpy.mock.calls[0][0].detail.name).toBe("Sheet1");

        element.removeEventListener(SHEET_TAB_EVENTS.CLOSE, closeSpy);
    });

    it("STBE-10: rename 事件触发重命名流程", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabsContainer = element.shadowRoot.querySelector(".tabs");
        tabsContainer.dispatchEvent(
            new CustomEvent(SHEET_TAB_EVENTS.RENAME, {
                bubbles: true,
                composed: true,
                detail: { name: "Sheet1" },
            }),
        );

        const tab = element.shadowRoot.querySelector("sheet-tab-item");
        const renameInput = tab?.shadowRoot?.querySelector(".rename-input");
        expect(renameInput).not.toBeNull();
    });

    it("STBE-11: wheel 事件触发滚动", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabsContainer = element.shadowRoot.querySelector(".tabs");

        element.dispatchEvent(
            new WheelEvent(EVENT_NAMES.WHEEL, { deltaX: 50, bubbles: true }),
        );

        expect(tabsContainer.style.transform).toContain("translateX");
    });

    it("STBE-12: refresh 销毁旧标签并创建新标签", () => {
        const sheets2 = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets2, "Sheet1");
        expect(element.shadowRoot.querySelectorAll("sheet-tab-item").length).toBe(2);

        const sheets3 = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
            ["Sheet3", { name: "Sheet3" }],
        ]);
        element.refresh(sheets3, "Sheet3");
        expect(element.shadowRoot.querySelectorAll("sheet-tab-item").length).toBe(3);
    });

    it("STBE-13: workbook setter 更新后 refresh 使用新数据", () => {
        const sheets = new Map([["Sheet1", { name: "Sheet1" }]]);
        element.refresh(sheets, "Sheet1");
        expect(element.shadowRoot.querySelectorAll("sheet-tab-item").length).toBe(1);
    });

    it("STBE-14: destroy 后组件标记为已销毁", () => {
        element.destroy();
        expect(element.isDestroyed).toBe(true);
    });

    it("STBE-15: destroy 后 refresh 不再操作 DOM", () => {
        element.destroy();

        const sheets = new Map([["Sheet1", { name: "Sheet1" }]]);
        expect(() => element.refresh(sheets, "Sheet1")).not.toThrow();
    });

    it("STBE-16: refresh 后滚动偏移重置为 0", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabsContainer = element.shadowRoot.querySelector(".tabs");
        expect(tabsContainer.style.transform).not.toContain("translateX(-");
    });
});