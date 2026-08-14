import { TextEditor } from "./editors/index.js";
import { NumericEditor } from "./editors/NumericEditor.js";
import { DateEditor } from "./editors/DateEditor.js";
import { SelectEditor } from "./editors/SelectEditor.js";
import { TextareaEditor } from "./editors/TextareaEditor.js";

/** 编辑器实例类型（至少包含 CellEditor 的核心接口） */
interface CellEditorLike {
    /** 当前编辑的行号 */
    activeRow: number;
    /** 当前编辑的列号 */
    activeCol: number;
    /** 工作表引用 */
    sheet: any;
    /** 视口服务 */
    viewport?: any;
    /** Canvas上下文 */
    canvasContext?: any;
    /** 编辑器类型名（用于路由） */
    editorType?: string;
    /** 创建并初始化DOM元素 */
    createEditor(): void;
    /** 显示编辑器 */
    show(row: number, col: number, cursorMode?: string): void;
    /** 隐藏编辑器 */
    hide(): void;
    /** 销毁编辑器 */
    destroy(): void;
    /** 更新位置（可选） */
    updatePosition?(): void;
}

/**
 * 编辑器管理器 (Editor Manager)
 *
 * 采用门面模式（Facade Pattern）设计，统一管理所有类型的单元格编辑器。
 * 负责：
 * - 编辑器注册：维护编辑器类型 → 实例的映射关系
 * - 自动路由：根据单元格配置自动选择对应的编辑器
 * - 生命周期管理：统一创建、显示、隐藏、销毁编辑器
 * - 依赖注入：向所有编辑器注入共享服务（ViewportService、CanvasContext等）
 *
 * @class EditorManager
 */
export class EditorManager {
    /** 渲染引擎实例 */
    renderEngine: any;

    /** 当前工作表引用 */
    #sheet: any | null = null;

    /**
     * 已注册的编辑器映射表
     * key 为编辑器类型名（如 'text', 'numeric'），value 为编辑器实例
     */
    editors: Map<string, CellEditorLike> = new Map();

    /**
     * 创建编辑器管理器实例
     * @param renderEngine - 渲染引擎实例
     * @param sheet - 当前工作表实例
     */
    constructor(renderEngine: any, sheet: any) {
        this.renderEngine = renderEngine;
        this.#sheet = sheet;
        this.editors = new Map();
        this.#initEditors();
    }

    /**
     * 向所有已注册的编辑器注入 ViewportService
     * @param viewport - 视口服务实例
     */
    setViewport(viewport: any): void {
        for (const editor of this.editors.values()) {
            editor.viewport = viewport;
        }
    }

    /**
     * 向所有已注册的编辑器注入 CanvasContext
     * @param canvasContext - Canvas上下文实例
     */
    setCanvasContext(canvasContext: any): void {
        for (const editor of this.editors.values()) {
            editor.canvasContext = canvasContext;
        }
    }

    /** 获取当前关联的工作表 */
    get sheet(): any {
        return this.#sheet;
    }

    /** 设置当前关联的工作表（同时更新所有编辑器的工作表引用） */
    set sheet(value: any) {
        this.#sheet = value;
        for (const editor of this.editors.values()) {
            editor.sheet = value;
        }
    }

    /** 初始化所有内置编辑器 */
    #initEditors(): void {
        const textEditor = new TextEditor(this.renderEngine, this.#sheet);
        textEditor.createEditor();
        this.editors.set("text", textEditor as unknown as CellEditorLike);

        const numericEditor = new NumericEditor(this.renderEngine, this.#sheet);
        numericEditor.createEditor();
        this.editors.set("numeric", numericEditor as unknown as CellEditorLike);

        const dateEditor = new DateEditor(this.renderEngine, this.#sheet);
        dateEditor.createEditor();
        this.editors.set("date", dateEditor as unknown as CellEditorLike);

        const selectEditor = new SelectEditor(this.renderEngine, this.#sheet);
        selectEditor.createEditor();
        this.editors.set("select", selectEditor as unknown as CellEditorLike);

        const textareaEditor = new TextareaEditor(this.renderEngine, this.#sheet);
        textareaEditor.createEditor();
        this.editors.set("textarea", textareaEditor as unknown as CellEditorLike);
    }

    /**
     * 根据单元格位置获取对应的编辑器实例
     * @param row - 行号
     * @param col - 列号
     * @returns 匹配的编辑器实例
     */
    #getEditorForCell(row: number, col: number): CellEditorLike {
        if (this.#sheet) {
            const cellType = this.#sheet.getCellTypeInstance(row, col);
            if (cellType) {
                const editorType = cellType.editorType;
                const editor = this.editors.get(editorType);
                if (editor) return editor;
            }
        }
        return this.editors.get("text")!;
    }

    /**
     * 获取默认编辑器（text 编辑器）
     * @deprecated 推荐使用 getEditor("text") 替代
     */
    get editor(): CellEditorLike | undefined {
        return this.editors.get("text");
    }

    /**
     * 显示指定单元格的编辑器
     * @param row - 行号
     * @param col - 列号
     * @param cursorMode - 光标模式：'select' 全选 / 'end' 光标末尾
     */
    show(row: number, col: number, cursorMode: string = "select"): void {
        if (this.#sheet?.readOnly) return;

        const editor = this.#getEditorForCell(row, col);
        if (editor) {
            this.hide();
            editor.show(row, col, cursorMode);
        }
    }

    /** 隐藏所有编辑器 */
    hide(): void {
        for (const editor of this.editors.values()) {
            editor.hide();
        }
    }

    /**
     * 注册自定义编辑器
     * @param type - 编辑器类型名称
     * @param editor - 编辑器实例
     */
    addEditor(type: string, editor: CellEditorLike): void {
        this.editors.set(type, editor);
        editor.createEditor();
    }

    /**
     * 获取指定类型的编辑器实例
     * @param type - 编辑器类型名
     * @returns 编辑器实例，不存在返回 null
     */
    getEditor(type: string): CellEditorLike | null {
        return this.editors.get(type) || null;
    }

    /**
     * 获取当前正在显示的活动编辑器
     * @returns 活动编辑器实例，无则返回 null
     */
    getActiveEditor(): CellEditorLike | null {
        for (const editor of this.editors.values()) {
            if (editor.activeRow >= 0) return editor;
        }
        return null;
    }

    /** 更新当前活动编辑器的位置和大小 */
    updateActiveEditorPosition(): void {
        const activeEditor = this.getActiveEditor();
        if (activeEditor && typeof activeEditor.updatePosition === "function") {
            activeEditor.updatePosition();
        }
    }

    /** 销毁所有编辑器并释放资源 */
    destroy(): void {
        for (const editor of this.editors.values()) {
            editor.destroy();
        }
        this.editors.clear();
        this.renderEngine = null;
        this.#sheet = null;
    }
}
