import { CellEditor } from "./CellEditor.js";

/** 下拉选项数据项（含值和标签） */
interface SelectSourceItem {
    value: string;
    label: string;
}

/**
 * 下拉选择编辑器
 *
 * 使用 `<select>` 元素提供下拉选项列表，支持字符串和对象两种选项格式。
 * 可配置是否允许自定义输入（allowInvalid）和是否严格模式（strict）。
 * 选项数据从单元格类型的 getEditorOptions() 方法动态获取。
 */
export class SelectEditor extends CellEditor {
    /**
     * @private 私有字段 - 下拉选项数据源
     * 支持字符串数组或 { value, label } 对象数组
     */
    #source: (string | SelectSourceItem)[] = [];

    /**
     * @private 私有字段 - 是否允许无效输入
     * 为 true 时显示"自定义输入"占位选项
     */
    #allowInvalid = false;

    /**
     * @private 私有字段 - 是否严格模式
     * 为 true 时仅允许从选项列表中选择
     */
    #strict = false;

    /**
     * 获取编辑器 DOM 元素类型
     * @returns "select" 元素类型
     */
    getElementType(): string {
        return "select";
    }

    /**
     * 获取编辑器附加的 CSS 类名
     * @returns 选择编辑器样式类名
     */
    getEditorCssClass(): string {
        return "cs-cell-editor--select";
    }

    /**
     * 编辑器显示后的回调
     * 从单元格类型获取选项配置，构建下拉选项并选中当前值，
     * 同时限制下拉列表的最大高度不超过可视区域
     *
     * @param row - 行号
     * @param col - 列号
     */
    afterShow(row: number, col: number): void {
        const cellType = this.sheet!.getCellTypeInstance(row, col);
        const editorOpts = cellType?.getEditorOptions?.() || ({} as Record<string, unknown>);
        this.#source = (editorOpts.source as (string | SelectSourceItem)[]) || [];
        this.#allowInvalid = (editorOpts.allowInvalid as boolean) ?? false;
        this.#strict = (editorOpts.strict as boolean) ?? false;

        this.#buildOptions();
        this.#selectValue(this.originalValue);

        if (this.editor) {
            // 限制下拉列表高度不超过可视区域底部
            const editorTop = parseInt(this.editor.style.top, 10) || 0;
            const viewH = this.viewport?.viewH ?? Infinity;
            const maxAllowed = Math.max(0, viewH - editorTop);
            this.editor.style.maxHeight = maxAllowed + "px";
        }
    }

    /**
     * 提交前验证新值是否合法
     * 验证结果非 false 时允许提交
     *
     * @param newValue - 待提交的新值
     * @returns 验证通过返回 true
     */
    validateBeforeCommit(newValue: unknown): boolean {
        return this.sheet!.validateCellValue(this.activeRow, this.activeCol, newValue) !== false;
    }

    /**
     * 绑定编辑器特有的事件监听器
     * 选择变更时自动失焦提交，滚轮事件阻止冒泡避免触发画布滚动
     */
    bindEditorEvents(): void {
        this.trackEvent(this.editor!, "change", () => {
            (this.editor as HTMLSelectElement).blur();
        });
        this.trackEvent(this.editor!, "wheel", (e: Event) => {
            e.stopPropagation();
        });
    }

    /**
     * 设置编辑器的光标模式
     * 下拉选择编辑器不需要光标模式，空实现
     */
    setCursorMode(): void {}

    /**
     * @private 私有方法 - 构建下拉选项列表
     * 清空现有选项，添加空占位选项（根据 allowInvalid 显示不同文本），
     * 然后遍历数据源创建选项元素
     */
    #buildOptions(): void {
        const selectEl = this.editor as HTMLSelectElement;
        selectEl.innerHTML = "";

        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = this.#allowInvalid ? "— 自定义输入 —" : "— 请选择 —";
        selectEl.appendChild(emptyOption);

        for (const item of this.#source) {
            const option = document.createElement("option");
            if (item !== null && typeof item === "object") {
                const obj = item as SelectSourceItem;
                option.value = String(obj.value ?? "");
                option.textContent = String(obj.label ?? obj.value ?? "");
            } else {
                option.value = String(item);
                option.textContent = String(item);
            }
            selectEl.appendChild(option);
        }
    }

    /**
     * @private 私有方法 - 选中指定值对应的选项
     * 遍历选项列表匹配值，未匹配时选中第一个空选项
     *
     * @param value - 要选中的值
     */
    #selectValue(value: unknown): void {
        const strValue = String(value ?? "");
        const selectEl = this.editor as HTMLSelectElement;
        for (let i = 0; i < selectEl.options.length; i++) {
            if (selectEl.options[i].value === strValue) {
                selectEl.selectedIndex = i;
                return;
            }
        }
        selectEl.selectedIndex = 0;
    }
}
