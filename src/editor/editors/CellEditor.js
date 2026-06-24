import { CONFIG } from "../../constants/config";
import { HOOKS } from "../../constants/hookNames.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";
import { isFunction } from "../../core/utils.js";

/**
 * 单元格编辑器基类
 *
 * 定义编辑器的通用接口和共享逻辑，子类只需覆盖差异部分。
 *
 * ## 模板方法模式
 *
 * 基类提供完整的编辑生命周期实现：
 *   createEditor → show → (edit) → blur/keydown → commitAndHide
 *
 * 子类通过覆盖以下模板方法定制行为：
 * - `getElementType()` — DOM 元素类型（input/select）
 * - `getEditorId()` — 编辑器 DOM id
 * - `getExtraCssText()` — 追加的 CSS 样式
 * - `getEditorAttributes()` — 额外的 HTML 属性
 * - `getDefaultTextAlign()` — 默认文本对齐
 * - `readCellValue(row, col)` — 读取单元格值
 * - `formatValueForEditor(rawValue)` — 格式化值用于编辑器显示
 * - `validateBeforeCommit(newValue)` — 提交前验证
 * - `areValuesEqual(oldValue, newValue)` — 值比较
 * - `getEditorValue()` — 从编辑器获取当前值
 * - `useBatchInBatchFill()` — 批量填充是否使用 beginBatch/endBatch
 * - `bindEditorEvents()` — 绑定编辑器特有事件
 * - `afterCreateEditor()` — 创建编辑器后的钩子
 * - `afterShow(row, col, cursorMode)` — 显示编辑器后的钩子
 * - `setCursorMode(cursorMode)` — 设置光标模式
 */
export class CellEditor {
    #scrollHiding = false;

    /**
     * @param {import("../../render/RenderEngine.js").RenderEngine} renderEngine
     * @param {import("../../workbook/Sheet.js").Sheet} sheet
     */
    constructor(renderEngine, sheet) {
        this.renderEngine = renderEngine;
        this.sheet = sheet;
        this.editor = null;
        this.activeRow = -1;
        this.activeCol = -1;
        this.composing = false;
        this.originalValue = "";
    }

    // ─── 模板方法（子类覆盖） ──────────────────────────────

    getElementType() {
        return "input";
    }

    getEditorId() {
        return "cell-editor";
    }

    getExtraCssText() {
        return "";
    }

    getEditorAttributes() {
        return {};
    }

    getDefaultTextAlign() {
        return "left";
    }

    readCellValue(row, col) {
        const cell = this.sheet.cellStore.get(row, col);
        return cell?.value ?? "";
    }

    formatValueForEditor(rawValue) {
        return String(rawValue ?? "");
    }

    validateBeforeCommit(_newValue) {
        return true;
    }

    areValuesEqual(oldValue, newValue) {
        return oldValue === newValue;
    }

    getEditorValue() {
        return this.editor?.value ?? "";
    }

    useBatchInBatchFill() {
        return false;
    }

    bindEditorEvents() {}

    afterCreateEditor() {}

    afterShow(_row, _col, _cursorMode) {}

    setCursorMode(cursorMode) {
        if (!this.editor) return;
        if (cursorMode === "end") {
            const len = this.editor.value.length;
            this.editor.setSelectionRange(len, len);
        } else {
            this.editor.select();
        }
    }

    // ─── 通用实现 ──────────────────────────────────────────

