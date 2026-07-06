import { CellEditor } from "./CellEditor.js";
import { EVENT_NAMES } from "@/constants/eventNames";
import { CONFIG } from "@/constants/config";

/**
 * 多行文本编辑器
 *
 * 使用 <textarea> 元素替代 <input>，支持：
 * - 多行文本输入（Enter 换行）
 * - Ctrl+Enter / Tab 提交
 * - 自动调整高度（在单元格范围内）
 */
export class TextareaEditor extends CellEditor {
    /** 编辑器最小高度（等于单元格高度） */
    #minHeight = 0;

    getElementType() {
        return "textarea";
    }

    getEditorCssClass() {
        return "cs-cell-editor--textarea";
    }

    getEditorAttributes() {
        const attrs = {
            rows: 1,
        };
        if (this.options?.maxLength) {
            attrs.maxLength = this.options.maxLength;
        }
        return attrs;
    }

    readCellValue(row, col) {
        const cell = this.sheet.cellStore.get(row, col);
        return cell?.value ?? "";
    }

    formatValueForEditor(rawValue) {
        return String(rawValue ?? "");
    }

    getEditorValue() {
        return this.editor?.value ?? "";
    }

    afterCreateEditor() {
        if (this.editor) {
            this.editor.style.resize = "none";
            this.editor.style.overflow = "hidden";
            this.editor.style.lineHeight = CONFIG.TEXTAREA_LINE_HEIGHT_RATIO;
            this.editor.style.paddingTop = "2px";
            this.editor.style.whiteSpace = "pre-wrap";
            this.editor.style.wordWrap = "break-word";
        }
    }

    afterShow(_row, _col, _cursorMode) {
        if (this.editor) {
            this.#minHeight = parseInt(this.editor.style.height, 10) || 0;
            const fontSize = parseFloat(this.editor.style.fontSize) || CONFIG.DEFAULT_FONT_SIZE;
            const lineHeight = fontSize * CONFIG.TEXTAREA_LINE_HEIGHT_RATIO;
            this.editor.style.lineHeight = lineHeight + "px";

            const editorTop = parseInt(this.editor.style.top, 10) || 0;
            const viewH = this.viewport?.viewH ?? Infinity;
            const maxAllowed = Math.max(0, viewH - editorTop);
            this.editor.style.maxHeight = maxAllowed + "px";
        }
        this.#autoResize();
    }

    bindEditorEvents() {
        if (!this.editor) return;
        this.trackEvent(this.editor, "input", () => this.#autoResize());
        this.trackEvent(this.editor, EVENT_NAMES.KEYDOWN, (e) => this.#onTextareaKeyDown(e));
        this.trackEvent(this.editor, EVENT_NAMES.WHEEL, (e) => {
            e.stopPropagation();
        });
    }

    #onTextareaKeyDown(e) {
        if (this.composing) return;

        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
            return;
        }

        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.editor.blur();
            return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            this.editor.value = this.formatValueForEditor(this.originalValue);
            delete this.sheet._batchFillRange;
            this.editor.blur();
            return;
        }

        if (e.key === "Tab") {
            e.preventDefault();
            this.editor.blur();
            return;
        }
    }

    #autoResize() {
        if (!this.editor) return;
        this.editor.style.height = "auto";
        const scrollH = this.editor.scrollHeight;
        const maxH = parseInt(this.editor.style.maxHeight, 10) || scrollH;
        const targetH = Math.max(Math.min(scrollH, maxH), this.#minHeight);
        this.editor.style.height = targetH + "px";
        this.editor.style.overflow = scrollH > maxH ? "auto" : "hidden";
    }

    setCursorMode(cursorMode) {
        if (!this.editor) return;
        if (cursorMode === "end") {
            const len = this.editor.value.length;
            this.editor.setSelectionRange(len, len);
            this.editor.scrollTop = this.editor.scrollHeight;
        }
    }
}