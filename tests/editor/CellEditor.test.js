import { describe, it, expect, vi, beforeEach } from "vitest";
import { CellEditor } from "@/editor/editors/CellEditor";
import { TextEditor } from "@/editor/editors/TextEditor";
import { NumericEditor } from "@/editor/editors/NumericEditor";
import { DateEditor } from "@/editor/editors/DateEditor";
import { SelectEditor } from "@/editor/editors/SelectEditor";
import { EventBus } from "@/core/EventBus";

function createMockRenderEngine(overrides = {}) {
    const mockCanvas = { parentElement: { appendChild: vi.fn() } };
    return {
        canvas: mockCanvas,
        canvasParent: mockCanvas.parentElement,
        getCellRect: vi.fn(() => ({ x: 10, y: 20, w: 100, h: 28 })),
        invalidateAll: vi.fn(),
        render: vi.fn(),
        scrollToCell: vi.fn(),
        ...overrides,
    };
}

function createMockSheet(opts = {}) {
    return {
        isDisabled: vi.fn(() => false),
        getMerge: vi.fn(() => null),
        resolveStyle: vi.fn(() => ({})),
        cellStore: { get: vi.fn(() => ({ value: opts.cellValue ?? "test", styleId: 0 })) },
        parseCellValue: vi.fn((r, c, v) => v),
        validateCellValue: vi.fn(() => true),
        setCell: vi.fn(),
        selection: { setActive: vi.fn(), setRange: vi.fn() },
        rowColManager: { rowCount: opts.rowCount ?? 100, realColCount: opts.colCount ?? 26 },
        toRealRow: vi.fn((r) => r),
        getCellTypeInstance: vi.fn(() => null),
        _batchFillRange: null,
        beginBatch: vi.fn(),
        endBatch: vi.fn(),
        bus: new EventBus(),
    };
}

function createMockDOMElement() {
    return {
        id: "",
        style: { cssText: "", display: "none" },
        value: "",
        innerHTML: "",
        options: [],
        selectedIndex: 0,
        setAttribute: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        focus: vi.fn(),
        select: vi.fn(),
        blur: vi.fn(),
        setSelectionRange: vi.fn(),
        appendChild: vi.fn(),
        parentElement: { removeChild: vi.fn() },
    };
}

function createEditorWithDOM(EditorClass, engine, sheet) {
    const editor = new EditorClass(engine, sheet);
    const domElement = createMockDOMElement();
    editor.editor = domElement;
    return { editor, domElement };
}

function setupEditorWithHandlers(EditorClass, engine, sheet) {
    const ed = new EditorClass(engine, sheet);
    const handlers = {};

    const domElement = createMockDOMElement();
    domElement.addEventListener = vi.fn((event, handler) => {
        handlers[event] = handler;
    });

    const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue(domElement);

    ed.createEditor();

    createElementSpy.mockRestore();

    return { editor: ed, domElement, handlers };
}

describe("CellEditor - Template Method Defaults", () => {
    it("should provide default values for all template methods", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(editor.getElementType()).toBe("input");
        expect(editor.getEditorCssClass()).toBe("");
        expect(editor.getEditorAttributes()).toEqual({});
        expect(editor.validateBeforeCommit("any")).toBe(true);
        expect(editor.areValuesEqual("a", "a")).toBe(true);
        expect(editor.areValuesEqual("a", "b")).toBe(false);
        expect(editor.useBatchInBatchFill()).toBe(false);
    });

    it("should initialize common state", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(editor.activeRow).toBe(-1);
        expect(editor.activeCol).toBe(-1);
        expect(editor.composing).toBe(false);
        expect(editor.originalValue).toBe("");
        expect(editor.editor).toBeNull();
    });

    it("readCellValue should read from cellStore", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet({ cellValue: "hello" });
        const editor = new CellEditor(engine, sheet);

        const val = editor.readCellValue(0, 0);
        expect(sheet.cellStore.get).toHaveBeenCalledWith(0, 0);
        expect(val).toBe("hello");
    });

    it("formatValueForEditor should handle various types", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(editor.formatValueForEditor("abc")).toBe("abc");
        expect(editor.formatValueForEditor(123)).toBe("123");
        expect(editor.formatValueForEditor(0)).toBe("0");
        expect(editor.formatValueForEditor(null)).toBe("");
        expect(editor.formatValueForEditor(undefined)).toBe("");
        expect(editor.formatValueForEditor(false)).toBe("false");
    });

    it("areValuesEqual should use strict equality by default", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(editor.areValuesEqual(0, 0)).toBe(true);
        expect(editor.areValuesEqual(0, "0")).toBe(false);
        expect(editor.areValuesEqual(null, undefined)).toBe(false);
        expect(editor.areValuesEqual("", "")).toBe(true);
    });

    it("getEditorValue should return empty string when editor is null", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(editor.getEditorValue()).toBe("");
    });

    it("getEditorValue should return editor value when editor exists", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);
        editor.editor = { value: "hello" };

        expect(editor.getEditorValue()).toBe("hello");
    });
});

