import { CellEditor } from "./CellEditor.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";

/**
 * 数字编辑器
 *
 * 专门用于编辑数字类型单元格，限制输入为数字字符（0-9、小数点、负号、科学计数法 e/E）。
 * 在输入时实时过滤非法字符，粘贴时仅接受有效的数字内容。
 */
export class NumericEditor extends CellEditor {
    /**
     * 获取编辑器附加的 CSS 类名
     * @returns 数字编辑器样式类名
     */
    getEditorCssClass(): string {
        return "cs-cell-editor--numeric";
    }

    /**
     * 获取编辑器 DOM 元素的附加属性
     * 设置 inputmode 为 decimal 以在移动端弹出数字键盘
     * @returns 属性键值对
     */
    getEditorAttributes(): Record<string, string> {
        return { type: "text", inputmode: "decimal" };
    }

    /**
     * 获取编辑器当前输入的值
     * 去除首尾空白后返回
     * @returns 去除空白后的编辑器值
     */
    getEditorValue(): string {
        return (this.editor as HTMLInputElement)?.value?.trim() ?? "";
    }

    /**
     * 提交前验证新值是否合法
     *
     * 增强逻辑：
     * 1. 列类型即时提示（不阻止，仅显示红色边框等）
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

        return typeResult !== false;
    }

    /**
     * 绑定编辑器特有的事件监听器
     * 注册 input 事件（实时过滤非法字符）和 paste 事件（仅粘贴数字）
     */
    bindEditorEvents(): void {
        this.trackEvent(this.editor!, EVENT_NAMES.INPUT, (e: Event) => this.#onInput(e as InputEvent));
        this.trackEvent(this.editor!, EVENT_NAMES.PASTE, (e: Event) => this.#onPaste(e as ClipboardEvent));
    }

    /**
     * @private 私有方法 - 输入事件处理
     * 实时过滤非数字字符（仅允许 0-9、小数点、负号、e/E），
     * 过滤后保持光标位置不变
     *
     * @param _e - 输入事件
     */
    #onInput(_e: InputEvent): void {
        if (this.composing) return;
        const inputEl = this.editor as HTMLInputElement;
        const value = inputEl.value;
        // 仅保留数字、小数点、负号和科学计数法字符
        const cleaned = value.replace(/[^0-9.\-eE]/g, "");

        if (cleaned !== value) {
            const start = inputEl.selectionStart ?? 0;
            const diff = value.length - cleaned.length;
            inputEl.value = cleaned;
            // 修正光标位置，补偿被过滤的字符数
            inputEl.setSelectionRange(start - diff, start - diff);
        }
    }

    /**
     * @private 私有方法 - 粘贴事件处理
     * 阻止默认粘贴行为，仅当剪贴板内容为有效数字时才填入编辑器
     *
     * @param e - 剪贴板事件
     */
    #onPaste(e: ClipboardEvent): void {
        e.preventDefault();
        const text = (e.clipboardData || (window as unknown as { clipboardData: DataTransfer }).clipboardData).getData("text");
        const num = parseFloat(text);
        if (!isNaN(num)) {
            (this.editor as HTMLInputElement).value = String(num);
        }
    }
}
