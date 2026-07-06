import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClipboardManager } from "@/editor/ClipboardManager";
import { Cell } from "@/model/store/Cell";
import { ChunkedCellStore } from "@/model/store/ChunkedCellStore";
import { SelectionManager } from "@/model/selection/SelectionManager";

function createMockSheet(cells = {}) {
    const store = new ChunkedCellStore();
    for (const [key, value] of Object.entries(cells)) {
        const [r, c] = key.split(",").map(Number);
        store.set(r, c, new Cell(value));
    }
    const selection = new SelectionManager();
    return {
        name: "Sheet1",
        cellStore: store,
        selection,
        getCellTypeInstance: () => ({ name: "text" }),
        render: vi.fn(),
        getColumnConfig: () => null,
        cellTypes: new Map(),
        setCell: vi.fn(),
        beginBatch: vi.fn(),
        endBatch: vi.fn(),
        invalidateAll: vi.fn(),
        isDisabled: () => false,
        parseCellValue: (_r, _c, v) => v,
        formatCellValue: (_r, _c, v) => String(v ?? ""),
        rowColManager: { ensureSize: vi.fn() },
    };
}

describe("ClipboardManager - Copy", () => {
    it("should store copied data internally", () => {
        const cm = new ClipboardManager();
        const sheet = createMockSheet({ "0,0": "A", "0,1": "B" });
        sheet.selection.setRange(0, 0, 0, 1);
        cm.copy(sheet);
        const data = cm.getClipboardData();
        expect(data).toBeDefined();
        expect(data.sourceSheetName).toBe("Sheet1");
        expect(data.rows).toBe(1);
        expect(data.cols).toBe(2);
    });

    it("should copy cell values", () => {
        const cm = new ClipboardManager();
        const sheet = createMockSheet({ "0,0": "Hello", "0,1": "World" });
        sheet.selection.setRange(0, 0, 0, 1);
        cm.copy(sheet);
        const data = cm.getClipboardData();
        expect(data.cells[0][0].value).toBe("Hello");
        expect(data.cells[0][1].value).toBe("World");
    });

    it("should record column types", () => {
        const cm = new ClipboardManager();
        const sheet = createMockSheet({ "0,0": "A" });
        sheet.selection.setRange(0, 0, 0, 0);
        cm.copy(sheet);
        const data = cm.getClipboardData();
        expect(data.columnTypes).toBeDefined();
        expect(data.columnTypes[0]).toBe("text");
    });
});

describe("ClipboardManager - clear", () => {
    it("should clear clipboard data", () => {
        const cm = new ClipboardManager();
        const sheet = createMockSheet({ "0,0": "A" });
        sheet.selection.setRange(0, 0, 0, 0);
        cm.copy(sheet);
        expect(cm.getClipboardData()).toBeDefined();
        cm.clear();
        expect(cm.getClipboardData()).toBeNull();
    });
});

describe("ClipboardManager - getCellContent", () => {
    it("should return null when no content is set", () => {
        const cm = new ClipboardManager();
        const sheet = createMockSheet();
        expect(cm.getCellContent(sheet, 0, 0)).toBeNull();
    });
});

describe("ClipboardManager - pasteText", () => {
    it("should handle empty text gracefully", () => {
        const cm = new ClipboardManager();
        const sheet = createMockSheet();
        sheet.selection.setActive(0, 0);
        expect(() => cm.pasteText(sheet, "")).not.toThrow();
    });

    it("should handle single value paste", () => {
        const cm = new ClipboardManager();
        const sheet = createMockSheet();
        sheet.selection.setActive(0, 0);
        cm.pasteText(sheet, "hello");
        expect(sheet.setCell).toHaveBeenCalled();
    });

    it("should handle tab-separated values", () => {
        const cm = new ClipboardManager();
        const sheet = createMockSheet();
        sheet.selection.setActive(0, 0);
        cm.pasteText(sheet, "A\tB\tC");
        expect(sheet.setCell).toHaveBeenCalled();
    });

    it("should handle newline-separated rows", () => {
        const cm = new ClipboardManager();
        const sheet = createMockSheet();
        sheet.selection.setActive(0, 0);
        cm.pasteText(sheet, "A1\tB1\nA2\tB2");
        expect(sheet.setCell).toHaveBeenCalled();
    });
});

describe("ClipboardManager - pasteFromEvent", () => {
    it("should fallback to internal data when no clipboard items", () => {
        const cm = new ClipboardManager();
        const sheet = createMockSheet();
        const event = { clipboardData: { items: [] } };
        const result = cm.pasteFromEvent(sheet, event);
        expect(result).toBe(false);
    });

    it("should return false when no data available", () => {
        const cm = new ClipboardManager();
        const sheet = createMockSheet();
        const event = { clipboardData: { items: [] } };
        cm.clear();
        const result = cm.pasteFromEvent(sheet, event);
        expect(result).toBe(false);
    });
});