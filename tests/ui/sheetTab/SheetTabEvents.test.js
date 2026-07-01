import { describe, it, expect } from "vitest";
import { SHEET_TAB_EVENTS } from "@/ui/sheetTab/SheetTabEvents.js";

describe("SheetTabEvents 常量", () => {
    it("STE-EV-01: SWITCH 常量为 'switch'", () => {
        expect(SHEET_TAB_EVENTS.SWITCH).toBe("switch");
    });

    it("STE-EV-02: CLOSE 常量为 'close'", () => {
        expect(SHEET_TAB_EVENTS.CLOSE).toBe("close");
    });

    it("STE-EV-03: RENAME 常量为 'rename'", () => {
        expect(SHEET_TAB_EVENTS.RENAME).toBe("rename");
    });

    it("STE-EV-04: ADD 常量为 'add'", () => {
        expect(SHEET_TAB_EVENTS.ADD).toBe("add");
    });

    it("STE-EV-05: 所有事件名均为非空字符串", () => {
        Object.values(SHEET_TAB_EVENTS).forEach((value) => {
            expect(typeof value).toBe("string");
            expect(value.length).toBeGreaterThan(0);
        });
    });

    it("STE-EV-06: 所有事件名互不相同", () => {
        const values = Object.values(SHEET_TAB_EVENTS);
        const unique = new Set(values);
        expect(unique.size).toBe(values.length);
    });
});