describe("CellEditor - Subclass Differentiation", () => {
    it("TextEditor should use toRealRow for reading cell value", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new TextEditor(engine, sheet);

        editor.readCellValue(5, 3);
        expect(sheet.toRealRow).toHaveBeenCalledWith(5);
    });

    it("TextEditor should use batch in batchFill", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new TextEditor(engine, sheet);

        expect(editor.useBatchInBatchFill()).toBe(true);
    });

    it("TextEditor should inherit default getEditorCssClass from base", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new TextEditor(engine, sheet);

        expect(editor.getEditorCssClass()).toBe("");
    });

    it("NumericEditor should have numeric CSS class and trim value", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new NumericEditor(engine, sheet);

        expect(editor.getEditorCssClass()).toBe("cs-cell-editor--numeric");
        expect(editor.getEditorAttributes()).toEqual({ type: "text", inputmode: "decimal" });
    });

    it("NumericEditor should trim editor value", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new NumericEditor(engine, sheet);
        editor.editor = { value: "  123  " };

        expect(editor.getEditorValue()).toBe("123");
    });

    it("NumericEditor should validate before commit", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new NumericEditor(engine, sheet);
        editor.activeRow = 0;
        editor.activeCol = 0;

        sheet.validateCellValue.mockReturnValue(false);
        expect(editor.validateBeforeCommit("abc")).toBe(false);

        sheet.validateCellValue.mockReturnValue(true);
        expect(editor.validateBeforeCommit("123")).toBe(true);
    });

    it("DateEditor should have date CSS class", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        expect(editor.getEditorCssClass()).toBe("cs-cell-editor--date");
    });

    it("DateEditor should compare Date objects by timestamp", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        const d1 = new Date(2024, 0, 1);
        const d2 = new Date(2024, 0, 1);
        const d3 = new Date(2024, 5, 1);

        expect(editor.areValuesEqual(d1, d2)).toBe(true);
        expect(editor.areValuesEqual(d1, d3)).toBe(false);
    });

    it("DateEditor should format Date for editor", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        const date = new Date(2024, 0, 15);
        expect(editor.formatValueForEditor(date)).toBe("2024-01-15");
    });

    it("SelectEditor should use select element type", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new SelectEditor(engine, sheet);

        expect(editor.getElementType()).toBe("select");
        expect(editor.getEditorCssClass()).toBe("cs-cell-editor--select");
    });

    it("SelectEditor setCursorMode should be no-op", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new SelectEditor(engine, sheet);

        expect(editor.setCursorMode("select")).toBeUndefined();
        expect(editor.setCursorMode("end")).toBeUndefined();
    });
});

describe("CellEditor - show / hide lifecycle", () => {
    it("show should position editor and set value", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet({ cellValue: "hello" });
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(2, 3, "select");

        expect(editor.activeRow).toBe(2);
        expect(editor.activeCol).toBe(3);
        expect(domElement.style.display).toBe("block");
        expect(domElement.focus).toHaveBeenCalled();
        expect(domElement.value).toBe("hello");
    });

    it("show should not activate on disabled cell", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.isDisabled.mockReturnValue(true);
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(2, 3);

        expect(editor.activeRow).toBe(-1);
        expect(editor.activeCol).toBe(-1);
    });

    it("show should not activate when sheet is null", () => {
        const engine = createMockRenderEngine();
        const { editor } = createEditorWithDOM(CellEditor, engine, null);

        editor.show(2, 3);

        expect(editor.activeRow).toBe(-1);
    });

    it("show should not activate when editor is null", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        editor.show(2, 3);

        expect(editor.activeRow).toBe(-1);
    });

    it("hide should reset active position", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(2, 3);
        editor.hide();

        expect(editor.activeRow).toBe(-1);
        expect(editor.activeCol).toBe(-1);
        expect(domElement.style.display).toBe("none");
    });

    it("hide should be safe when editor is null", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(() => editor.hide()).not.toThrow();
    });

    it("show should call afterShow hook", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(SelectEditor, engine, sheet);
        const afterShowSpy = vi.spyOn(editor, "afterShow");

        editor.show(2, 3, "select");

        expect(afterShowSpy).toHaveBeenCalledWith(2, 3, "select");
    });

    it("show should store originalValue before formatting", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet({ cellValue: "raw" });
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(0, 0);

        expect(editor.originalValue).toBe("raw");
    });

    it("show should reset scrollHiding state", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(0, 0);
        editor.hideForScroll();
        editor.show(1, 1);

        expect(editor.activeRow).toBe(1);
    });
});

describe("CellEditor - Scroll Handling", () => {
    it("hideForScroll should hide editor", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);
        editor.activeRow = 5;
        editor.activeCol = 3;

        editor.hideForScroll();

        expect(domElement.style.display).toBe("none");
    });

    it("hideForScroll should do nothing if no active cell", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);
        editor.activeRow = -1;

        editor.hideForScroll();

        expect(domElement.style.display).toBe("none");
    });

    it("hideForScroll should do nothing if editor is null", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);
        editor.activeRow = 5;
        editor.activeCol = 3;

        expect(() => editor.hideForScroll()).not.toThrow();
    });

    it("restoreFromScroll should show and focus editor", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);
        editor.activeRow = 5;
        editor.activeCol = 3;

        editor.hideForScroll();
        editor.restoreFromScroll();

        expect(domElement.style.display).toBe("block");
        expect(domElement.focus).toHaveBeenCalled();
    });

    it("restoreFromScroll should do nothing if no active cell", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);
        editor.activeRow = -1;

        expect(() => editor.restoreFromScroll()).not.toThrow();
    });

    it("restoreFromScroll should do nothing if editor is null", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);
        editor.activeRow = 5;
        editor.activeCol = 3;

        expect(() => editor.restoreFromScroll()).not.toThrow();
    });
});

describe("CellEditor - Public API", () => {
    it("getValue should return editor value", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);
        domElement.value = "test";

        expect(editor.getValue()).toBe("test");
    });

    it("getValue should return empty string when editor is null", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(editor.getValue()).toBe("");
    });

    it("setValue should set editor value as string", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.setValue(123);
        expect(domElement.value).toBe("123");
    });

    it("setValue should do nothing when editor is null", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(() => editor.setValue("test")).not.toThrow();
    });

    it("focus should call editor focus", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.focus();
        expect(domElement.focus).toHaveBeenCalled();
    });

    it("focus should be safe when editor is null", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(() => editor.focus()).not.toThrow();
    });

    it("destroy should clean up references", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.destroy();

        expect(editor.editor).toBeNull();
        expect(editor.renderEngine).toBeNull();
        expect(editor.sheet).toBeNull();
        // DOM 移除由 DOMComponent 基类通过 createElement 跟踪管理
        // 手动赋值的 editor 不会被基类跟踪，但引用会被清空
    });

    it("destroy should be safe when editor has no parentElement", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);
        editor.editor = { parentElement: null };

        expect(() => editor.destroy()).not.toThrow();
        expect(editor.editor).toBeNull();
    });

    it("destroy called twice should not throw", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.destroy();
        expect(() => editor.destroy()).not.toThrow();
    });
});

