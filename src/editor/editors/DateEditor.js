import { CellEditor } from "./CellEditor.js";

export class DateEditor extends CellEditor {
    #useNativePicker = true;

    getEditorCssClass() {
        return "cs-cell-editor--date";
    }

    afterCreateEditor() {
        this.editor.type = "text";
    }

    formatValueForEditor(rawValue) {
        // 直接返回原始字符串值
        if (typeof rawValue === "string" && rawValue) {
            return rawValue;
        }
        // 如果是 Date 对象，转换为 YYYY-MM-DD 格式
        if (rawValue instanceof Date) {
            return this.#toDateString(rawValue);
        }
        // 其他类型转为字符串
        return String(rawValue ?? "");
    }

    setCursorMode(cursorMode) {
        if (this.#useNativePicker) return;
        super.setCursorMode(cursorMode);
    }

    validateBeforeCommit(newValue) {
        const result = this.sheet.validateCellValue(this.activeRow, this.activeCol, newValue);
        return result === true || result === "invalid";
    }

    areValuesEqual(oldValue, newValue) {
        const oldMs = oldValue instanceof Date ? oldValue.getTime() : oldValue;
        const newMs = newValue instanceof Date ? newValue.getTime() : newValue;
        if (oldMs !== oldMs && newMs !== newMs) return true;
        return oldMs === newMs;
    }

    #toDateString(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return "";
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
}
