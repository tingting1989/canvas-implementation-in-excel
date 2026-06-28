import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CellEditor } from "@/editor/editors/CellEditor.js";
import { TextEditor } from "@/editor/editors/TextEditor.js";
import { NumericEditor } from "@/editor/editors/NumericEditor.js";
import { DateEditor } from "@/editor/editors/DateEditor.js";
import { SelectEditor } from "@/editor/editors/SelectEditor.js";
import { EVENT_NAMES } from "@/constants/eventNames.js";

describe("CellEditor 销毁与多实例", () => {
    let container;
    let canvas;
    let mockRenderEngine;
    let mockSheet;

    beforeEach(() => {
        container = document.createElement("div");
        container.style.width = "800px";
        container.style.height = "600px";
        document.body.appendChild(container);

        canvas = document.createElement("canvas");
        container.appendChild(canvas);

        // 创建 mock 对象
        mockRenderEngine = {
            canvas: canvas,
            canvasParent: container,
            viewW: 800,
            viewH: 600,
        };

        mockSheet = {
            cellStore: {
                get: vi.fn().mockReturnValue({ value: "" }),
            },
            selection: {
                getRange: vi.fn().mockReturnValue({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 }),
                getFocus: vi.fn().mockReturnValue([0, 0]),
            },
            rowColManager: {
                rowCount: 100,
                colCount: 26,
            },
            getHeaderWidth: vi.fn().mockReturnValue(40),
            getHeaderHeight: vi.fn().mockReturnValue(28),
            frozenColsWidth: 0,
            frozenRowsHeight: 0,
            fixedColumnsStart: 0,
            fixedRowsTop: 0,
            isDisabled: vi.fn().mockReturnValue(false),
            parseCellValue: vi.fn().mockImplementation((r, c, v) => v),
            setCell: vi.fn(),
            resolveStyle: vi.fn().mockReturnValue({
                fontStyle: "normal",
                fontWeight: "normal",
                fontSize: 12,
                fontFamily: "Segoe UI",
                textAlign: "left",
                color: "#222",
                backgroundColor: "#fff",
            }),
            getMerge: vi.fn().mockReturnValue(null),
            bus: {
                emit: vi.fn().mockReturnValue(true),
            },
        };
    });

    afterEach(() => {
        document.body.removeChild(container);
    });

    it("CE-01: 编辑器 DOM 移除 — destroy 后编辑器从 DOM 树移除", () => {
        const editor = new CellEditor(mockRenderEngine, mockSheet);
        editor.createEditor();
        
        // 验证编辑器已创建
        expect(container.querySelectorAll(".cs-cell-editor").length).toBe(1);
        
        editor.destroy();
        
        // 验证编辑器已移除
        expect(container.querySelectorAll(".cs-cell-editor").length).toBe(0);
    });

    it("CE-02: 编辑器事件移除 — blur/keydown/composition 事件被移除", () => {
        const editor = new CellEditor(mockRenderEngine, mockSheet);
        editor.createEditor();
        
        const inputEl = container.querySelector(".cs-cell-editor");
        const removeSpy = vi.spyOn(inputEl, "removeEventListener");
        
        editor.destroy();
        
        // 验证各种事件监听器都被移除
        const blurCalls = removeSpy.mock.calls.filter(call => call[0] === EVENT_NAMES.BLUR);
        const keydownCalls = removeSpy.mock.calls.filter(call => call[0] === EVENT_NAMES.KEYDOWN);
        const compositionCalls = removeSpy.mock.calls.filter(call => 
            call[0] === EVENT_NAMES.COMPOSITIONSTART || call[0] === EVENT_NAMES.COMPOSITIONEND
        );
        
        expect(blurCalls.length).toBeGreaterThan(0);
        expect(keydownCalls.length).toBeGreaterThan(0);
        expect(compositionCalls.length).toBeGreaterThan(0);
        
        removeSpy.mockRestore();
    });

    it("CE-03: 编辑器无 id 属性 — getEditorId() 已彻底删除", () => {
        const editor = new CellEditor(mockRenderEngine, mockSheet);
        editor.createEditor();
        
        const inputEl = container.querySelector(".cs-cell-editor");
        expect(inputEl.hasAttribute("id")).toBe(false);
        expect(inputEl.id).toBe("");
        
        editor.destroy();
    });

    it("CE-04: 编辑器使用 CSS class — 有 cs-cell-editor class", () => {
        const editor = new TextEditor(mockRenderEngine, mockSheet);
        editor.createEditor();
        
        const inputEl = container.querySelector(".cs-cell-editor");
        expect(inputEl.classList.contains("cs-cell-editor")).toBe(true);
        
        editor.destroy();
    });

    it("CE-05: NumericEditor CSS class — 有 cs-cell-editor--numeric", () => {
        const editor = new NumericEditor(mockRenderEngine, mockSheet);
        editor.createEditor();
        
        const inputEl = container.querySelector(".cs-cell-editor");
        expect(inputEl.classList.contains("cs-cell-editor")).toBe(true);
        expect(inputEl.classList.contains("cs-cell-editor--numeric")).toBe(true);
        
        editor.destroy();
    });

    it("CE-06: DateEditor CSS class — 有 cs-cell-editor--date", () => {
        const editor = new DateEditor(mockRenderEngine, mockSheet);
        editor.createEditor();
        
        const inputEl = container.querySelector(".cs-cell-editor");
        expect(inputEl.classList.contains("cs-cell-editor")).toBe(true);
        expect(inputEl.classList.contains("cs-cell-editor--date")).toBe(true);
        
        editor.destroy();
    });

    it("CE-07: SelectEditor CSS class — 有 cs-cell-editor--select", () => {
        const editor = new SelectEditor(mockRenderEngine, mockSheet);
        editor.createEditor();
        
        const selectEl = container.querySelector(".cs-cell-editor");
        expect(selectEl.classList.contains("cs-cell-editor")).toBe(true);
        expect(selectEl.classList.contains("cs-cell-editor--select")).toBe(true);
        
        editor.destroy();
    });

    it("CE-08: 多实例隔离 — 两个编辑器独立存在", () => {
        const editorA = new CellEditor(mockRenderEngine, mockSheet);
        const editorB = new CellEditor(mockRenderEngine, mockSheet);
        
        editorA.createEditor();
        editorB.createEditor();
        
        // 验证两个编辑器都存在
        const editors = container.querySelectorAll(".cs-cell-editor");
        expect(editors.length).toBe(2);
        
        // 验证两个编辑器是不同的元素
        expect(editors[0]).not.toBe(editors[1]);
        
        // 销毁一个
        editorA.destroy();
        
        // 验证只剩一个
        expect(container.querySelectorAll(".cs-cell-editor").length).toBe(1);
        
        editorB.destroy();
    });
});