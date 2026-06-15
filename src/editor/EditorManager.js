import { TextEditor } from "./editors/index.js";

/**
 * 编辑器管理器（门面模式）
 * 统一管理所有类型的单元格编辑器（文本、公式等）
 * 对外提供 show/hide/getEditor 等接口，隐藏编辑器实现细节
 */
export class EditorManager {
    #sheet = null;

    /**
     * @param {import("../render/RenderEngine.js").RenderEngine} renderEngine - 渲染引擎
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     */
    constructor(renderEngine, sheet) {
        this.renderEngine = renderEngine;
        this.#sheet = sheet;
        /** 已注册的编辑器映射表，key 为编辑器类型名 */
        this.editors = new Map();

        this.#initEditors();
    }

    get sheet() {
        return this.#sheet;
    }

    set sheet(value) {
        this.#sheet = value;
        for (const editor of this.editors.values()) {
            editor.sheet = value;
        }
    }

    /** 初始化默认编辑器 */
    #initEditors() {
        this.editors.set("text", new TextEditor(this.renderEngine, this.sheet));
        this.editors.get("text").createEditor();
    }

    /**
     * 获取当前活动编辑器（默认为文本编辑器）
     * 兼容旧接口
     */
    get editor() {
        return this.editors.get("text");
    }

    /**
     * 显示指定单元格的编辑器
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {'select'|'end'} cursorMode - 光标模式（透传给 TextEditor）
     */
    show(row, col, cursorMode = "select") {
        const textEditor = this.editors.get("text");
        if (textEditor) {
            textEditor.show(row, col, cursorMode);
        }
    }

    /** 隐藏所有编辑器 */
    hide() {
        for (const editor of this.editors.values()) {
            editor.hide();
        }
    }

    /**
     * 注册自定义编辑器
     *
     * @param {string} type - 编辑器类型名（如 'formula', 'date' 等）
     * @param {object} editor - 编辑器实例，需实现 createEditor/show/hide/destroy 方法
     */
    addEditor(type, editor) {
        this.editors.set(type, editor);
        editor.createEditor();
    }

    /**
     * 获取指定类型的编辑器
     *
     * @param {string} type - 编辑器类型名
     * @returns {object|null}
     */
    getEditor(type) {
        return this.editors.get(type) || null;
    }

    /** 销毁所有编辑器，释放资源 */
    destroy() {
        for (const editor of this.editors.values()) {
            editor.destroy();
        }
        this.editors.clear();
        this.renderEngine = null;
        this.sheet = null;
    }
}