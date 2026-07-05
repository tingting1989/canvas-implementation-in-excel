import { CellEditor } from "./CellEditor.js";
import { CONFIG } from "@/constants/config";

export class SelectEditor extends CellEditor {
    #source = [];
    #allowInvalid = false;
    #strict = false;

    getElementType() {
        return "select";
    }

    getEditorCssClass() {
        return "cs-cell-editor--select";
    }

    afterShow(row, col) {
        const cellType = this.sheet.getCellTypeInstance(row, col);
        const editorOpts = cellType?.getEditorOptions?.() || {};
        this.#source = editorOpts.source || [];
        this.#allowInvalid = editorOpts.allowInvalid ?? false;
        this.#strict = editorOpts.strict ?? false;

        this.#buildOptions();
        this.#selectValue(this.originalValue);

        if (this.editor) {
            const editorTop = parseInt(this.editor.style.top, 10) || 0;
            const viewH = this.viewport?.viewH ?? Infinity;
            const maxAllowed = Math.max(0, viewH - editorTop);
            this.editor.style.maxHeight = maxAllowed + "px";
        }
    }

    validateBeforeCommit(newValue) {
        return this.sheet.validateCellValue(this.activeRow, this.activeCol, newValue) !== false;
    }

    bindEditorEvents() {
        this.trackEvent(this.editor, "change", () => {
            this.editor.blur();
        });
        this.trackEvent(this.editor, "wheel", (e) => {
            e.stopPropagation();
        });
    }

    setCursorMode() {}

    #buildOptions() {
        this.editor.innerHTML = "";

        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = this.#allowInvalid ? "— 自定义输入 —" : "— 请选择 —";
        this.editor.appendChild(emptyOption);

        for (const item of this.#source) {
            const option = document.createElement("option");
            if (item !== null && typeof item === "object") {
                option.value = String(item.value ?? "");
                option.textContent = String(item.label ?? item.value ?? "");
            } else {
                option.value = String(item);
                option.textContent = String(item);
            }
            this.editor.appendChild(option);
        }
    }

    #selectValue(value) {
        const strValue = String(value ?? "");
        for (let i = 0; i < this.editor.options.length; i++) {
            if (this.editor.options[i].value === strValue) {
                this.editor.selectedIndex = i;
                return;
            }
        }
        this.editor.selectedIndex = 0;
    }
}