describe("CellEditor - setCursorMode", () => {
    it("select mode should call editor.select()", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.setCursorMode("select");
        expect(domElement.select).toHaveBeenCalled();
    });

    it("end mode should set selection to end of text", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);
        domElement.value = "hello";

        editor.setCursorMode("end");
        expect(domElement.setSelectionRange).toHaveBeenCalledWith(5, 5);
    });

    it("end mode on empty value should set selection to 0", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);
        domElement.value = "";

        editor.setCursorMode("end");
        expect(domElement.setSelectionRange).toHaveBeenCalledWith(0, 0);
    });

    it("should be safe when editor is null", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(() => editor.setCursorMode("select")).not.toThrow();
        expect(() => editor.setCursorMode("end")).not.toThrow();
    });

    it("unknown cursorMode should fall through to select()", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.setCursorMode("unknown");
        expect(domElement.select).toHaveBeenCalled();
    });
});

describe("DateEditor - Date Parsing and Formatting", () => {
    it("should format ISO date string", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        expect(editor.formatValueForEditor("2024-03-15")).toBe("2024-03-15");
    });

    it("should format Date object", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        const date = new Date(2024, 0, 15);
        expect(editor.formatValueForEditor(date)).toBe("2024-01-15");
    });

    it("should handle empty string", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        expect(editor.formatValueForEditor("")).toBe("");
    });

    it("should handle null and undefined", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        expect(editor.formatValueForEditor(null)).toBe("");
        expect(editor.formatValueForEditor(undefined)).toBe("");
    });

    it("areValuesEqual should handle mixed Date and non-Date", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        const d = new Date(2024, 0, 1);
        expect(editor.areValuesEqual(d, d.getTime())).toBe(true);
        expect(editor.areValuesEqual(d.getTime(), d)).toBe(true);
        expect(editor.areValuesEqual("2024-01-01", "2024-01-01")).toBe(true);
    });

    it("areValuesEqual should handle null/undefined", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        expect(editor.areValuesEqual(null, null)).toBe(true);
        expect(editor.areValuesEqual(undefined, undefined)).toBe(true);
        expect(editor.areValuesEqual(null, undefined)).toBe(false);
    });

    it("should format single-digit month/day with padding", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        const date = new Date(2024, 0, 5);
        expect(editor.formatValueForEditor(date)).toBe("2024-01-05");
    });

    it("should handle leap year date", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        const date = new Date(2024, 1, 29);
        expect(editor.formatValueForEditor(date)).toBe("2024-02-29");
    });
});

describe("SelectEditor - Options Building", () => {
    it("afterShow should build options from cellType", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.getCellTypeInstance.mockReturnValue({
            getEditorOptions: () => ({
                source: ["Option A", "Option B", "Option C"],
                allowInvalid: false,
                strict: true,
            }),
        });
        const { editor, domElement } = createEditorWithDOM(SelectEditor, engine, sheet);
        domElement.innerHTML = "";
        domElement.options = [];
        domElement.appendChild = vi.fn();
        domElement.selectedIndex = 0;

        editor.activeRow = 0;
        editor.activeCol = 0;
        editor.originalValue = "Option B";
        editor.afterShow(0, 0);

        expect(sheet.getCellTypeInstance).toHaveBeenCalledWith(0, 0);
    });

    it("afterShow should handle null cellType", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.getCellTypeInstance.mockReturnValue(null);
        const { editor, domElement } = createEditorWithDOM(SelectEditor, engine, sheet);
        domElement.innerHTML = "";
        domElement.options = [];
        domElement.appendChild = vi.fn();
        domElement.selectedIndex = 0;

        editor.activeRow = 0;
        editor.activeCol = 0;
        editor.originalValue = "";
        expect(() => editor.afterShow(0, 0)).not.toThrow();
    });

    it("validateBeforeCommit should delegate to sheet", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new SelectEditor(engine, sheet);
        editor.activeRow = 0;
        editor.activeCol = 0;

        sheet.validateCellValue.mockReturnValue(false);
        expect(editor.validateBeforeCommit("invalid")).toBe(false);

        sheet.validateCellValue.mockReturnValue(true);
        expect(editor.validateBeforeCommit("valid")).toBe(true);
    });

    it("afterShow should handle cellType without getEditorOptions", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.getCellTypeInstance.mockReturnValue({});
        const { editor, domElement } = createEditorWithDOM(SelectEditor, engine, sheet);
        domElement.innerHTML = "";
        domElement.options = [];
        domElement.appendChild = vi.fn();
        domElement.selectedIndex = 0;

        editor.activeRow = 0;
        editor.activeCol = 0;
        editor.originalValue = "";
        expect(() => editor.afterShow(0, 0)).not.toThrow();
    });

    it("bindEditorEvents should add change event listener", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(SelectEditor, engine, sheet);

        editor.bindEditorEvents();

        // trackEvent 内部调用 target.addEventListener(type, handler, options)
        // options 未传递时为 undefined，需要精确匹配三个参数
        expect(domElement.addEventListener).toHaveBeenCalledWith("change", expect.any(Function), undefined);
    });
});

