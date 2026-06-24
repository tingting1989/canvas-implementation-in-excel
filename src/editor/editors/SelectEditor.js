import { CellEditor } from "./CellEditor.js";

export class SelectEditor extends CellEditor {
    #source = [];
    #allowInvalid = false;
    #strict = false;

    getElementType() {
        return "select";
    }

    getEditorId() {
        return "select-editor";
    }

    getExtraCssText() {
        return `
            text-align: left;
            cursor: pointer;
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
        `;
    }

    afterShow(row, col) {
        const cellType = this.sheet.getCellTypeInstance(row, col);
        const editorOpts = cellType?.getEditorOptions?.() || {};
        this.#source = editorOpts.source || [];
        this.#allowInvalid = editorOpts.allowInvalid ?? false;
        this.#strict = editorOpts.strict ?? false;

        this.#buildOptions();
        this.#selectValue(this.originalValue);
    }

    validateBeforeCommit(newValue) {
        return this.sheet.validateCellValue(this.activeRow, this.activeCol, newValue) !== false;
    }

    bindEditorEvents() {
        this.editor.addEventListener("change", () => {
            this.editor.blur();
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
            option.value = String(item);
            option.textContent = String(item);
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