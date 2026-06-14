import {CellEditor} from "./CellEditor.js";
import {HOOKS} from "../../constants/hookNames.js";
import {EVENT_NAMES} from "../../constants/eventNames.js";
import {CONFIG} from "../../constants/config";

/**
 * 文本编辑器
 * 处理单元格文本输入，支持：
 * - 单单元格编辑
 * - 批量赋值模式（选中区域后直接输入，blur 时填充整个选区）
 * - Enter/Tab 确认后自动跳转
 * - Escape 取消编辑
 * - 滚动时自动隐藏/恢复
 */
export class TextEditor extends CellEditor {
    /** 是否因滚动而隐藏（此时 blur 不应提交值） */
    #scrollHiding = false;
    /** 是否正在 IME 组合输入中 */
    #composing = false;

    createEditor() {
        this.editor = document.createElement("input");
        this.editor.id = "cell-editor";
        this.editor.style.cssText = `
      position: absolute;
      display: none;
      border: 2px solid ${CONFIG.SELECTION_COLOR};
      outline: none;
      padding: 0 4px;
      box-sizing: border-box;
      font: 12px/28px "Segoe UI", sans-serif;
      background: #fff;
      z-index: 1000;
    `;
        this.renderEngine.canvas.parentElement.appendChild(this.editor);
        this.#bindEvents();
    }

