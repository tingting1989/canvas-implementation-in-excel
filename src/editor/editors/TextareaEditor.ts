import { CellEditor } from "./CellEditor.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";
import { CONFIG } from "../../constants/config.js";

/**
 * 多行文本编辑器
 *
 * 使用 `<textarea>` 元素支持多行文本编辑，具有自动调整高度、
 * 滚轮事件隔离、Ctrl+Enter 提交等特性。
 * 高度根据内容自动扩展，但不超过可视区域底部。
 */
export class TextareaEditor extends CellEditor {
    /**
     * @private 私有字段 - 编辑器最小高度
     * 初始显示时的单元格高度，自动调整时不会低于此值
     */
    #minHeight = 0;

    /**
     * 获取编辑器 DOM 元素类型
     * @returns "textarea" 元素类型
     */
    getElementType(): string {
        return "textarea";
    }

    /**
     * 获取编辑器附加的 CSS 类名
     * @returns 多行文本编辑器样式类名
     */
    getEditorCssClass(): string {
        return "cs-cell-editor--textarea";
    }

    /**
     * 获取编辑器 DOM 元素的附加属性
     * 设置初始行数为 1，可选的 maxLength 限制
     * @returns 属性键值对
     */
    getEditorAttributes(): Record<string, string | number> {
        const attrs: Record<string, string | number> = {
            rows: 1,
        };
        if ((this as unknown as { options?: { maxLength?: number } }).options?.maxLength) {
            attrs.maxLength = (this as unknown as { options: { maxLength: number } }).options.maxLength;
        }
        return attrs;
    }

    /**
     * 读取指定单元格的原始值
     * 优先返回公式字符串，其次返回单元格值
     *
     * @param row - 行号
     * @param col - 列号
     * @returns 单元格原始值
     */
    readCellValue(row: number, col: number): unknown {
        const cell = this.sheet!.cellStore.get(row, col);
        if (cell?.formula) return cell.formula;
        return cell?.value ?? "";
    }

    /**
     * 将原始值格式化为编辑器显示的字符串
     *
     * @param rawValue - 原始值
     * @returns 格式化后的字符串
     */
    formatValueForEditor(rawValue: unknown): string {
        return String(rawValue ?? "");
    }

    /**
     * 获取编辑器当前输入的值
     * @returns textarea 当前值
     */
    getEditorValue(): string {
        return (this.editor as HTMLTextAreaElement)?.value ?? "";
    }

    /**
     * 编辑器 DOM 元素创建后的回调
     * 设置 textarea 的初始样式：禁止调整大小、隐藏溢出、设置行高和换行
     */
    afterCreateEditor(): void {
        if (this.editor) {
            this.editor.style.resize = "none";
            this.editor.style.overflow = "hidden";
            this.editor.style.lineHeight = String(CONFIG.TEXTAREA_LINE_HEIGHT_RATIO);
            this.editor.style.paddingTop = "2px";
            this.editor.style.whiteSpace = "pre-wrap";
            this.editor.style.wordWrap = "break-word";
        }
    }

    /**
     * 编辑器显示后的回调
     * 记录最小高度，设置行高为像素值，限制最大高度不超过可视区域，
     * 并触发首次自动调整高度
     *
     * @param _row - 行号
     * @param _col - 列号
     * @param _cursorMode - 光标模式
     */
    afterShow(_row: number, _col: number, _cursorMode: string): void {
        if (this.editor) {
            this.#minHeight = parseInt(this.editor.style.height, 10) || 0;
            const fontSize = parseFloat(this.editor.style.fontSize) || (CONFIG.DEFAULT_FONT_SIZE as number);
            const lineHeight = fontSize * (CONFIG.TEXTAREA_LINE_HEIGHT_RATIO as number);
            this.editor.style.lineHeight = lineHeight + "px";

            // 限制最大高度不超过可视区域底部
            const editorTop = parseInt(this.editor.style.top, 10) || 0;
            const viewH = this.viewport?.viewH ?? Infinity;
            const maxAllowed = Math.max(0, viewH - editorTop);
            this.editor.style.maxHeight = maxAllowed + "px";
        }
        this.#autoResize();
    }

    /**
     * 绑定编辑器特有的事件监听器
     * 注册 input 事件（自动调整高度）、keydown 事件（多行编辑快捷键）、
     * wheel 事件（阻止冒泡避免触发画布滚动）
     */
    bindEditorEvents(): void {
        if (!this.editor) return;
        this.trackEvent(this.editor, "input", () => this.#autoResize());
        this.trackEvent(this.editor, EVENT_NAMES.KEYDOWN, (e: Event) => this.#onTextareaKeyDown(e as KeyboardEvent));
        this.trackEvent(this.editor, EVENT_NAMES.WHEEL, (e: Event) => {
            e.stopPropagation();
        });
    }

    /**
     * @private 私有方法 - textarea 键盘按键处理
     *
     * 按键行为：
     * - Enter（无修饰键）：在编辑器内换行
     * - Ctrl/Cmd+Enter：提交编辑
     * - Escape：取消编辑，恢复原始值
     * - Tab：提交编辑（不移动焦点）
     *
     * 设计说明：父类 CellEditor#onKeyDown 已通过 getElementType() === "textarea"
     * 判断跳过 Enter/Tab 的默认提交+移动行为，此处只需定义 textarea 特有的按键逻辑。
     *
     * @param e - 键盘事件
     */
    #onTextareaKeyDown(e: KeyboardEvent): void {
        if (this.composing) return;

        // 普通 Enter：在 textarea 内换行（父类 #onKeyDown 已跳过 textarea 的 Enter 处理）
        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
            return;
        }

        // Ctrl+Enter：提交编辑
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            (this.editor as HTMLTextAreaElement).blur();
            return;
        }

        // Escape：取消编辑
        if (e.key === "Escape") {
            e.preventDefault();
            (this.editor as HTMLTextAreaElement).value = this.formatValueForEditor(this.originalValue);
            delete this.sheet!._batchFillRange;
            (this.editor as HTMLTextAreaElement).blur();
            return;
        }

        // Tab：提交编辑（不移动焦点）
        if (e.key === "Tab") {
            e.preventDefault();
            (this.editor as HTMLTextAreaElement).blur();
            return;
        }
    }

    /**
     * @private 私有方法 - 自动调整 textarea 高度
     * 根据内容滚动高度调整编辑器高度，在最小高度和最大高度之间取值，
     * 内容超出最大高度时显示滚动条
     */
    #autoResize(): void {
        if (!this.editor) return;
        const textarea = this.editor as HTMLTextAreaElement;
        textarea.style.height = "auto";
        const scrollH = textarea.scrollHeight;
        const maxH = parseInt(textarea.style.maxHeight, 10) || scrollH;
        const targetH = Math.max(Math.min(scrollH, maxH), this.#minHeight);
        textarea.style.height = targetH + "px";
        // 内容超出最大高度时显示滚动条
        textarea.style.overflow = scrollH > maxH ? "auto" : "hidden";
    }

    /**
     * 设置编辑器的光标模式
     * "end" 模式将光标移到末尾并滚动到底部，其他模式不处理
     *
     * @param cursorMode - 光标模式
     */
    setCursorMode(cursorMode: string): void {
        if (!this.editor) return;
        if (cursorMode === "end") {
            const textarea = this.editor as HTMLTextAreaElement;
            const len = textarea.value.length;
            textarea.setSelectionRange(len, len);
            textarea.scrollTop = textarea.scrollHeight;
        }
    }
}