describe("CellEditor - Event Handling", () => {
    let engine, sheet, editor, domElement, handlers;

    beforeEach(() => {
        engine = createMockRenderEngine();
        sheet = createMockSheet();
        sheet.rowColManager = { rowCount: 100, realColCount: 26 };

        const result = setupEditorWithHandlers(CellEditor, engine, sheet);
        editor = result.editor;
        domElement = result.domElement;
        handlers = result.handlers;

        editor.activeRow = 5;
        editor.activeCol = 3;
    });

    it("blur handler should commit value on blur", () => {
        handlers.blur();
        expect(sheet.setCell).toHaveBeenCalled();
    });

    it("blur handler should not commit when composing", () => {
        editor.composing = true;
        handlers.blur();
        expect(sheet.setCell).not.toHaveBeenCalled();
    });

    it("blur handler should not commit when scrollHiding", () => {
        editor.hideForScroll();
        handlers.blur();
        expect(sheet.setCell).not.toHaveBeenCalled();
    });

    it("blur handler should not commit when activeRow < 0", () => {
        editor.activeRow = -1;
        handlers.blur();
        expect(sheet.setCell).not.toHaveBeenCalled();
    });

    it("blur handler should not commit when sheet is null", () => {
        editor.sheet = null;
        handlers.blur();
        expect(sheet.setCell).not.toHaveBeenCalled();
    });

    it("keydown Enter should trigger blur", () => {
        const e = { key: "Enter", preventDefault: vi.fn(), shiftKey: false };
        handlers.keydown(e);
        expect(e.preventDefault).toHaveBeenCalled();
        expect(domElement.blur).toHaveBeenCalled();
    });

    it("keydown Escape should reset value and blur", () => {
        editor.originalValue = "original";
        const e = { key: "Escape", preventDefault: vi.fn() };
        handlers.keydown(e);
        expect(e.preventDefault).toHaveBeenCalled();
        expect(domElement.value).toBe("original");
        expect(domElement.blur).toHaveBeenCalled();
    });

    it("keydown Tab should trigger blur", () => {
        const e = { key: "Tab", preventDefault: vi.fn(), shiftKey: false };
        handlers.keydown(e);
        expect(e.preventDefault).toHaveBeenCalled();
        expect(domElement.blur).toHaveBeenCalled();
    });

    it("keydown other keys should be ignored", () => {
        const e = { key: "a", preventDefault: vi.fn() };
        handlers.keydown(e);
        expect(e.preventDefault).not.toHaveBeenCalled();
    });

    it("keydown should be ignored when composing", () => {
        editor.composing = true;
        const e = { key: "Enter", preventDefault: vi.fn() };
        handlers.keydown(e);
        expect(e.preventDefault).not.toHaveBeenCalled();
    });

    it("keydown should be ignored when sheet is null", () => {
        editor.sheet = null;
        const e = { key: "Enter", preventDefault: vi.fn() };
        handlers.keydown(e);
        expect(e.preventDefault).not.toHaveBeenCalled();
    });

    it("compositionstart should set composing to true", () => {
        editor.composing = false;
        handlers.compositionstart();
        expect(editor.composing).toBe(true);
    });

    it("compositionend should set composing to false", () => {
        editor.composing = true;
        handlers.compositionend();
        expect(editor.composing).toBe(false);
    });
});

describe("CellEditor - Blur Commit Logic", () => {
    let engine, sheet, editor, domElement, handlers;

    beforeEach(() => {
        engine = createMockRenderEngine();
        sheet = createMockSheet();
        sheet.rowColManager = { rowCount: 100, realColCount: 26 };

        const result = setupEditorWithHandlers(CellEditor, engine, sheet);
        editor = result.editor;
        domElement = result.domElement;
        handlers = result.handlers;

        editor.activeRow = 5;
        editor.activeCol = 3;
    });

    it("should not call setCell when value unchanged", () => {
        sheet.cellStore.get.mockReturnValue({ value: "test", styleId: 0 });
        domElement.value = "test";
        editor.originalValue = "test";
        sheet.parseCellValue.mockReturnValue("test");

        handlers.blur();

        expect(sheet.setCell).not.toHaveBeenCalled();
    });

    it("should call setCell when value changed", () => {
        sheet.cellStore.get.mockReturnValue({ value: "old", styleId: 0 });
        domElement.value = "new";
        editor.originalValue = "old";
        sheet.parseCellValue.mockReturnValue("new");

        handlers.blur();

        expect(sheet.setCell).toHaveBeenCalledWith(5, 3, "new", 0);
    });

    it("should call invalidateAll after commit", () => {
        sheet.cellStore.get.mockReturnValue({ value: "old", styleId: 0 });
        domElement.value = "new";
        editor.originalValue = "old";
        sheet.parseCellValue.mockReturnValue("new");

        handlers.blur();

        expect(engine.invalidateAll).toHaveBeenCalled();
    });

    it("should restore value and refocus when validation fails", () => {
        sheet.cellStore.get.mockReturnValue({ value: "old", styleId: 0 });
        domElement.value = "invalid";
        editor.originalValue = "old";
        sheet.parseCellValue.mockReturnValue("invalid");

        const editorValidate = vi.spyOn(editor, "validateBeforeCommit").mockReturnValue(false);

        handlers.blur();

        expect(sheet.setCell).not.toHaveBeenCalled();
        expect(domElement.focus).toHaveBeenCalled();

        editorValidate.mockRestore();
    });

    it("should handle batch fill range", () => {
        sheet._batchFillRange = { topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 2 };
        sheet.cellStore.get.mockReturnValue({ value: "", styleId: 0 });
        sheet.parseCellValue.mockReturnValue("batchval");
        domElement.value = "batchval";

        handlers.blur();

        expect(sheet.setCell).toHaveBeenCalled();
        expect(sheet._batchFillRange).toBeUndefined();
    });

    it("should handle null oldCell gracefully", () => {
        sheet.cellStore.get.mockReturnValue(null);
        domElement.value = "new";
        editor.originalValue = "old";
        sheet.parseCellValue.mockReturnValue("new");

        handlers.blur();

        expect(sheet.setCell).toHaveBeenCalledWith(5, 3, "new", 0);
    });

    it("should use oldCell styleId when available", () => {
        sheet.cellStore.get.mockReturnValue({ value: "old", styleId: 5 });
        domElement.value = "new";
        editor.originalValue = "old";
        sheet.parseCellValue.mockReturnValue("new");

        handlers.blur();

        expect(sheet.setCell).toHaveBeenCalledWith(5, 3, "new", 5);
    });
});

