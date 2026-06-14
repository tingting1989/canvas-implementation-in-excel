import {CONFIG} from "../../core/constants.js";

/**
 * 单元格编辑器基类
 * 定义编辑器的通用接口
 */
export class CellEditor {
    /**
     * @param {import("../../render/RenderEngine.js").RenderEngine} renderEngine
     * @param {import("../../workbook/Sheet.js").Sheet} sheet
     */
    constructor(renderEngine, sheet) {
        this.renderEngine = renderEngine;
        this.sheet = sheet;
        this.editor = null;
        this.activeRow = -1;
        this.activeCol = -1;
    }

    /**
     * 创建编辑器 DOM
     */
    createEditor() {
    }

    /**
     * 显示编辑器
     * @param {number} row
     * @param {number} col
     */
    show(row, col) {
    }

    /**
     * 隐藏编辑器
     */
    hide() {
        if (this.editor) {
            this.editor.style.display = "none";
        }
        this.activeRow = -1;
        this.activeCol = -1;
    }

    /**
     * 获取编辑器值
     * @returns {string|number}
     */
    getValue() {
        return this.editor?.value ?? "";
    }

    /**
     * 设置编辑器值
     * @param {string|number} value
     */
    setValue(value) {
        if (this.editor) {
            this.editor.value = String(value);
        }
    }

    /**
     * 聚焦编辑器
     */
    focus() {
        this.editor?.focus();
    }

    /**
     * 销毁编辑器
     */
    destroy() {
        if (this.editor && this.editor.parentElement) {
            this.editor.parentElement.removeChild(this.editor);
        }
        this.editor = null;
        this.renderEngine = null;
        this.sheet = null;
    }
}