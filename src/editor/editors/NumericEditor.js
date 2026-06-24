import { CellEditor } from "./CellEditor.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";

export class NumericEditor extends CellEditor {
    getEditorId() {
        return "numeric-editor";
    }

    getExtraCssText() {
        return "text-align: right;";
    }

    getDefaultTextAlign() {
        return "right";
    }

    getEditorAttributes() {
        return { type: "text", inputmode: "decimal" };
    }

    getEditorValue() {
        return this.editor?.value?.trim() ?? "";
    }

    validateBeforeCommit(newValue) {
        return this.sheet.validateCellValue(this.activeRow, this.activeCol, newValue) !== false;
    }

    bindEditorEvents() {
        this.editor.addEventListener(EVENT_NAMES.INPUT, (e) => this.#onInput(e));
        this.editor.addEventListener(EVENT_NAMES.PASTE, (e) => this.#onPaste(e));
    }

    #onInput(e) {
        if (this.composing) return;
        const value = this.editor.value;
        const cleaned = value.replace(/[^0-9.\-eE]/g, "");

        if (cleaned !== value) {
            const start = this.editor.selectionStart;
            const diff = value.length - cleaned.length;
            this.editor.value = cleaned;
            this.editor.setSelectionRange(start - diff, start - diff);
        }
    }

    #onPaste(e) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData("text");
        const num = parseFloat(text);
        if (!isNaN(num)) {
            this.editor.value = String(num);
        }
    }
}
