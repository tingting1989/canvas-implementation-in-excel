import { CellEditor } from "./CellEditor.js";

/**
 * 日期编辑器
 *
 * 专门用于编辑日期类型单元格，支持 Date 对象和日期字符串的格式化显示。
 * 使用原生日期选择器模式，禁用文本选择光标模式。
 * 在值比较时特殊处理 NaN（两个 NaN 视为相等）。
 */
export class DateEditor extends CellEditor {
    /**
     * @private 私有字段 - 是否使用原生日期选择器
     * 为 true 时禁用文本选择光标模式，使用浏览器原生日期交互
     */
    #useNativePicker = true;

    /**
     * 获取编辑器附加的 CSS 类名
     * @returns 日期编辑器样式类名
     */
    getEditorCssClass(): string {
        return "cs-cell-editor--date";
    }

    /**
     * 编辑器 DOM 元素创建后的回调
     * 将 input 类型设置为 text 以支持自定义日期格式显示
     */
    afterCreateEditor(): void {
        (this.editor as HTMLInputElement).type = "text";
    }

    /**
     * 将原始值格式化为编辑器显示的字符串
     * Date 对象转换为 "YYYY-MM-DD" 格式，字符串直接返回
     *
     * @param rawValue - 原始值，可以是 Date 对象或字符串
     * @returns 格式化后的日期字符串
     */
    formatValueForEditor(rawValue: unknown): string {
        if (typeof rawValue === "string" && rawValue) {
            return rawValue;
        }
        if (rawValue instanceof Date) {
            return this.#toDateString(rawValue);
        }
        return String(rawValue ?? "");
    }

    /**
     * 设置编辑器的光标模式
     * 使用原生日期选择器时跳过光标设置，其他情况调用父类逻辑
     *
     * @param cursorMode - 光标模式
     */
    setCursorMode(cursorMode: string): void {
        if (this.#useNativePicker) return;
        super.setCursorMode(cursorMode);
    }

    /**
     * 提交前验证新值是否合法
     *
     * 增强逻辑：
     * 1. 列类型即时提示（降级时返回 "invalid"，允许通过）
     * 2. DataValidation 同步验证（决定是否阻止）
     *
     * @param newValue - 待提交的新值
     * @returns 验证通过返回 true
     */
    validateBeforeCommit(newValue: unknown): boolean {
        const typeResult = this.sheet!.validateCellValue(this.activeRow, this.activeCol, newValue);

        const dvPlugin = (this.sheet as any)?.getPlugin?.("dataValidation");
        if (dvPlugin?.active && dvPlugin.engine) {
            const dvResult = dvPlugin.engine.validateCellSync(this.activeRow, this.activeCol, newValue);
            if (dvResult && !dvResult.valid && dvResult.errorStyle === "stop") {
                dvPlugin.uiController?.showErrorTooltip(
                    this.activeRow,
                    this.activeCol,
                    dvResult.message || "输入值无效",
                    dvResult.errorStyle || "stop",
                );
                return false;
            }
        }

        return typeResult === true || typeResult === "invalid";
    }

    /**
     * 判断旧值与新值是否相等
     * 特殊处理 Date 对象和 NaN：两个 NaN 视为相等
     *
     * @param oldValue - 旧值
     * @param newValue - 新值
     * @returns 相等返回 true
     */
    areValuesEqual(oldValue: unknown, newValue: unknown): boolean {
        const oldMs = oldValue instanceof Date ? oldValue.getTime() : oldValue;
        const newMs = newValue instanceof Date ? newValue.getTime() : newValue;
        // NaN !== NaN，但两个 NaN 应视为相等的日期
        if (oldMs !== oldMs && newMs !== newMs) return true;
        return oldMs === newMs;
    }

    /**
     * @private 私有方法 - 将 Date 对象转换为 "YYYY-MM-DD" 格式字符串
     *
     * @param date - 日期对象
     * @returns 格式化后的日期字符串，无效日期返回空字符串
     */
    #toDateString(date: Date): string {
        if (!(date instanceof Date) || isNaN(date.getTime())) return "";
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
}
