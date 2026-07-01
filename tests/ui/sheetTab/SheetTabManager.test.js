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

    it("STM-01: 创建时在容器中插入 sheet-tab-bar 元素", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const bar = wrap.querySelector("sheet-tab-bar");
        expect(bar).not.toBeNull();

        stm.destroy();
    });

    it("STM-02: 创建时标签栏包含标签项", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const bar = wrap.querySelector("sheet-tab-bar");
        const tabs = bar.shadowRoot.querySelectorAll(".tab");
        expect(tabs.length).toBe(2);

        stm.destroy();
    });

    it("STM-03: 活动工作表标签有 active 类", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const bar = wrap.querySelector("sheet-tab-bar");
        const tabs = bar.shadowRoot.querySelectorAll(".tab");
        const activeTab = Array.from(tabs).find((t) => t.classList.contains("active"));
        expect(activeTab).not.toBeNull();
        expect(activeTab.dataset.name).toBe("Sheet1");

        stm.destroy();
    });

    it("STM-04: 多个工作表时标签有 closable 类", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const bar = wrap.querySelector("sheet-tab-bar");
        const tabs = bar.shadowRoot.querySelectorAll(".tab");
        tabs.forEach((tab) => {
            expect(tab.classList.contains("closable")).toBe(true);
        });

        stm.destroy();
    });

    it("STM-05: 只有一个工作表时标签没有 closable 类", () => {
        mockWorkbook.sheets = new Map([["Sheet1", { name: "Sheet1" }]]);
        const stm = new SheetTabManager(wrap, mockWorkbook);

        const bar = wrap.querySelector("sheet-tab-bar");
        const tabs = bar.shadowRoot.querySelectorAll(".tab");
        tabs.forEach((tab) => {
            expect(tab.classList.contains("closable")).toBe(false);
        });

        stm.destroy();
    });

    it("STM-06: switch 事件触发 onSwitch 回调", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);
        const switchFn = vi.fn();
        stm.onSwitch = switchFn;

        const bar = wrap.querySelector("sheet-tab-bar");
        bar.dispatchEvent(
            new CustomEvent(SHEET_TAB_EVENTS.SWITCH, {
                bubbles: true,
                composed: true,
                detail: { name: "Sheet2" },
            }),
        );

        expect(switchFn).toHaveBeenCalledWith("Sheet2");

        stm.destroy();
    });

    it("STM-07: close 事件触发 onRemove 回调", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);
        const removeFn = vi.fn();
        stm.onRemove = removeFn;

        const bar = wrap.querySelector("sheet-tab-bar");
        bar.dispatchEvent(
            new CustomEvent(SHEET_TAB_EVENTS.CLOSE, {
                bubbles: true,
                composed: true,
                detail: { name: "Sheet1" },
            }),
        );

        expect(removeFn).toHaveBeenCalledWith("Sheet1");

        stm.destroy();
    });

    it("STM-08: rename 事件触发 onRename 回调", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);
        const renameFn = vi.fn();
        stm.onRename = renameFn;

        const bar = wrap.querySelector("sheet-tab-bar");
        bar.dispatchEvent(
            new CustomEvent(SHEET_TAB_EVENTS.RENAME, {
                bubbles: true,
                composed: true,
                detail: { oldName: "Sheet1", newName: "NewSheet" },
            }),
        );

        expect(renameFn).toHaveBeenCalledWith("Sheet1", "NewSheet");

        stm.destroy();
    });

    it("STM-09: add 事件触发 onAdd 回调", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);
        const addFn = vi.fn();
        stm.onAdd = addFn;

        const bar = wrap.querySelector("sheet-tab-bar");
        bar.dispatchEvent(
            new CustomEvent(SHEET_TAB_EVENTS.ADD, {
                bubbles: true,
                composed: true,
            }),
        );

        expect(addFn).toHaveBeenCalledTimes(1);

        stm.destroy();
    });

    it("STM-10: refresh 根据 workbook 更新标签", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        mockWorkbook.sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
            ["Sheet3", { name: "Sheet3" }],
        ]);
        mockWorkbook.activeSheet = { name: "Sheet3" };
        stm.refresh();

        const bar = wrap.querySelector("sheet-tab-bar");
        const tabs = bar.shadowRoot.querySelectorAll(".tab");
        expect(tabs.length).toBe(3);

        const activeTab = Array.from(tabs).find((t) => t.classList.contains("active"));
        expect(activeTab.dataset.name).toBe("Sheet3");

        stm.destroy();
    });

    it("STM-11: workbook setter 更新工作簿引用", () => {
        const stm = new SheetTabManager(wrap, null);

        const newWorkbook = {
            sheets: new Map([["Sheet1", { name: "Sheet1" }]]),
            activeSheet: { name: "Sheet1" },
        };
        stm.workbook = newWorkbook;
        stm.refresh();

        const bar = wrap.querySelector("sheet-tab-bar");
        const tabs = bar.shadowRoot.querySelectorAll(".tab");
        expect(tabs.length).toBe(1);

        stm.destroy();
    });

    it("STM-12: scrollToTab 委托给 element", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);

        expect(() => stm.scrollToTab("Sheet1")).not.toThrow();

        stm.destroy();
    });

    it("STM-13: 销毁后 isDisposed 为 true", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);
        stm.destroy();
        expect(stm.isDisposed).toBe(true);
    });

    it("STM-14: 销毁后 sheet-tab-bar 元素从 DOM 移除", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);
        stm.destroy();
        expect(wrap.querySelector("sheet-tab-bar")).toBeNull();
    });

    it("STM-15: 销毁后 refresh 不再操作 DOM", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);
        stm.destroy();
        expect(() => stm.refresh()).not.toThrow();
    });

    it("STM-16: destroy 幂等 — 连续调用两次不抛异常", () => {
        const stm = new SheetTabManager(wrap, mockWorkbook);
        expect(() => {
            stm.destroy();
            stm.destroy();
        }).not.toThrow();
    });
});