describe("CellEditor - Navigation Logic", () => {
    let engine, sheet, editor, domElement, handlers;

    beforeEach(() => {
        engine = createMockRenderEngine();
        sheet = createMockSheet();
        sheet.rowColManager = { rowCount: 100, realColCount: 26 };

        const result = setupEditorWithHandlers(CellEditor, engine, sheet);
        editor = result.editor;
        domElement = result.domElement;
        handlers = result.handlers;

        editor.activeRow = 5;
        editor.activeCol = 3;
    });

    it("Enter should navigate to next row", () => {
        handlers.keydown({ key: "Enter", preventDefault: vi.fn(), shiftKey: false });

        expect(sheet.selection.setActive).toHaveBeenCalledWith(6, 3);
        expect(engine.scrollToCell).toHaveBeenCalledWith(6, 3);
    });

    it("Tab should navigate to next column", () => {
        handlers.keydown({ key: "Tab", preventDefault: vi.fn(), shiftKey: false });

        expect(sheet.selection.setActive).toHaveBeenCalledWith(5, 4);
        expect(engine.scrollToCell).toHaveBeenCalledWith(5, 4);
    });

    it("Shift+Tab should navigate to previous column", () => {
        handlers.keydown({ key: "Tab", preventDefault: vi.fn(), shiftKey: true });

        expect(sheet.selection.setActive).toHaveBeenCalledWith(5, 2);
        expect(engine.scrollToCell).toHaveBeenCalledWith(5, 2);
    });

    it("Enter at last row should clamp to max row", () => {
        editor.activeRow = 99;
        handlers.keydown({ key: "Enter", preventDefault: vi.fn(), shiftKey: false });

        expect(sheet.selection.setActive).toHaveBeenCalledWith(99, 3);
    });

    it("Tab at last column should clamp to max col", () => {
        editor.activeCol = 25;
        handlers.keydown({ key: "Tab", preventDefault: vi.fn(), shiftKey: false });

        expect(sheet.selection.setActive).toHaveBeenCalledWith(5, 25);
    });

    it("Shift+Tab at first column should clamp to 0", () => {
        editor.activeCol = 0;
        handlers.keydown({ key: "Tab", preventDefault: vi.fn(), shiftKey: true });

        expect(sheet.selection.setActive).toHaveBeenCalledWith(5, 0);
    });

    it("Enter should skip past merged cell bottom", () => {
        sheet.getMerge.mockImplementation((r, c) => {
            if (r === 5 && c === 3) return { topRow: 5, topCol: 3, bottomRow: 7, bottomCol: 5 };
            return null;
        });

        handlers.keydown({ key: "Enter", preventDefault: vi.fn(), shiftKey: false });

        expect(sheet.selection.setActive).toHaveBeenCalledWith(8, 3);
    });

    it("Tab should skip past merged cell right edge", () => {
        sheet.getMerge.mockImplementation((r, c) => {
            if (r === 5 && c === 3) return { topRow: 5, topCol: 3, bottomRow: 7, bottomCol: 5 };
            return null;
        });

        handlers.keydown({ key: "Tab", preventDefault: vi.fn(), shiftKey: false });

        expect(sheet.selection.setActive).toHaveBeenCalledWith(5, 6);
    });

    it("Shift+Tab should skip past merged cell left edge", () => {
        editor.activeCol = 5;
        sheet.getMerge.mockImplementation((r, c) => {
            if (r === 5 && c === 5) return { topRow: 5, topCol: 3, bottomRow: 7, bottomCol: 5 };
            return null;
        });

        handlers.keydown({ key: "Tab", preventDefault: vi.fn(), shiftKey: true });

        expect(sheet.selection.setActive).toHaveBeenCalledWith(5, 2);
    });

    it("Enter should select merge range if target is merged", () => {
        sheet.getMerge.mockImplementation((r, c) => {
            if (r === 5 && c === 3) return null;
            if (r === 6 && c === 3) return { topRow: 6, topCol: 3, bottomRow: 8, bottomCol: 5 };
            return null;
        });

        handlers.keydown({ key: "Enter", preventDefault: vi.fn(), shiftKey: false });

        expect(sheet.selection.setRange).toHaveBeenCalledWith(6, 3, 8, 5);
    });

    it("Tab should select merge range if target is merged", () => {
        sheet.getMerge.mockImplementation((r, c) => {
            if (r === 5 && c === 3) return null;
            if (r === 5 && c === 4) return { topRow: 5, topCol: 4, bottomRow: 7, bottomCol: 6 };
            return null;
        });

        handlers.keydown({ key: "Tab", preventDefault: vi.fn(), shiftKey: false });

        expect(sheet.selection.setRange).toHaveBeenCalledWith(5, 4, 7, 6);
    });

    it("Escape should reset value and blur", () => {
        editor.originalValue = "original";
        handlers.keydown({ key: "Escape", preventDefault: vi.fn() });

        expect(domElement.value).toBe("original");
        expect(domElement.blur).toHaveBeenCalled();
    });

    it("Escape should clear batchFillRange", () => {
        sheet._batchFillRange = { topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 2 };
        handlers.keydown({ key: "Escape", preventDefault: vi.fn() });

        expect(sheet._batchFillRange).toBeUndefined();
    });
});

