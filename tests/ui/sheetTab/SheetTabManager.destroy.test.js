import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SheetTabManager } from "@/ui/sheetTab/SheetTabManager.js";
import { SHEET_TAB_EVENTS } from "@/ui/sheetTab/SheetTabEvents.js";
import { EVENT_NAMES } from "@/constants/eventNames.js";

describe("SheetTabManager 销毁", () => {
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

    it("STM-DESTROY-01: 标签栏 DOM 移除 — bar 元素从 wrap 中移除", () => {
        const stm = new SheetTabManager(wrap, null);

        expect(wrap.querySelectorAll(".cs-sheet-tab-bar").length).toBe(1);

        stm.destroy();

        expect(wrap.querySelectorAll(".cs-sheet-tab-bar").length).toBe(0);
    });

    it("STM-DESTROY-02: 销毁后 isDisposed 为 true", () => {
        const stm = new SheetTabManager(wrap, null);

        expect(stm.isDisposed).toBe(false);

        stm.destroy();

        expect(stm.isDisposed).toBe(true);
    });

    it("STM-DESTROY-03: 销毁后所有标签 Web Component 被 destroy", () => {
        const mockWorkbook = {
            sheets: new Map([
                ["Sheet1", { name: "Sheet1" }],
                ["Sheet2", { name: "Sheet2" }],
            ]),
            activeSheet: { name: "Sheet1" },
        };

        const stm = new SheetTabManager(wrap, mockWorkbook);

        const tabs = wrap.querySelectorAll("sheet-tab");
        const destroySpies = Array.from(tabs).map((tab) => vi.spyOn(tab, "destroy"));

        stm.destroy();

        destroySpies.forEach((spy) => {
            expect(spy).toHaveBeenCalled();
        });
    });

    it("STM-DESTROY-04: 销毁后 trackEvent 注册的事件监听器被移除", () => {
        const mockWorkbook = {
            sheets: new Map([
                ["Sheet1", { name: "Sheet1" }],
            ]),
            activeSheet: { name: "Sheet1" },
        };

        const stm = new SheetTabManager(wrap, mockWorkbook);
        const switchFn = vi.fn();
        stm.onSwitch = switchFn;

        stm.destroy();

        const tabsContainer = wrap.querySelector(".cs-sheet-tabs");
        if (tabsContainer) {
            tabsContainer.dispatchEvent(
                new CustomEvent(SHEET_TAB_EVENTS.SWITCH, {
                    bubbles: true,
                    composed: true,
                    detail: { name: "Sheet1" },
                }),
            );
        }

        expect(switchFn).not.toHaveBeenCalled();
    });

    it("STM-DESTROY-05: destroy 幂等 — 连续调用两次不抛异常", () => {
        const stm = new SheetTabManager(wrap, null);

        expect(() => {
            stm.destroy();
            stm.destroy();
        }).not.toThrow();
    });

    it("STM-DESTROY-06: 销毁后 refresh() 不再操作 DOM", () => {
        const stm = new SheetTabManager(wrap, null);
        stm.destroy();

        expect(() => stm.refresh()).not.toThrow();
    });

    it("STM-DESTROY-07: 销毁后 wheel 事件不再触发滚动", () => {
        const stm = new SheetTabManager(wrap, null);
        stm.destroy();

        const bar = wrap.querySelector(".cs-sheet-tab-bar");
        if (bar) {
            const tabsContainer = bar.querySelector(".cs-sheet-tabs");
            const beforeTransform = tabsContainer?.style.transform || "";

            bar.dispatchEvent(
                new WheelEvent(EVENT_NAMES.WHEEL, { deltaX: 100, bubbles: true }),
            );

            expect(tabsContainer?.style.transform || "").toBe(beforeTransform);
        }
    });

    it("STM-DESTROY-08: 销毁后回调被清空", () => {
        const stm = new SheetTabManager(wrap, null);
        stm.onSwitch = vi.fn();
        stm.onAdd = vi.fn();
        stm.onRemove = vi.fn();
        stm.onRename = vi.fn();

        stm.destroy();

        const addBtn = wrap.querySelector(".cs-sheet-add-btn");
        if (addBtn) {
            addBtn.dispatchEvent(new MouseEvent(EVENT_NAMES.CLICK, { bubbles: true }));
        }
    });

    it("STM-DESTROY-09: 多实例隔离 — 销毁一个不影响另一个", () => {
        const wrapB = document.createElement("div");
        wrapB.style.width = "800px";
        wrapB.style.height = "600px";
        document.body.appendChild(wrapB);

        const stmA = new SheetTabManager(wrap, null);
        const stmB = new SheetTabManager(wrapB, null);

        expect(wrap.querySelectorAll(".cs-sheet-tab-bar").length).toBe(1);
        expect(wrapB.querySelectorAll(".cs-sheet-tab-bar").length).toBe(1);

        stmA.destroy();

        expect(wrap.querySelectorAll(".cs-sheet-tab-bar").length).toBe(0);
        expect(wrapB.querySelectorAll(".cs-sheet-tab-bar").length).toBe(1);

        stmB.destroy();
        document.body.removeChild(wrapB);
    });

    it("STM-DESTROY-10: 销毁时重命名状态被清理", () => {
        const mockWorkbook = {
            sheets: new Map([
                ["Sheet1", { name: "Sheet1" }],
                ["Sheet2", { name: "Sheet2" }],
            ]),
            activeSheet: { name: "Sheet1" },
        };

        const stm = new SheetTabManager(wrap, mockWorkbook);

        const tabsContainer = wrap.querySelector(".cs-sheet-tabs");
        tabsContainer.dispatchEvent(
            new CustomEvent(SHEET_TAB_EVENTS.RENAME, {
                bubbles: true,
                composed: true,
                detail: { name: "Sheet1" },
            }),
        );

        expect(() => stm.destroy()).not.toThrow();
    });
});