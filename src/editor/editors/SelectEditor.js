import { CellEditor } from './CellEditor.js';
import { HOOKS } from '../../constants/hookNames.js';
import { EVENT_NAMES } from '../../constants/eventNames.js';
import { CONFIG } from '../../constants/config';

/**
 * 下拉选择编辑器
 *
 * 处理 select 类型列的单元格编辑，支持：
 * - 下拉选择（使用原生 select 元素）
 * - 可搜索过滤（当选项较多时支持输入过滤）
 * - 允许自定义值（allowInvalid 模式）
 * - Enter/Tab 确认后自动跳转
 * - Escape 取消编辑
 * - 滚动时自动隐藏/恢复
 */
export class SelectEditor extends CellEditor {
    #scrollHiding = false;
    #originalValue = '';
    #source = [];
    #allowInvalid = false;
    #strict = false;
    #isOpen = false;

    createEditor() {
        // 使用 select 元素实现下拉选择
        this.editor = document.createElement('select');
        this.editor.id = 'select-editor';
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
      text-align: left;
      cursor: pointer;
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
    `;
        this.renderEngine.canvas.parentElement.appendChild(this.editor);
        this.#bindEvents();
    }

    #bindEvents() {
        this.editor.addEventListener(EVENT_NAMES.BLUR, () => this.#onBlur());
        this.editor.addEventListener(EVENT_NAMES.KEYDOWN, (e) => this.#onKeyDown(e));
        this.editor.addEventListener('change', () => {
            // 选中后自动提交
            this.editor.blur();
        });
    }

    show(row, col, cursorMode = 'select') {
        if (!this.sheet || this.sheet.isDisabled(row, col)) return;
        this.activeRow = row;
        this.activeCol = col;
        this.#scrollHiding = false;

        // 从类型系统获取编辑器选项（支持单元格级别类型覆盖）
        const cellType = this.sheet.getCellTypeInstance(row, col);
        const editorOpts = cellType?.getEditorOptions?.() || {};
        this.#source = editorOpts.source || [];
        this.#allowInvalid = editorOpts.allowInvalid ?? false;
        this.#strict = editorOpts.strict ?? false;

        const merge = this.sheet.getMerge(row, col);
        const rect = this.renderEngine.getCellRect(row, col, merge);

        this.editor.style.display = 'block';
        this.editor.style.left = rect.x + 'px';
        this.editor.style.top = rect.y + 'px';
        this.editor.style.width = rect.w + 'px';
        this.editor.style.height = rect.h + 'px';

        this.#syncFontStyle(row, col, rect.h);

        // 构建选项列表
        this.#buildOptions();

        const cell = this.sheet.cellStore.get(row, col);
        const rawValue = cell?.value ?? '';
        this.#originalValue = String(rawValue);

        // 选中当前值
        this.#selectValue(this.#originalValue);

        this.editor.focus();
    }

    #buildOptions() {
        // 清空现有选项
        this.editor.innerHTML = '';

        // 添加空选项（占位符）
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = this.#allowInvalid ? '— 自定义输入 —' : '— 请选择 —';
        this.editor.appendChild(emptyOption);

        // 添加 source 中的选项
        for (const item of this.#source) {
            const option = document.createElement('option');
            option.value = String(item);
            option.textContent = String(item);
            this.editor.appendChild(option);
        }
    }

    #selectValue(value) {
        for (let i = 0; i < this.editor.options.length; i++) {
            if (this.editor.options[i].value === value) {
                this.editor.selectedIndex = i;
                return;
            }
        }
        // 如果没找到且允许自定义值，选中空选项
        this.editor.selectedIndex = 0;
    }

    #syncFontStyle(row, col, cellH) {
        const style = this.sheet.resolveStyle(row, col);
        const fontStyle = style.fontStyle === 'italic' ? 'italic' : 'normal';
        const fontWeight = style.fontWeight || 'normal';
        const fontSize = style.fontSize || 12;
        const fontFamily = style.fontFamily || 'Segoe UI';
        const lineHeight = cellH || 28;

        this.editor.style.font = `${fontStyle} ${fontWeight} ${fontSize}px/${lineHeight}px ${fontFamily}`;
        this.editor.style.textAlign = style.textAlign || 'left';
        this.editor.style.color = style.color || '#222';
        this.editor.style.backgroundColor =
            style.backgroundColor && style.backgroundColor !== 'transparent'
                ? style.backgroundColor
                : '#fff';
    }

    hideForScroll() {
        if (this.activeRow < 0) return;
        this.#scrollHiding = true;
        this.editor.style.display = 'none';
    }

    restoreFromScroll() {
        if (this.activeRow < 0) return;
        this.#scrollHiding = false;
        const merge = this.sheet.getMerge(this.activeRow, this.activeCol);
        const rect = this.renderEngine.getCellRect(this.activeRow, this.activeCol, merge);
        this.editor.style.display = 'block';
        this.editor.style.left = rect.x + 'px';
        this.editor.style.top = rect.y + 'px';
        this.editor.style.width = rect.w + 'px';
        this.editor.style.height = rect.h + 'px';
        this.editor.focus();
    }

    #onBlur() {
        if (this.#scrollHiding) return;
        if (this.activeRow < 0 || !this.sheet) return;

        const selectedValue = this.editor.value;
        const batchRange = this.sheet._batchFillRange;

        if (batchRange) {
            this.#batchFill(batchRange, selectedValue);
            delete this.sheet._batchFillRange;
        } else {
            // 使用类型系统的 parse 统一解析
            const parsedValue = this.sheet.parseCellValue(this.activeRow, this.activeCol, selectedValue);

            const validation = this.sheet.validateCellValue(this.activeRow, this.activeCol, parsedValue);
            if (validation === false) {
                this.editor.value = this.#originalValue;
                return;
            }

            const oldCell = this.sheet.cellStore.get(this.activeRow, this.activeCol);
            if (oldCell?.value === parsedValue) {
                this.hide();
                this.#render();
                return;
            }
            this.sheet.setCell(this.activeRow, this.activeCol, parsedValue, oldCell?.styleId || 0);
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
                const oldValue = oldCell?.value ?? '';
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

        switch (e.key) {
            case 'Enter':
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
                    this.sheet.selection.setRange(
                        targetMerge.topRow, targetMerge.topCol,
                        targetMerge.bottomRow, targetMerge.bottomCol,
                    );
                } else {
                    this.sheet.selection.setActive(targetRow, enterCol);
                }
                this.renderEngine.scrollToCell(targetRow, enterCol);
                this.#render();
                break;
            case 'Escape':
                e.preventDefault();
                this.editor.value = this.#originalValue;
                delete this.sheet._batchFillRange;
                this.editor.blur();
                break;
            case 'Tab':
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
                targetCol = Math.min(
                    this.sheet.rowColManager.realColCount - 1,
                    Math.max(0, targetCol),
                );
                const { col: finalCol } = this.#getTopLeft(tabRow, targetCol);
                const tabTargetMerge = this.sheet.getMerge(tabRow, finalCol);
                if (tabTargetMerge) {
                    this.sheet.selection.setRange(
                        tabTargetMerge.topRow, tabTargetMerge.topCol,
                        tabTargetMerge.bottomRow, tabTargetMerge.bottomCol,
                    );
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

    #render() {
        if (this.sheet && this.renderEngine && typeof this.renderEngine.render === 'function') {
            this.renderEngine.render(this.sheet);
        }
    }
}