describe("CellEditor - Batch Fill Logic", () => {
    let engine, sheet, editor, domElement, handlers;

    beforeEach(() => {
        engine = createMockRenderEngine();
        sheet = createMockSheet();
        sheet.rowColManager = { rowCount: 100, realColCount: 26 };

        const result = setupEditorWithHandlers(TextEditor, engine, sheet);
        editor = result.editor;
        domElement = result.domElement;
        handlers = result.handlers;

        editor.activeRow = 0;
        editor.activeCol = 0;
    });

    it("should batch fill all cells in range", () => {
        sheet._batchFillRange = { topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 2 };
        sheet.cellStore.get.mockReturnValue({ value: "", styleId: 0 });
        sheet.parseCellValue.mockReturnValue("fillval");
        domElement.value = "fillval";

        handlers.blur();

        expect(sheet.setCell).toHaveBeenCalledTimes(9);
    });

    it("should skip disabled cells in batch fill", () => {
        sheet._batchFillRange = { topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 2 };
        sheet.cellStore.get.mockReturnValue({ value: "", styleId: 0 });
        sheet.parseCellValue.mockReturnValue("fillval");
        sheet.isDisabled.mockImplementation((r, c) => r === 1 && c === 1);
        domElement.value = "fillval";

        handlers.blur();

        expect(sheet.setCell).toHaveBeenCalledTimes(8);
    });

    it("should skip cells where value already matches", () => {
        sheet._batchFillRange = { topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 2 };
        sheet.cellStore.get.mockReturnValue({ value: "fillval", styleId: 0 });
        sheet.parseCellValue.mockReturnValue("fillval");
        domElement.value = "fillval";

        handlers.blur();

        expect(sheet.setCell).not.toHaveBeenCalled();
    });

    it("should emit BEFORE_CHANGE and AFTER_CHANGE via bus for batch fill", () => {
        sheet._batchFillRange = { topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 };
        sheet.cellStore.get.mockReturnValue({ value: "", styleId: 0 });
        sheet.parseCellValue.mockReturnValue("fillval");
        domElement.value = "fillval";

        const beforeHandler = vi.fn();
        const afterHandler = vi.fn();
        sheet.bus.on("sheet:before-change", beforeHandler);
        sheet.bus.on("sheet:after-change", afterHandler);

        handlers.blur();

        expect(beforeHandler).toHaveBeenCalled();
        expect(afterHandler).toHaveBeenCalled();
    });

    it("should use beginBatch/endBatch for TextEditor", () => {
        sheet._batchFillRange = { topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 };
        sheet.cellStore.get.mockReturnValue({ value: "", styleId: 0 });
        sheet.parseCellValue.mockReturnValue("fillval");
        domElement.value = "fillval";

        handlers.blur();

        expect(sheet.beginBatch).toHaveBeenCalled();
        expect(sheet.endBatch).toHaveBeenCalled();
    });

    it("should not use beginBatch/endBatch for CellEditor base", () => {
        const baseResult = setupEditorWithHandlers(CellEditor, engine, sheet);
        const baseEditor = baseResult.editor;
        const baseHandlers = baseResult.handlers;
        baseEditor.activeRow = 0;
        baseEditor.activeCol = 0;

        sheet._batchFillRange = { topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 };
        sheet.cellStore.get.mockReturnValue({ value: "", styleId: 0 });
        sheet.parseCellValue.mockReturnValue("fillval");
        baseEditor.editor.value = "fillval";

        baseHandlers.blur();

        expect(sheet.beginBatch).not.toHaveBeenCalled();
        expect(sheet.endBatch).not.toHaveBeenCalled();
    });
});

describe("CellEditor - createEditor", () => {
    it("should create DOM element and append to canvas parent", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        const mockElement = createMockDOMElement();
        const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue(mockElement);

        editor.createEditor();

        expect(createElementSpy).toHaveBeenCalledWith("input");
        expect(engine.canvas.parentElement.appendChild).toHaveBeenCalledWith(mockElement);
        expect(mockElement.addEventListener).toHaveBeenCalled();

        createElementSpy.mockRestore();
    });

    it("should call afterCreateEditor hook", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);
        const afterCreateSpy = vi.spyOn(editor, "afterCreateEditor");

        const mockElement = createMockDOMElement();
        const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue(mockElement);

        editor.createEditor();

        expect(afterCreateSpy).toHaveBeenCalled();

        createElementSpy.mockRestore();
    });

    it("should call bindEditorEvents hook", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);
        const bindEventsSpy = vi.spyOn(editor, "bindEditorEvents");

        const mockElement = createMockDOMElement();
        const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue(mockElement);

        editor.createEditor();

        expect(bindEventsSpy).toHaveBeenCalled();

        createElementSpy.mockRestore();
    });

    it("should set editor attributes from getEditorAttributes", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new NumericEditor(engine, sheet);

        const mockElement = createMockDOMElement();
        const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue(mockElement);

        editor.createEditor();

        expect(mockElement.setAttribute).toHaveBeenCalledWith("type", "text");
        expect(mockElement.setAttribute).toHaveBeenCalledWith("inputmode", "decimal");

        createElementSpy.mockRestore();
    });

    it("should skip null/undefined attribute values", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);
        vi.spyOn(editor, "getEditorAttributes").mockReturnValue({
            type: "text",
            placeholder: null,
            name: undefined,
            required: "true",
        });

        const mockElement = createMockDOMElement();
        const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue(mockElement);

        editor.createEditor();

        expect(mockElement.setAttribute).toHaveBeenCalledWith("type", "text");
        expect(mockElement.setAttribute).toHaveBeenCalledWith("required", "true");
        expect(mockElement.setAttribute).not.toHaveBeenCalledWith("placeholder", null);
        expect(mockElement.setAttribute).not.toHaveBeenCalledWith("name", undefined);

        createElementSpy.mockRestore();
    });
});

describe("CellEditor - Aggressive: Null Safety", () => {
    it("show() should not throw when editor is null (graceful return)", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(() => editor.show(0, 0)).not.toThrow();
        expect(editor.activeRow).toBe(-1);
    });

    it("hideForScroll() should not throw when editor is null but activeRow >= 0", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);
        editor.activeRow = 5;
        editor.activeCol = 3;

        expect(() => editor.hideForScroll()).not.toThrow();
    });

    it("restoreFromScroll() should not throw when editor is null but activeRow >= 0", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);
        editor.activeRow = 5;
        editor.activeCol = 3;

        expect(() => editor.restoreFromScroll()).not.toThrow();
    });

    it("getEditorValue() should return empty string when editor is null", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(editor.getEditorValue()).toBe("");
    });

    it("setCursorMode() should not throw when editor is null", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(() => editor.setCursorMode("select")).not.toThrow();
        expect(() => editor.setCursorMode("end")).not.toThrow();
    });

    it("destroy() called twice should not throw", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.destroy();
        expect(() => editor.destroy()).not.toThrow();
    });

    it("destroy() should handle editor with null parentElement", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);
        editor.editor = { parentElement: null };

        expect(() => editor.destroy()).not.toThrow();
        expect(editor.editor).toBeNull();
    });

    it("destroy() should handle editor with undefined parentElement", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);
        editor.editor = { parentElement: undefined };

        expect(() => editor.destroy()).not.toThrow();
    });
});