    /** 绑定 blur、keydown 和 IME 事件 */
    #bindEvents() {
        this.editor.addEventListener(EVENT_NAMES.BLUR, () => this.#onBlur());
        this.editor.addEventListener(EVENT_NAMES.KEYDOWN, (e) => this.#onKeyDown(e));
        this.editor.addEventListener(EVENT_NAMES.COMPOSITIONSTART, () => { this.#composing = true; });
        this.editor.addEventListener(EVENT_NAMES.COMPOSITIONEND, () => { this.#composing = false; });
    }

    /**
     * 显示编辑器
     * 将 input 定位到目标单元格上方，填入当前值并聚焦
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    show(row, col) {
        if (!this.sheet || this.sheet.isDisabled(row, col)) return;
        this.activeRow = row;
        this.activeCol = col;
        this.#scrollHiding = false;

        const merge = this.sheet.getMerge(row, col);
        const rect = this.renderEngine.getCellRect(row, col, merge);

        this.editor.style.display = "block";
        this.editor.style.left = rect.x + "px";
        this.editor.style.top = rect.y + "px";
        this.editor.style.width = rect.w + "px";
        this.editor.style.height = rect.h + "px";

        const cell = this.sheet.cellStore.get(row, col);
        this.editor.value = cell?.value ?? "";
        this.editor.focus();
        this.editor.select();
    }

    /**
     * 因滚动而隐藏编辑器
     * 设置 #scrollHiding 标记，防止 blur 时提交值
     */
    hideForScroll() {
        if (this.activeRow < 0) return;
        this.#scrollHiding = true;
        this.editor.style.display = "none";
    }

    /**
     * 滚动结束后恢复编辑器
     * 重新定位 input 并聚焦
     */
    restoreFromScroll() {
        if (this.activeRow < 0) return;
        this.#scrollHiding = false;
        const merge = this.sheet.getMerge(this.activeRow, this.activeCol);
        const rect = this.renderEngine.getCellRect(this.activeRow, this.activeCol, merge);
        this.editor.style.display = "block";
        this.editor.style.left = rect.x + "px";
        this.editor.style.top = rect.y + "px";
        this.editor.style.width = rect.w + "px";
        this.editor.style.height = rect.h + "px";
        this.editor.focus();
    }

    /**
     * blur 事件处理
     * 提交编辑值到数据模型
     * 如果存在 _batchFillRange（批量赋值模式），则将值填充到整个选区
     */
    #onBlur() {
        if (this.#scrollHiding) return;
        if (this.#composing) return;
        if (this.activeRow < 0 || !this.sheet) return;

        const newValue = this.editor.value;
        const batchRange = this.sheet._batchFillRange;

        if (batchRange) {
            /**
             * 批量赋值模式
             * 将输入的值填充到选区内的所有单元格
             * 保留各单元格原有的样式
             */
            this.#batchFill(batchRange, newValue);
            delete this.sheet._batchFillRange;
        } else {
            /** 单单元格编辑模式 */
            const oldCell = this.sheet.cellStore.get(this.activeRow, this.activeCol);
            if (oldCell?.value === newValue) {
                this.hide();
                this.#render();
                return;
            }
            this.sheet.setCell(this.activeRow, this.activeCol, newValue, oldCell?.styleId || 0);
        }

        this.hide();
        this.#render();
    }

    /**
     * 批量填充
     * 将指定值填充到选区内的所有非禁用单元格
     * 保留各单元格原有的样式
     *
     * @param {{ topRow: number, topCol: number, bottomRow: number, bottomCol: number }} range - 选区范围
     * @param {string} value - 要填充的值
     */
    #batchFill(range, value) {
        const changes = [];

        for (let r = range.topRow; r <= range.bottomRow; r++) {
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                if (this.sheet.isDisabled(r, c)) continue;

                const oldCell = this.sheet.cellStore.get(r, c);
                const oldValue = oldCell?.value ?? "";
                if (oldValue !== value) {
                    changes.push({ row: r, col: c, oldValue, newValue: value });
                }
            }
        }

        if (changes.length === 0) return;

        this.sheet.workbook?.runHooks(HOOKS.BEFORE_CHANGE, changes);

        for (const { row, col, newValue } of changes) {
            const oldCell = this.sheet.cellStore.get(row, col);
            this.sheet.setCell(row, col, newValue, oldCell?.styleId || 0);
        }

        this.sheet.workbook?.runHooks(HOOKS.AFTER_CHANGE, changes);
    }

    /**
     * 编辑状态下的按键处理
     * - Enter: 确认编辑，跳转到下一行
     * - Escape: 取消编辑，恢复原值
     * - Tab: 确认编辑，跳转到下一列
     */
    #onKeyDown(e) {
        if (!this.sheet) return;
        if (this.#composing) return;

        switch (e.key) {
            case "Enter":
                e.preventDefault();
                const enterRow = this.activeRow;
                const enterCol = this.activeCol;
                this.editor.blur();
                let nextRow = enterRow + 1;
                const merge = this.sheet.getMerge(enterRow, enterCol);
                if (merge && nextRow <= merge.bottomRow) {
                    nextRow = merge.bottomRow + 1;
                }
                nextRow = Math.min(this.sheet.rowColManager.rowCount - 1, Math.max(0, nextRow));
                const {row: targetRow} = this.#getTopLeft(nextRow, enterCol);
                const targetMerge = this.sheet.getMerge(targetRow, enterCol);
                if (targetMerge) {
                    this.sheet.selection.setRange(targetMerge.topRow, targetMerge.topCol, targetMerge.bottomRow, targetMerge.bottomCol);
                } else {
                    this.sheet.selection.setActive(targetRow, enterCol);
                }
                this.renderEngine.scrollToCell(targetRow, enterCol);
                this.#render();
                break;
            case "Escape":
                e.preventDefault();
                this.editor.value = this.sheet.cellStore.get(this.activeRow, this.activeCol)?.value ?? "";
                delete this.sheet._batchFillRange;
                this.editor.blur();
                break;
            case "Tab":
                e.preventDefault();
                const tabRow = this.activeRow;
                const tabCol = this.activeCol;
                this.editor.blur();
                const nextCol = e.shiftKey ? tabCol - 1 : tabCol + 1;
                const colMerge = this.sheet.getMerge(tabRow, tabCol);
                let targetCol = nextCol;
                if (colMerge) {
                    if (e.shiftKey && nextCol >= colMerge.topCol) {
                        targetCol = colMerge.topCol - 1;
                    } else if (!e.shiftKey && nextCol <= colMerge.bottomCol) {
                        targetCol = colMerge.bottomCol + 1;
                    }
                }
                targetCol = Math.min(this.sheet.rowColManager.colCount - 1, Math.max(0, targetCol));
                const {col: finalCol} = this.#getTopLeft(tabRow, targetCol);
                const tabTargetMerge = this.sheet.getMerge(tabRow, finalCol);
                if (tabTargetMerge) {
                    this.sheet.selection.setRange(tabTargetMerge.topRow, tabTargetMerge.topCol, tabTargetMerge.bottomRow, tabTargetMerge.bottomCol);
                } else {
                    this.sheet.selection.setActive(tabRow, finalCol);
                }
                this.renderEngine.scrollToCell(tabRow, finalCol);
                this.#render();
                break;
        }
    }

    /**
     * 获取合并单元格的左上角位置
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {{ row: number, col: number }}
     */
    #getTopLeft(row, col) {
        const merge = this.sheet?.getMerge(row, col);
        if (merge) {
            return {row: merge.topRow, col: merge.topCol};
        }
        return {row, col};
    }

    /** 触发重新渲染 */
    #render() {
        if (this.sheet && this.renderEngine && typeof this.renderEngine.render === 'function') {
            this.renderEngine.render(this.sheet);
        }
    }
}