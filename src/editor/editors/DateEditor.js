import { CellEditor } from "./CellEditor.js";
import { HOOKS } from "../../constants/hookNames.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";
import { CONFIG } from "../../constants/config";

/**
 * 日期编辑器
 *
 * 处理 date 类型列的单元格编辑，支持：
 * - 日期输入（type="date" 原生日期选择器）
 * - 文本输入回退（手动输入日期字符串）
 * - 多种日期格式自动解析
 * - Enter/Tab 确认后自动跳转
 * - Escape 取消编辑
 * - 滚动时自动隐藏/恢复
 */
export class DateEditor extends CellEditor {
    #scrollHiding = false;
    #composing = false;
    #originalValue = "";
    #useNativePicker = true; // 是否使用原生日期选择器

    createEditor() {
        this.editor = document.createElement("input");

        // 尝试使用原生日期选择器
        this.#useNativePicker = this.#supportsDateInput();

        this.editor.type = this.#useNativePicker ? "date" : "text";
        this.editor.id = "date-editor";
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
      text-align: center;
    `;
        this.renderEngine.canvas.parentElement.appendChild(this.editor);
        this.#bindEvents();
    }

    #bindEvents() {
        this.editor.addEventListener(EVENT_NAMES.BLUR, () => this.#onBlur());
        this.editor.addEventListener(EVENT_NAMES.KEYDOWN, (e) => this.#onKeyDown(e));
        this.editor.addEventListener(EVENT_NAMES.COMPOSITIONSTART, () => {
            this.#composing = true;
        });
        this.editor.addEventListener(EVENT_NAMES.COMPOSITIONEND, () => {
            this.#composing = false;
        });
    }

    /**
     * 检测浏览器是否支持 date 类型输入
     */
    #supportsDateInput() {
        const input = document.createElement("input");
        input.setAttribute("type", "date");
        return input.type === "date";
    }

    show(row, col, cursorMode = "select") {
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

        this.#syncFontStyle(row, col, rect.h);

        const cell = this.sheet.cellStore.get(row, col);
        const rawValue = cell?.value ?? "";
        this.#originalValue = rawValue instanceof Date ? this.#toDateString(rawValue) : String(rawValue);

        if (this.#useNativePicker && rawValue instanceof Date) {
            this.editor.value = this.#toDateString(rawValue);
        } else if (this.#useNativePicker) {
            // 尝试解析日期
            const parsed = this.#parseDateString(String(rawValue));
            this.editor.value = parsed ? this.#toDateString(parsed) : "";
        } else {
            this.editor.value = this.#originalValue;
        }

        this.editor.focus();

        if (cursorMode === "end" && !this.#useNativePicker) {
            const len = this.editor.value.length;
            this.editor.setSelectionRange(len, len);
        } else if (cursorMode === "select" && !this.#useNativePicker) {
            this.editor.select();
        }
    }

    #syncFontStyle(row, col, cellH) {
        const style = this.sheet.resolveStyle(row, col);
        const fontStyle = style.fontStyle === "italic" ? "italic" : "normal";
        const fontWeight = style.fontWeight || "normal";
        const fontSize = style.fontSize || 12;
        const fontFamily = style.fontFamily || "Segoe UI";
        const lineHeight = cellH || 28;

        this.editor.style.font = `${fontStyle} ${fontWeight} ${fontSize}px/${lineHeight}px ${fontFamily}`;
        this.editor.style.textAlign = style.textAlign || "center";
        this.editor.style.color = style.color || "#222";
        this.editor.style.backgroundColor = style.backgroundColor && style.backgroundColor !== "transparent" ? style.backgroundColor : "#fff";
    }

    hideForScroll() {
        if (this.activeRow < 0) return;
        this.#scrollHiding = true;
        this.editor.style.display = "none";
    }

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

    #onBlur() {
        if (this.#scrollHiding) return;
        if (this.#composing) return;
        if (this.activeRow < 0 || !this.sheet) return;

        let newValue = this.editor.value.trim();
        const batchRange = this.sheet._batchFillRange;

        if (batchRange) {
            this.#batchFill(batchRange, newValue);
            delete this.sheet._batchFillRange;
        } else {
            // 使用类型系统的 parse 统一解析
            newValue = this.sheet.parseCellValue(this.activeRow, this.activeCol, newValue);

            const validation = this.sheet.validateCellValue(this.activeRow, this.activeCol, newValue);
            if (validation === false) {
                this.editor.value = this.#originalValue;
                this.editor.focus();
                return;
            }

            const oldCell = this.sheet.cellStore.get(this.activeRow, this.activeCol);
            // 比较日期值
            const oldStr = oldCell?.value instanceof Date ? oldCell.value.getTime() : oldCell?.value;
            const newStr = newValue instanceof Date ? newValue.getTime() : newValue;
            if (oldStr === newStr) {
                this.hide();
                this.#render();
                return;
            }
            this.sheet.setCell(this.activeRow, this.activeCol, newValue, oldCell?.styleId || 0);
        }

        this.hide();
        this.#render();
    }

    #batchFill(range, value) {
        // 使用类型系统的 parse 统一解析
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

        for (const { row, col, newValue } of changes) {
            const oldCell = this.sheet.cellStore.get(row, col);
            this.sheet.setCell(row, col, newValue, oldCell?.styleId || 0);
        }

        this.sheet.workbook?.runHooks(HOOKS.AFTER_CHANGE, changes);
    }

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
                const { row: targetRow } = this.#getTopLeft(nextRow, enterCol);
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
                this.editor.value = this.#originalValue;
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
                targetCol = Math.min(this.sheet.rowColManager.realColCount - 1, Math.max(0, targetCol));
                const { col: finalCol } = this.#getTopLeft(tabRow, targetCol);
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

    #getTopLeft(row, col) {
        const merge = this.sheet?.getMerge(row, col);
        if (merge) {
            return { row: merge.topRow, col: merge.topCol };
        }
        return { row, col };
    }

    /**
     * 解析日期字符串
     */
    #parseDateString(str) {
        if (!str || !str.trim()) return null;

        // 原生 date input 返回 yyyy-mm-dd 格式
        const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (isoMatch) {
            const y = parseInt(isoMatch[1], 10);
            const m = parseInt(isoMatch[2], 10) - 1;
            const d = parseInt(isoMatch[3], 10);
            const date = new Date(y, m, d);
            return isNaN(date.getTime()) ? null : date;
        }

        // 尝试其他格式
        const slashMatch = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
        if (slashMatch) {
            const a = parseInt(slashMatch[1], 10);
            const b = parseInt(slashMatch[2], 10);
            const y = parseInt(slashMatch[3], 10);
            // 尝试 MM/DD/YYYY 和 DD/MM/YYYY
            let date = new Date(y, b - 1, a);
            if (isNaN(date.getTime())) {
                date = new Date(y, a - 1, b);
            }
            return isNaN(date.getTime()) ? null : date;
        }

        const date = new Date(str);
        return isNaN(date.getTime()) ? null : date;
    }

    /**
     * 将 Date 对象转为 yyyy-mm-dd 字符串（供原生 date input 使用）
     */
    #toDateString(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return "";
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }

    #render() {
        if (this.sheet && this.renderEngine && typeof this.renderEngine.render === "function") {
            this.renderEngine.render(this.sheet);
        }
    }
}