describe("CellEditor - Aggressive: Type Coercion", () => {
    it("areValuesEqual uses === so 0 !== '0' - potential type coercion issue", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(editor.areValuesEqual(0, "0")).toBe(false);
        expect(editor.areValuesEqual(1, "1")).toBe(false);
        expect(editor.areValuesEqual(null, "")).toBe(false);
        expect(editor.areValuesEqual(false, 0)).toBe(false);
        expect(editor.areValuesEqual(null, undefined)).toBe(false);
    });

    it("formatValueForEditor(false) returns 'false' string - may be unexpected", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(editor.formatValueForEditor(false)).toBe("false");
        expect(editor.formatValueForEditor(0)).toBe("0");
    });

    it("readCellValue returns empty string for missing cell", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.cellStore.get.mockReturnValue(undefined);
        const editor = new CellEditor(engine, sheet);

        const val = editor.readCellValue(0, 0);
        expect(val).toBe("");
    });

    it("show() on cell with null value should set editor value to empty", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.cellStore.get.mockReturnValue({ value: null, styleId: 0 });
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(0, 0);

        expect(domElement.value).toBe("");
        expect(editor.originalValue).toBe("");
    });

    it("show() on cell with undefined value", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.cellStore.get.mockReturnValue({ value: undefined, styleId: 0 });
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(0, 0);

        expect(domElement.value).toBe("");
    });

    it("show() on cell with numeric value 0", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.cellStore.get.mockReturnValue({ value: 0, styleId: 0 });
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(0, 0);

        expect(domElement.value).toBe("0");
        expect(editor.originalValue).toBe(0);
    });

    it("BUG: originalValue stores raw value but editor shows formatted value - mismatch", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.cellStore.get.mockReturnValue({ value: 0, styleId: 0 });
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(0, 0);

        expect(editor.originalValue).toBe(0);
        expect(editor.getEditorValue()).toBe("0");
        expect(editor.areValuesEqual(editor.originalValue, editor.getEditorValue())).toBe(false);
    });
});

describe("CellEditor - Aggressive: Boundary Conditions", () => {
    it("show() with negative row/col should still proceed", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(-1, -5);
        expect(editor.activeRow).toBe(-1);
        expect(editor.activeCol).toBe(-5);
    });

    it("show() with very large row/col", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(999999, 999999);
        expect(editor.activeRow).toBe(999999);
    });

    it("show() with cellH=0 in getCellRect", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        engine.getCellRect.mockReturnValue({ x: 10, y: 20, w: 100, h: 0 });
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        expect(() => editor.show(0, 0)).not.toThrow();
    });

    it("show() with negative rect dimensions", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        engine.getCellRect.mockReturnValue({ x: -10, y: -20, w: -100, h: -28 });
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        expect(() => editor.show(0, 0)).not.toThrow();
    });

    it("show() with NaN rect dimensions", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        engine.getCellRect.mockReturnValue({ x: NaN, y: NaN, w: NaN, h: NaN });
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        expect(() => editor.show(0, 0)).not.toThrow();
    });

    it("show() called multiple times should update position", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(0, 0);
        editor.show(5, 5);

        expect(editor.activeRow).toBe(5);
        expect(editor.activeCol).toBe(5);
        expect(engine.getCellRect).toHaveBeenCalledTimes(2);
    });

    it("show() should reset composing state", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.composing = true;
        editor.show(0, 0);

        expect(editor.composing).toBe(false);
    });

    it("show() with merge cell should pass merge to getCellRect", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const mergeArea = { topRow: 0, topCol: 0, bottomRow: 2, bottomCol: 2 };
        sheet.getMerge.mockReturnValue(mergeArea);
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(1, 1);

        expect(engine.getCellRect).toHaveBeenCalledWith(1, 1, mergeArea);
    });

    it("validateBeforeCommit default should accept any value including undefined", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(editor.validateBeforeCommit(undefined)).toBe(true);
        expect(editor.validateBeforeCommit(null)).toBe(true);
        expect(editor.validateBeforeCommit("")).toBe(true);
        expect(editor.validateBeforeCommit(0)).toBe(true);
        expect(editor.validateBeforeCommit(NaN)).toBe(true);
    });

    it("NumericEditor getEditorValue should handle whitespace-only input", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new NumericEditor(engine, sheet);
        editor.editor = { value: "   " };

        expect(editor.getEditorValue()).toBe("");
    });

    it("NumericEditor getEditorValue should handle tab and newline", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new NumericEditor(engine, sheet);
        editor.editor = { value: "\t123\n" };

        expect(editor.getEditorValue()).toBe("123");
    });

    it("NumericEditor getEditorValue should handle null editor", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new NumericEditor(engine, sheet);

        expect(editor.getEditorValue()).toBe("");
    });
});

describe("CellEditor - Aggressive: DateEditor Edge Cases", () => {
    it("areValuesEqual with NaN Date", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        const invalidDate = new Date("invalid");
        expect(editor.areValuesEqual(invalidDate, invalidDate)).toBe(true);
        expect(editor.areValuesEqual(invalidDate, NaN)).toBe(true);
    });

    it("formatValueForEditor with Invalid Date", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        const invalidDate = new Date("invalid");
        expect(editor.formatValueForEditor(invalidDate)).toBe("");
    });

    it("formatValueForEditor with far future date", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        const date = new Date(9999, 11, 31);
        expect(editor.formatValueForEditor(date)).toBe("9999-12-31");
    });

    it("areValuesEqual with Date vs number timestamp", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);

        const d = new Date(2024, 0, 1);
        expect(editor.areValuesEqual(d, d.getTime())).toBe(true);
    });

    it("validateBeforeCommit should delegate to sheet", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new DateEditor(engine, sheet);
        editor.activeRow = 0;
        editor.activeCol = 0;

        sheet.validateCellValue.mockReturnValue(false);
        expect(editor.validateBeforeCommit("invalid-date")).toBe(false);

        sheet.validateCellValue.mockReturnValue(true);
        expect(editor.validateBeforeCommit("2024-01-01")).toBe(true);
    });
});

