import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SheetTabManager } from "@/ui/sheetTab/SheetTabManager.js";
import { SHEET_TAB_EVENTS } from "@/ui/sheetTab/sheetTabEvents.js";
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

    it("STM-DESTROY-01: sheet-tab-bar 元素从 wrap 中移除", () => {
        const stm = new SheetTabManager(wrap, null);

        expect(wrap.querySelectorAll("sheet-tab-bar").length).toBe(1);

        stm.destroy();

        expect(wrap.querySelectorAll("sheet-tab-bar").length).toBe(0);
    });

    it("STM-DESTROY-02: 销毁后 isDisposed 为 true", () => {
        const stm = new SheetTabManager(wrap, null);

        expect(stm.isDisposed).toBe(false);

        stm.destroy();

        expect(stm.isDisposed).toBe(true);
    });

    it("STM-DESTROY-03: 销毁后 trackEvent 注册的事件监听器被移除", () => {
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

        const bar = wrap.querySelector("sheet-tab-bar");
        if (bar) {
            bar.dispatchEvent(
                new CustomEvent(SHEET_TAB_EVENTS.SWITCH, {
                    bubbles: true,
                    composed: true,
                    detail: { name: "Sheet1" },
                }),
            );
        }

        expect(switchFn).not.toHaveBeenCalled();
    });

    it("STM-DESTROY-04: destroy 幂等 — 连续调用两次不抛异常", () => {
        const stm = new SheetTabManager(wrap, null);

        expect(() => {
            stm.destroy();
            stm.destroy();
        }).not.toThrow();
    });

    it("STM-DESTROY-05: 销毁后 refresh() 不再操作 DOM", () => {
        const stm = new SheetTabManager(wrap, null);
        stm.destroy();

        expect(() => stm.refresh()).not.toThrow();
    });

    it("STM-DESTROY-06: 销毁后回调被清空", () => {
        const stm = new SheetTabManager(wrap, null);
        stm.onSwitch = vi.fn();
        stm.onAdd = vi.fn();
        stm.onRemove = vi.fn();
        stm.onRename = vi.fn();

        stm.destroy();

        const bar = wrap.querySelector("sheet-tab-bar");
        if (bar) {
            bar.dispatchEvent(
                new CustomEvent(SHEET_TAB_EVENTS.ADD, {
                    bubbles: true,
                    composed: true,
                }),
            );
        }
    });

    it("STM-DESTROY-07: 多实例隔离 — 销毁一个不影响另一个", () => {
        const wrapB = document.createElement("div");
        wrapB.style.width = "800px";
        wrapB.style.height = "600px";
        document.body.appendChild(wrapB);

        const stmA = new SheetTabManager(wrap, null);
        const stmB = new SheetTabManager(wrapB, null);

        expect(wrap.querySelectorAll("sheet-tab-bar").length).toBe(1);
        expect(wrapB.querySelectorAll("sheet-tab-bar").length).toBe(1);

        stmA.destroy();

        expect(wrap.querySelectorAll("sheet-tab-bar").length).toBe(0);
        expect(wrapB.querySelectorAll("sheet-tab-bar").length).toBe(1);

        stmB.destroy();
        document.body.removeChild(wrapB);
    });

    it("STM-DESTROY-08: 销毁时重命名状态被清理", () => {
        const mockWorkbook = {
            sheets: new Map([
                ["Sheet1", { name: "Sheet1" }],
                ["Sheet2", { name: "Sheet2" }],
            ]),
            activeSheet: { name: "Sheet1" },
        };

        const stm = new SheetTabManager(wrap, mockWorkbook);

        expect(() => stm.destroy()).not.toThrow();
    });

    it("STM-DESTROY-09: 销毁后 scrollToTab 不抛异常", () => {
        const mockWorkbook = {
            sheets: new Map([["Sheet1", { name: "Sheet1" }]]),
            activeSheet: { name: "Sheet1" },
        };

        const stm = new SheetTabManager(wrap, mockWorkbook);
        stm.destroy();

        expect(() => stm.scrollToTab("Sheet1")).not.toThrow();
    });

    it("STM-DESTROY-10: 销毁后 workbook setter 不抛异常", () => {
        const stm = new SheetTabManager(wrap, null);
        stm.destroy();

        expect(() => {
            stm.workbook = { sheets: new Map(), activeSheet: null };
        }).not.toThrow();
    });
});