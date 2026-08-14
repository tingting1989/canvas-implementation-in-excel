import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorManager } from "@/editor/EditorManager";

function createMockEditor(type: string = "text") {
    return {
        activeRow: -1,
        activeCol: -1,
        sheet: null as any,
        viewport: undefined as any,
        canvasContext: undefined as any,
        editorType: type,
        createEditor: vi.fn(),
        show: vi.fn(function (this: any, row: number, col: number) {
            this.activeRow = row;
            this.activeCol = col;
        }),
        hide: vi.fn(function (this: any) {
            this.activeRow = -1;
            this.activeCol = -1;
        }),
        destroy: vi.fn(),
        updatePosition: vi.fn(),
    };
}

function createMockSheet() {
    return {
        name: "Sheet1",
        readOnly: false,
        getCellTypeInstance: vi.fn(() => null),
        isDisabled: vi.fn(() => false),
        getMerge: vi.fn(() => null),
        cellStore: { get: vi.fn(() => null) },
        selection: {
            setActive: vi.fn(),
            setRange: vi.fn(),
            getRange: vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 })),
        },
        resolveStyle: vi.fn(() => ({})),
        parseCellValue: vi.fn((_r: number, _c: number, v: string) => v),
        validateCellValue: vi.fn(() => true),
        setCell: vi.fn(),
        getCellRect: vi.fn(() => ({ x: 0, y: 0, w: 80, h: 28 })),
        render: vi.fn(),
        beginBatch: vi.fn(),
        endBatch: vi.fn(),
        invalidateAll: vi.fn(),
        formatCellValue: vi.fn((_r: number, _c: number, v: unknown) => String(v ?? "")),
        getCellData: vi.fn(() => ""),
    };
}

function createMockRenderEngine() {
    return {
        render: vi.fn(),
    };
}

function createMockViewport() {
    return {
        getCellRect: vi.fn(() => ({ x: 100, y: 50, w: 80, h: 28 })),
        viewW: 800,
        viewH: 600,
        scrollToCell: vi.fn(),
    };
}

function setupManagerWithViewport(manager: EditorManager) {
    const viewport = createMockViewport();
    manager.setViewport(viewport);
}

