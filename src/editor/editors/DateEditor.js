import { CellEditor } from "./CellEditor.js";

export class DateEditor extends CellEditor {
    #useNativePicker = true;

    getEditorId() {
        return "date-editor";
    }

    getExtraCssText() {
        return "text-align: center;";
    }

    getDefaultTextAlign() {
        return "center";
    }

    afterCreateEditor() {
        this.#useNativePicker = this.#supportsDateInput();
        this.editor.type = this.#useNativePicker ? "date" : "text";
    }

    formatValueForEditor(rawValue) {
        if (rawValue instanceof Date) {
            return this.#toDateString(rawValue);
        }
        if (this.#useNativePicker) {
            const parsed = this.#parseDateString(String(rawValue));
            return parsed ? this.#toDateString(parsed) : "";
        }
        return String(rawValue ?? "");
    }

    setCursorMode(cursorMode) {
        if (this.#useNativePicker) return;
        super.setCursorMode(cursorMode);
    }

    validateBeforeCommit(newValue) {
        return this.sheet.validateCellValue(this.activeRow, this.activeCol, newValue) !== false;
    }

    areValuesEqual(oldValue, newValue) {
        const oldMs = oldValue instanceof Date ? oldValue.getTime() : oldValue;
        const newMs = newValue instanceof Date ? newValue.getTime() : newValue;
        if (oldMs !== oldMs && newMs !== newMs) return true;
        return oldMs === newMs;
    }

    #supportsDateInput() {
        const input = document.createElement("input");
        input.setAttribute("type", "date");
        return input.type === "date";
    }

    #parseDateString(str) {
        if (!str || !str.trim()) return null;

        const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (isoMatch) {
            const y = parseInt(isoMatch[1], 10);
            const m = parseInt(isoMatch[2], 10) - 1;
            const d = parseInt(isoMatch[3], 10);
            const date = new Date(y, m, d);
            return isNaN(date.getTime()) ? null : date;
        }

        const slashMatch = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
        if (slashMatch) {
            const a = parseInt(slashMatch[1], 10);
            const b = parseInt(slashMatch[2], 10);
            const y = parseInt(slashMatch[3], 10);
            let date = new Date(y, b - 1, a);
            if (isNaN(date.getTime())) {
                date = new Date(y, a - 1, b);
            }
            return isNaN(date.getTime()) ? null : date;
        }

        const date = new Date(str);
        return isNaN(date.getTime()) ? null : date;
    }

    #toDateString(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return "";
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
}