describe("CellEditor - Aggressive: SelectEditor Edge Cases", () => {
    it("getEditorCssClass should return select variant", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new SelectEditor(engine, sheet);

        expect(editor.getEditorCssClass()).toBe("cs-cell-editor--select");
    });

    it("afterShow should handle empty source array", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.getCellTypeInstance.mockReturnValue({
            getEditorOptions: () => ({ source: [], allowInvalid: false, strict: false }),
        });
        const { editor, domElement } = createEditorWithDOM(SelectEditor, engine, sheet);
        domElement.innerHTML = "";
        domElement.options = [];
        domElement.appendChild = vi.fn();
        domElement.selectedIndex = 0;

        editor.activeRow = 0;
        editor.activeCol = 0;
        editor.originalValue = "";

        expect(() => editor.afterShow(0, 0)).not.toThrow();
    });

    it("afterShow should handle undefined editorOptions", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.getCellTypeInstance.mockReturnValue({
            getEditorOptions: () => undefined,
        });
        const { editor, domElement } = createEditorWithDOM(SelectEditor, engine, sheet);
        domElement.innerHTML = "";
        domElement.options = [];
        domElement.appendChild = vi.fn();
        domElement.selectedIndex = 0;

        editor.activeRow = 0;
        editor.activeCol = 0;
        editor.originalValue = "";

        expect(() => editor.afterShow(0, 0)).not.toThrow();
    });
});

describe("CellEditor - Aggressive: NumericEditor Edge Cases", () => {
    it("getEditorCssClass should return numeric variant", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new NumericEditor(engine, sheet);

        expect(editor.getEditorCssClass()).toBe("cs-cell-editor--numeric");
    });

    it("getEditorAttributes should return correct attributes", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new NumericEditor(engine, sheet);

        const attrs = editor.getEditorAttributes();
        expect(attrs).toEqual({ type: "text", inputmode: "decimal" });
    });

    it("validateBeforeCommit should handle validateCellValue returning undefined", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new NumericEditor(engine, sheet);
        editor.activeRow = 0;
        editor.activeCol = 0;

        sheet.validateCellValue.mockReturnValue(undefined);
        expect(editor.validateBeforeCommit("123")).toBe(true);
    });

    it("validateBeforeCommit should handle validateCellValue returning null", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new NumericEditor(engine, sheet);
        editor.activeRow = 0;
        editor.activeCol = 0;

        sheet.validateCellValue.mockReturnValue(null);
        expect(editor.validateBeforeCommit("123")).toBe(true);
    });

    it("validateBeforeCommit should reject when validateCellValue returns false", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new NumericEditor(engine, sheet);
        editor.activeRow = 0;
        editor.activeCol = 0;

        sheet.validateCellValue.mockReturnValue(false);
        expect(editor.validateBeforeCommit("abc")).toBe(false);
    });
});

describe("CellEditor - Aggressive: SyncFontStyle", () => {
    it("show should apply font style from resolveStyle", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.resolveStyle.mockReturnValue({
            fontStyle: "italic",
            fontWeight: "bold",
            fontSize: 14,
            fontFamily: "Arial",
            textAlign: "center",
            color: "red",
            backgroundColor: "yellow",
        });
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(0, 0);

        expect(sheet.resolveStyle).toHaveBeenCalledWith(0, 0);
    });

    it("show should handle transparent backgroundColor", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.resolveStyle.mockReturnValue({
            backgroundColor: "transparent",
        });
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        expect(() => editor.show(0, 0)).not.toThrow();
    });

    it("show should handle missing style properties", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.resolveStyle.mockReturnValue({});
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        expect(() => editor.show(0, 0)).not.toThrow();
    });

    it("BUG: show() throws when resolveStyle returns null", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet.resolveStyle.mockReturnValue(null);
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        expect(() => editor.show(0, 0)).toThrow();
    });
});

describe("CellEditor - Aggressive: Lifecycle Race Conditions", () => {
    it("hideForScroll then show should reset scrollHiding", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(0, 0);
        editor.hideForScroll();
        editor.show(1, 1);

        expect(editor.activeRow).toBe(1);
        expect(editor.activeCol).toBe(1);
    });

    it("show then destroy then show should not crash", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(0, 0);
        editor.destroy();

        expect(() => editor.show(1, 1)).not.toThrow();
        expect(editor.activeRow).toBe(-1);
    });

    it("hide then hide should not crash", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(0, 0);
        editor.hide();
        editor.hide();

        expect(editor.activeRow).toBe(-1);
    });

    it("hideForScroll then restoreFromScroll then hideForScroll", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor, domElement } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.show(0, 0);
        editor.hideForScroll();
        editor.restoreFromScroll();
        editor.hideForScroll();

        expect(domElement.style.display).toBe("none");
    });

    it("setValue after destroy should not crash", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.destroy();
        expect(() => editor.setValue("test")).not.toThrow();
    });

    it("focus after destroy should not crash", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.destroy();
        expect(() => editor.focus()).not.toThrow();
    });

    it("getValue after destroy should return empty string", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const { editor } = createEditorWithDOM(CellEditor, engine, sheet);

        editor.destroy();
        expect(editor.getValue()).toBe("");
    });
});

describe("CellEditor - Aggressive: _batchFillRange Code Smell", () => {
    it("BUG: _batchFillRange is accessed via private property on sheet - fragile coupling", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        const editor = new CellEditor(engine, sheet);

        expect(sheet._batchFillRange).toBeNull();
    });

    it("BUG: delete sheet._batchFillRange uses delete operator - side effect on external object", () => {
        const engine = createMockRenderEngine();
        const sheet = createMockSheet();
        sheet._batchFillRange = { topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 };

        delete sheet._batchFillRange;

        expect(sheet._batchFillRange).toBeUndefined();
    });
});