describe("EditorManager", () => {
    let mockRenderEngine: any;
    let mockSheet: any;

    beforeEach(() => {
        mockRenderEngine = createMockRenderEngine();
        mockSheet = createMockSheet();
    });

    describe("构造函数和基础属性", () => {
        it("EM-01: 应正确创建实例", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            expect(manager).toBeInstanceOf(EditorManager);
        });

        it("EM-02: 应保存 renderEngine 引用", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            expect(manager.renderEngine).toBe(mockRenderEngine);
        });

        it("EM-03: 应保存 sheet 引用", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            expect(manager.sheet).toBe(mockSheet);
        });

        it("EM-04: editors 应为 Map 实例", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            expect(manager.editors).toBeInstanceOf(Map);
        });

        it("EM-05: 应注册5个内置编辑器", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            expect(manager.editors.size).toBe(5);
            expect(manager.editors.has("text")).toBe(true);
            expect(manager.editors.has("numeric")).toBe(true);
            expect(manager.editors.has("date")).toBe(true);
            expect(manager.editors.has("select")).toBe(true);
            expect(manager.editors.has("textarea")).toBe(true);
        });
    });

    describe("sheet getter/setter", () => {
        it("EM-06: getter 返回当前工作表", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            expect(manager.sheet).toBe(mockSheet);
        });

        it("EM-07: setter 更新所有编辑器的 sheet 引用", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            const newSheet = createMockSheet();
            newSheet.name = "Sheet2";
            manager.sheet = newSheet;
            expect(manager.sheet).toBe(newSheet);
            for (const editor of manager.editors.values()) {
                expect(editor.sheet).toBe(newSheet);
            }
        });
    });

    describe("setViewport()", () => {
        it("EM-08: 应向所有编辑器注入 viewport", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            const viewport = { getCellRect: vi.fn() };
            manager.setViewport(viewport);
            for (const editor of manager.editors.values()) {
                expect(editor.viewport).toBe(viewport);
            }
        });
    });

    describe("setCanvasContext()", () => {
        it("EM-09: 应向所有编辑器注入 canvasContext", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            const canvasContext = { canvas: null };
            manager.setCanvasContext(canvasContext);
            for (const editor of manager.editors.values()) {
                expect(editor.canvasContext).toBe(canvasContext);
            }
        });
    });

    describe("addEditor()", () => {
        it("EM-10: 应注册自定义编辑器", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            const customEditor = createMockEditor("custom");
            manager.addEditor("custom", customEditor);
            expect(manager.editors.has("custom")).toBe(true);
            expect(manager.editors.get("custom")).toBe(customEditor);
        });

        it("EM-11: 注册时应自动调用 createEditor", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            const customEditor = createMockEditor("custom");
            manager.addEditor("custom", customEditor);
            expect(customEditor.createEditor).toHaveBeenCalled();
        });

        it("EM-12: 可覆盖内置编辑器", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            const customTextEditor = createMockEditor("text");
            manager.addEditor("text", customTextEditor);
            expect(manager.editors.get("text")).toBe(customTextEditor);
        });
    });

    describe("getEditor()", () => {
        it("EM-13: 获取已注册的编辑器", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            const textEditor = manager.getEditor("text");
            expect(textEditor).not.toBeNull();
        });

        it("EM-14: 获取未注册的类型返回 null", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            expect(manager.getEditor("nonexistent")).toBeNull();
        });
    });

    describe("editor (deprecated getter)", () => {
        it("EM-15: 返回 text 编辑器", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            const textEditor = manager.editor;
            expect(textEditor).not.toBeNull();
            expect(textEditor).toBe(manager.editors.get("text"));
        });
    });

    describe("show()", () => {
        it("EM-16: 只读工作表不显示编辑器", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            setupManagerWithViewport(manager);
            mockSheet.readOnly = true;
            const textEditor = manager.getEditor("text")!;
            const beforeRow = textEditor.activeRow;
            manager.show(0, 0);
            expect(textEditor.activeRow).toBe(beforeRow);
        });

        it("EM-17: 显示编辑器前先隐藏其他编辑器", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            setupManagerWithViewport(manager);
            const textEditor = manager.getEditor("text")!;
            textEditor.activeRow = 5;
            textEditor.activeCol = 3;
            manager.show(0, 0);
            expect(textEditor.activeRow).toBe(0);
            expect(textEditor.activeCol).toBe(0);
        });

        it("EM-18: 应调用编辑器的 show 方法", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            setupManagerWithViewport(manager);
            const textEditor = manager.getEditor("text")!;
            const showSpy = vi.spyOn(textEditor, "show");
            manager.show(2, 3, "end");
            expect(showSpy).toHaveBeenCalledWith(2, 3, "end");
        });

        it("EM-19: 默认 cursorMode 为 select", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            setupManagerWithViewport(manager);
            const textEditor = manager.getEditor("text")!;
            const showSpy = vi.spyOn(textEditor, "show");
            manager.show(0, 0);
            expect(showSpy).toHaveBeenCalledWith(0, 0, "select");
        });

        it("EM-20: 根据单元格类型路由到对应编辑器", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            setupManagerWithViewport(manager);
            mockSheet.getCellTypeInstance = vi.fn(() => ({ editorType: "select" }));
            const selectEditor = manager.getEditor("select")!;
            const showSpy = vi.spyOn(selectEditor, "show");
            manager.show(0, 0);
            expect(showSpy).toHaveBeenCalled();
        });

        it("EM-21: 未知编辑器类型回退到 text", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            setupManagerWithViewport(manager);
            mockSheet.getCellTypeInstance = vi.fn(() => ({ editorType: "unknown_type" }));
            const textEditor = manager.getEditor("text")!;
            const showSpy = vi.spyOn(textEditor, "show");
            manager.show(0, 0);
            expect(showSpy).toHaveBeenCalled();
        });
    });

    describe("hide()", () => {
        it("EM-22: 应隐藏所有编辑器（activeRow 重置为 -1）", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            const textEditor = manager.getEditor("text")!;
            textEditor.activeRow = 3;
            textEditor.activeCol = 2;
            manager.hide();
            expect(textEditor.activeRow).toBe(-1);
            expect(textEditor.activeCol).toBe(-1);
        });

        it("EM-23: 所有编辑器均被隐藏", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            manager.hide();
            for (const editor of manager.editors.values()) {
                expect(editor.activeRow).toBe(-1);
            }
        });
    });

    describe("getActiveEditor()", () => {
        it("EM-24: 无活动编辑器时返回 null", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            expect(manager.getActiveEditor()).toBeNull();
        });

        it("EM-25: 有活动编辑器时返回该实例", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            const textEditor = manager.getEditor("text")!;
            textEditor.activeRow = 3;
            textEditor.activeCol = 2;
            const active = manager.getActiveEditor();
            expect(active).toBe(textEditor);
        });

        it("EM-26: 返回第一个 activeRow >= 0 的编辑器", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            const numericEditor = manager.getEditor("numeric")!;
            numericEditor.activeRow = 1;
            const active = manager.getActiveEditor();
            expect(active).not.toBeNull();
            expect(active!.activeRow).toBeGreaterThanOrEqual(0);
        });
    });

    describe("updateActiveEditorPosition()", () => {
        it("EM-27: 无活动编辑器时不抛异常", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            expect(() => manager.updateActiveEditorPosition()).not.toThrow();
        });

        it("EM-28: 有活动编辑器时调用其 updatePosition", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            setupManagerWithViewport(manager);
            const textEditor = manager.getEditor("text")!;
            textEditor.activeRow = 0;
            textEditor.activeCol = 0;
            const updateSpy = vi.spyOn(textEditor, "updatePosition");
            manager.updateActiveEditorPosition();
            expect(updateSpy).toHaveBeenCalled();
        });
    });

    describe("destroy()", () => {
        it("EM-29: 销毁后 editors 为空", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            manager.destroy();
            expect(manager.editors.size).toBe(0);
        });

        it("EM-30: 销毁后 renderEngine 为 null", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            manager.destroy();
            expect(manager.renderEngine).toBeNull();
        });

        it("EM-31: 销毁后 sheet 为 null", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            manager.destroy();
            expect(manager.sheet).toBeNull();
        });

        it("EM-32: 多次 destroy 不抛异常", () => {
            const manager = new EditorManager(mockRenderEngine, mockSheet);
            expect(() => { manager.destroy(); manager.destroy(); }).not.toThrow();
        });
    });
});