    createEditor() {
        this.editor = document.createElement(this.getElementType());
        this.editor.id = this.getEditorId();

        const baseCss = `
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
        this.editor.style.cssText = baseCss + this.getExtraCssText();

        const attrs = this.getEditorAttributes();
        for (const [key, value] of Object.entries(attrs)) {
            if (value !== null && value !== undefined) {
                this.editor.setAttribute(key, value);
            }
        }

        this.renderEngine.canvas.parentElement.appendChild(this.editor);
        this.#bindCommonEvents();
        this.bindEditorEvents();
        this.afterCreateEditor();
    }

    #bindCommonEvents() {
        this.editor.addEventListener(EVENT_NAMES.BLUR, () => this.#onBlur());
        this.editor.addEventListener(EVENT_NAMES.KEYDOWN, (e) => this.#onKeyDown(e));
        this.editor.addEventListener(EVENT_NAMES.COMPOSITIONSTART, () => {
            this.composing = true;
        });
        this.editor.addEventListener(EVENT_NAMES.COMPOSITIONEND, () => {
            this.composing = false;
        });
    }

    show(row, col, cursorMode = "select") {
        if (!this.sheet || this.sheet.isDisabled(row, col)) return;
        if (!this.editor) return;
        this.activeRow = row;
        this.activeCol = col;
        this.#scrollHiding = false;
        this.composing = false;

        const merge = this.sheet.getMerge(row, col);
        const rect = this.renderEngine.getCellRect(row, col, merge);

        this.editor.style.display = "block";
        this.editor.style.left = rect.x + "px";
        this.editor.style.top = rect.y + "px";
        this.editor.style.width = rect.w + "px";
        this.editor.style.height = rect.h + "px";

        this.#syncFontStyle(row, col, rect.h);

        const rawValue = this.readCellValue(row, col);
        this.originalValue = rawValue;
        this.editor.value = this.formatValueForEditor(rawValue);
        this.editor.focus();

        this.setCursorMode(cursorMode);
        this.afterShow(row, col, cursorMode);
    }

    #syncFontStyle(row, col, cellH) {
        const style = this.sheet.resolveStyle(row, col);
        const fontStyle = style.fontStyle === "italic" ? "italic" : "normal";
        const fontWeight = style.fontWeight || "normal";
        const fontSize = style.fontSize || 12;
        const fontFamily = style.fontFamily || "Segoe UI";
        const lineHeight = cellH || 28;

        this.editor.style.font = `${fontStyle} ${fontWeight} ${fontSize}px/${lineHeight}px ${fontFamily}`;
        this.editor.style.textAlign = style.textAlign || this.getDefaultTextAlign();
        this.editor.style.color = style.color || "#222";
        this.editor.style.backgroundColor = style.backgroundColor && style.backgroundColor !== "transparent" ? style.backgroundColor : "#fff";
    }

    hide() {
        if (this.editor) {
            this.editor.style.display = "none";
        }
        this.activeRow = -1;
        this.activeCol = -1;
    }

    hideForScroll() {
        if (this.activeRow < 0 || !this.editor) return;
        this.#scrollHiding = true;
        this.editor.style.display = "none";
    }

    restoreFromScroll() {
        if (this.activeRow < 0 || !this.editor) return;
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

    #onBlur() {
        if (this.#scrollHiding) return;
        if (this.composing) return;
        if (this.activeRow < 0 || !this.sheet) return;

        let newValue = this.getEditorValue();
        const batchRange = this.sheet._batchFillRange;

        if (batchRange) {
            this.#batchFill(batchRange, newValue);
            delete this.sheet._batchFillRange;
        } else {
            newValue = this.sheet.parseCellValue(this.activeRow, this.activeCol, newValue);

            if (!this.validateBeforeCommit(newValue)) {
                this.editor.value = this.formatValueForEditor(this.originalValue);
                this.editor.focus();
                return;
            }

            const oldCell = this.sheet.cellStore.get(this.activeRow, this.activeCol);
            if (this.areValuesEqual(oldCell?.value, newValue)) {
                this.hide();
                this.#render();
                return;
            }
            this.sheet.setCell(this.activeRow, this.activeCol, newValue, oldCell?.styleId || 0);
        }

        this.hide();
        if (this.renderEngine && isFunction(this.renderEngine.invalidateAll)) {
            this.renderEngine.invalidateAll();
        }
        this.#render();
    }

    #batchFill(range, value) {
        const parsedValue = this.sheet.parseCellValue(range.topRow, range.topCol, value);

        const changes = [];
        for (let r = range.topRow; r <= range.bottomRow; r++) {
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                if (this.sheet.isDisabled(r, c)) continue;
                const oldCell = this.sheet.cellStore.get(r, c);
                const oldValue = oldCell?.value ?? "";
                if (oldValue !== parsedValue) {
                    changes.push({ row: r, col: c, oldValue, newValue: parsedValue });
                }
            }
        }

        if (changes.length === 0) return;

        this.sheet.workbook?.runHooks(HOOKS.BEFORE_CHANGE, changes);

        if (this.useBatchInBatchFill()) {
            this.sheet.beginBatch();
        }
        for (const { row, col, newValue } of changes) {
            const oldCell = this.sheet.cellStore.get(row, col);
            this.sheet.setCell(row, col, newValue, oldCell?.styleId || 0);
        }
        if (this.useBatchInBatchFill()) {
            this.sheet.endBatch();
        }

        this.sheet.workbook?.runHooks(HOOKS.AFTER_CHANGE, changes);
    }

    #onKeyDown(e) {
        if (!this.sheet) return;
        if (this.composing) return;

        switch (e.key) {
            case "Enter":
                e.preventDefault();
                this.#commitAndMoveNext("enter");
                break;
            case "Escape":
                e.preventDefault();
                this.editor.value = this.formatValueForEditor(this.originalValue);
                delete this.sheet._batchFillRange;
                this.editor.blur();
                break;
            case "Tab":
                e.preventDefault();
                this.#commitAndMoveNext("tab", e.shiftKey);
                break;
        }
    }

    #commitAndMoveNext(direction, shiftKey = false) {
        const currentRow = this.activeRow;
        const currentCol = this.activeCol;
        this.editor.blur();

        if (direction === "enter") {
            let nextRow = currentRow + 1;
            const merge = this.sheet.getMerge(currentRow, currentCol);
            if (merge && nextRow <= merge.bottomRow) {
                nextRow = merge.bottomRow + 1;
            }
            nextRow = Math.min(this.sheet.rowColManager.rowCount - 1, Math.max(0, nextRow));
            const { row: targetRow } = this.#getTopLeft(nextRow, currentCol);
            const targetMerge = this.sheet.getMerge(targetRow, currentCol);
            if (targetMerge) {
                this.sheet.selection.setRange(targetMerge.topRow, targetMerge.topCol, targetMerge.bottomRow, targetMerge.bottomCol);
            } else {
                this.sheet.selection.setActive(targetRow, currentCol);
            }
            this.renderEngine.scrollToCell(targetRow, currentCol);
        } else if (direction === "tab") {
            const nextCol = shiftKey ? currentCol - 1 : currentCol + 1;
            const colMerge = this.sheet.getMerge(currentRow, currentCol);
            let targetCol = nextCol;
            if (colMerge) {
                if (shiftKey && nextCol >= colMerge.topCol) {
                    targetCol = colMerge.topCol - 1;
                } else if (!shiftKey && nextCol <= colMerge.bottomCol) {
                    targetCol = colMerge.bottomCol + 1;
                }
            }
            targetCol = Math.min(this.sheet.rowColManager.realColCount - 1, Math.max(0, targetCol));
            const { col: finalCol } = this.#getTopLeft(currentRow, targetCol);
            const tabTargetMerge = this.sheet.getMerge(currentRow, finalCol);
            if (tabTargetMerge) {
                this.sheet.selection.setRange(tabTargetMerge.topRow, tabTargetMerge.topCol, tabTargetMerge.bottomRow, tabTargetMerge.bottomCol);
            } else {
                this.sheet.selection.setActive(currentRow, finalCol);
            }
            this.renderEngine.scrollToCell(currentRow, finalCol);
        }

        this.#render();
    }

    #getTopLeft(row, col) {
        const merge = this.sheet?.getMerge(row, col);
        if (merge) {
            return { row: merge.topRow, col: merge.topCol };
        }
        return { row, col };
    }

    #render() {
        if (this.sheet && this.renderEngine && isFunction(this.renderEngine.render)) {
            this.renderEngine.render(this.sheet);
        }
    }

    getValue() {
        return this.editor?.value ?? "";
    }

    setValue(value) {
        if (this.editor) {
            this.editor.value = String(value);
        }
    }

    focus() {
        this.editor?.focus();
    }

    destroy() {
        if (this.editor && this.editor.parentElement) {
            this.editor.parentElement.removeChild(this.editor);
        }
        this.editor = null;
        this.renderEngine = null;
        this.sheet = null;
        this.activeRow = -1;
        this.activeCol = -1;
        this.composing = false;
        this.originalValue = "";
    }
}
