import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SheetTabManager } from "@/ui/sheetTab/SheetTabManager.js";
import { SHEET_TAB_EVENTS } from "@/ui/sheetTab/SheetTabEvents.js";
import { EVENT_NAMES } from "@/constants/eventNames.js";

describe("SheetTabManager 功能", () => {
    let wrap;
    let mockWorkbook;

    beforeEach(() => {
        wrap = document.createElement("div");
        wrap.style.width = "800px";
        wrap.style.height = "600px";
        document.body.appendChild(wrap);

        mockWorkbook = {
            sheets: new Map([
                ["Sheet1", { name: "Sheet1" }],
                ["Sheet2", { name: "Sheet2" }],
            ]),
            activeSheet: { name: "Sheet1" },
        };
    });

    afterEach(() => {
        wrap.remove();
    });

    it("STM-01: 创建时在容器中插入标签栏 DOM", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const bar = wrap.querySelector(".cs-sheet-tab-bar");
        expect(bar).not.toBeNull();

        stm.destroy();
    });

    it("STM-02: 创建时包含添加按钮", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const addBtn = wrap.querySelector(".cs-sheet-add-btn");
        expect(addBtn).not.toBeNull();
        expect(addBtn.textContent).toBe("+");

        stm.destroy();
    });

    it("STM-03: 创建时包含滚动容器和标签容器", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const scrollWrap = wrap.querySelector(".cs-sheet-tabs-scroll");
        const tabsContainer = wrap.querySelector(".cs-sheet-tabs");
        expect(scrollWrap).not.toBeNull();
        expect(tabsContainer).not.toBeNull();

        stm.destroy();
    });

    it("STM-04: refresh 根据 workbook.sheets 创建标签", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const tabs = wrap.querySelectorAll("sheet-tab");
        expect(tabs.length).toBe(2);

        stm.destroy();
    });

    it("STM-05: 活动工作表标签有 active 属性", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const tabs = wrap.querySelectorAll("sheet-tab");
        const activeTab = Array.from(tabs).find((t) => t.hasAttribute("active"));
        expect(activeTab).not.toBeNull();
        expect(activeTab.getAttribute("name")).toBe("Sheet1");

        stm.destroy();
    });

    it("STM-06: 多个工作表时标签有 closable 属性", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const tabs = wrap.querySelectorAll("sheet-tab");
        tabs.forEach((tab) => {
            expect(tab.hasAttribute("closable")).toBe(true);
        });

        stm.destroy();
    });

    it("STM-07: 只有一个工作表时标签没有 closable 属性", () => {
        mockWorkbook.sheets = new Map([["Sheet1", { name: "Sheet1" }]]);
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const tabs = wrap.querySelectorAll("sheet-tab");
        tabs.forEach((tab) => {
            expect(tab.hasAttribute("closable")).toBe(false);
        });

        stm.destroy();
    });

    it("STM-08: switch 事件触发 onSwitch 回调", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);
        const switchFn = vi.fn();
        stm.onSwitch = switchFn;

        const tabsContainer = wrap.querySelector(".cs-sheet-tabs");
        tabsContainer.dispatchEvent(
            new CustomEvent(SHEET_TAB_EVENTS.SWITCH, {
                bubbles: true,
                composed: true,
                detail: { name: "Sheet2" },
            }),
        );

        expect(switchFn).toHaveBeenCalledWith("Sheet2");

        stm.destroy();
    });

    it("STM-09: close 事件触发 onRemove 回调", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);
        const removeFn = vi.fn();
        stm.onRemove = removeFn;

        const tabsContainer = wrap.querySelector(".cs-sheet-tabs");
        tabsContainer.dispatchEvent(
            new CustomEvent(SHEET_TAB_EVENTS.CLOSE, {
                bubbles: true,
                composed: true,
                detail: { name: "Sheet1" },
            }),
        );

        expect(removeFn).toHaveBeenCalledWith("Sheet1");

        stm.destroy();
    });

    it("STM-10: rename 事件触发重命名流程", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);
        const renameFn = vi.fn();
        stm.onRename = renameFn;

        const tabsContainer = wrap.querySelector(".cs-sheet-tabs");
        tabsContainer.dispatchEvent(
            new CustomEvent(SHEET_TAB_EVENTS.RENAME, {
                bubbles: true,
                composed: true,
                detail: { name: "Sheet1" },
            }),
        );

        const tab = wrap.querySelector("sheet-tab");
        const renameInput = tab?.shadowRoot?.querySelector(".cs-sheet-rename-input");
        expect(renameInput).not.toBeNull();

        stm.destroy();
    });

    it("STM-11: 点击添加按钮触发 onAdd 回调", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);
        const addFn = vi.fn();
        stm.onAdd = addFn;

        const addBtn = wrap.querySelector(".cs-sheet-add-btn");
        addBtn.dispatchEvent(new MouseEvent(EVENT_NAMES.CLICK, { bubbles: true }));

        expect(addFn).toHaveBeenCalledTimes(1);

        stm.destroy();
    });

    it("STM-12: wheel 事件触发滚动", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const bar = wrap.querySelector(".cs-sheet-tab-bar");
        const tabsContainer = wrap.querySelector(".cs-sheet-tabs");

        bar.dispatchEvent(
            new WheelEvent(EVENT_NAMES.WHEEL, { deltaX: 50, bubbles: true }),
        );

        expect(tabsContainer.style.transform).toContain("translateX");

        stm.destroy();
    });

    it("STM-13: refresh 销毁旧标签并创建新标签", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        expect(wrap.querySelectorAll("sheet-tab").length).toBe(2);

        mockWorkbook.sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
            ["Sheet3", { name: "Sheet3" }],
        ]);
        mockWorkbook.activeSheet = { name: "Sheet3" };

        stm.refresh();

        expect(wrap.querySelectorAll("sheet-tab").length).toBe(3);

        const activeTab = wrap.querySelector("sheet-tab[active]");
        expect(activeTab.getAttribute("name")).toBe("Sheet3");

        stm.destroy();
    });

    it("STM-14: workbook setter 更新工作簿引用", () => {
        const stm = new SheetTabManager(wrap, null);

        const newWorkbook = {
            sheets: new Map([["NewSheet", { name: "NewSheet" }]]),
            activeSheet: { name: "NewSheet" },
        };
        stm.workbook = newWorkbook;
        stm.refresh();

        expect(wrap.querySelectorAll("sheet-tab").length).toBe(1);

        stm.destroy();
    });

    it("STM-15: 重命名中 switch 事件被忽略", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);
        const switchFn = vi.fn();
        stm.onSwitch = switchFn;

        const tabsContainer = wrap.querySelector(".cs-sheet-tabs");
        tabsContainer.dispatchEvent(
            new CustomEvent(SHEET_TAB_EVENTS.RENAME, {
                bubbles: true,
                composed: true,
                detail: { name: "Sheet1" },
            }),
        );

        tabsContainer.dispatchEvent(
            new CustomEvent(SHEET_TAB_EVENTS.SWITCH, {
                bubbles: true,
                composed: true,
                detail: { name: "Sheet2" },
            }),
        );

        expect(switchFn).not.toHaveBeenCalled();

        stm.destroy();
    });

    it("STM-16: scrollToTab 调整滚动偏移", () => {
        mockWorkbook.sheets = new Map(
            Array.from({ length: 20 }, (_, i) => [`Sheet${i + 1}`, { name: `Sheet${i + 1}` }]),
        );
        mockWorkbook.activeSheet = { name: "Sheet1" };

        const stm = new SheetTabManager(wrap, mockWorkbook);

        expect(() => stm.scrollToTab("Sheet10")).not.toThrow();

        stm.destroy();
    });

    it("STM-17: refresh 后滚动偏移重置为 0", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const bar = wrap.querySelector(".cs-sheet-tab-bar");
        bar.dispatchEvent(
            new WheelEvent(EVENT_NAMES.WHEEL, { deltaX: 50, bubbles: true }),
        );

        stm.refresh();

        const tabsContainer = wrap.querySelector(".cs-sheet-tabs");
        expect(tabsContainer.style.transform).toBe("translateX(0px)");

        stm.destroy();
    });
});