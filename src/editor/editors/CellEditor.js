import { CONFIG } from "../../constants/config";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";
import { isFunction } from "../../utils/utils.js";
import { DOMComponent } from "../../core/DOMComponent.js";
import "../editor.css";

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
 * - `getEditorCssClass()` — 返回编辑器变体 CSS class 名
 * - `getEditorAttributes()` — 额外的 HTML 属性
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
export class CellEditor extends DOMComponent {
    #scrollHiding = false;

    /**
     * @param {import("../../render/RenderEngine.js").RenderEngine} renderEngine
     * @param {import("../../workbook/Sheet.js").Sheet} sheet
     */
    constructor(renderEngine, sheet) {
        super();
        this.renderEngine = renderEngine;
        this.sheet = sheet;
        this.editor = null;
        this.activeRow = -1;
        this.activeCol = -1;
        this.composing = false;
        this.originalValue = "";
    }

    /**
     * @param {import("../../render/ViewportService.js").ViewportService} viewport
     */
    set viewport(viewport) {
        this._viewport = viewport;
    }

    get viewport() {
        return this._viewport ?? this.renderEngine;
    }

    /**
     * @param {import("../../render/CanvasContext.js").CanvasContext} canvasContext
     */
    set canvasContext(canvasContext) {
        this._canvasContext = canvasContext;
    }

    get canvasContext() {
        if (this._canvasContext) return this._canvasContext;
        const re = this.renderEngine;
        if (!re) return null;
        return {
            get canvas() {
                return re.canvas;
            },
            get canvasParent() {
                return re.canvas?.parentElement ?? null;
            },
            render(sheet) {
                re.render(sheet);
            },
        };
    }

    // ─── 模板方法（子类覆盖） ──────────────────────────────

    getElementType() {
        return "input";
    }

    /** 子类覆写返回变体 CSS class（如 "cs-cell-editor--numeric"） */
    getEditorCssClass() {
        return "";
    }

    getEditorAttributes() {
        return {};
    }

    readCellValue(row, col) {
        const realRow = this.sheet.toRealRow(row);
        const cell = this.sheet.cellStore.get(realRow, col);
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
        const className = `cs-cell-editor ${this.getEditorCssClass()}`.trim();
        this.editor = this.createElement(this.getElementType(), {
            className,
        });

        const attrs = this.getEditorAttributes();
        for (const [key, value] of Object.entries(attrs)) {
            if (value !== null && value !== undefined) {
                this.editor.setAttribute(key, value);
            }
        }

        this.canvasContext.canvasParent.appendChild(this.editor);
        this.#bindCommonEvents();
        this.bindEditorEvents();
        this.afterCreateEditor();
    }

    #bindCommonEvents() {
        this.trackEvent(this.editor, EVENT_NAMES.BLUR, () => this.#onBlur());
        this.trackEvent(this.editor, EVENT_NAMES.KEYDOWN, (e) => this.#onKeyDown(e));
        this.trackEvent(this.editor, EVENT_NAMES.COMPOSITIONSTART, () => {
            this.composing = true;
        });
        this.trackEvent(this.editor, EVENT_NAMES.COMPOSITIONEND, () => {
            this.composing = false;
        });
    }

    show(row, col, cursorMode = "select") {
        if (!this.sheet || this.sheet.isDisabled(row, col)) return;
        if (!this.editor) return;

        // ✅ 通过 EventBus 发射"即将开始编辑"事件（指定 source 为 CellEditor）
        // EventHandler 会订阅此事件并触发 BEFORE_BEGIN_EDITING hook
        const canBegin = this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_BEFORE_BEGIN, [row, col], { source: "CellEditor" });
        if (canBegin === false) return;

        this.activeRow = row;
        this.activeCol = col;
        this.#scrollHiding = false;
        this.composing = false;

        const merge = this.sheet.getMerge(row, col);
        const rect = this.viewport.getCellRect(row, col, merge);

        // 将编辑器约束在可视数据区域内，防止：
        // 1. 非冻结列滚动到冻结列后面时编辑器 DOM 覆盖冻结区域
        // 2. 边缘列的编辑器超出 canvas 可视区域
        //
        // 编辑器是 DOM 元素，渲染在 canvas 之上，不受 canvas clip 裁剪。
        // 关键区分：
        // - 冻结区域内的单元格：编辑器约束到表头边界（headerW/headerH），在冻结区域内正常显示
        // - 非冻结区域的单元格：编辑器约束到非冻结区域起点（headerW + frozenColsW），
        //   防止滚动时编辑器穿透冻结区域
        const headerW = this.sheet.getHeaderWidth?.() ?? 0;
        const headerH = this.sheet.getHeaderHeight?.() ?? 0;
        const frozenColsW = this.sheet.frozenColsWidth || 0;
        const frozenRowsH = this.sheet.frozenRowsHeight || 0;
        const viewW = this.viewport?.viewW ?? Infinity;
        const viewH = this.viewport?.viewH ?? Infinity;
        const fixedCols = this.sheet.fixedColumnsStart || 0;
        const fixedRows = this.sheet.fixedRowsTop || 0;

        // 冻结区域内的单元格使用表头边界，非冻结区域单元格使用冻结区域+表头边界
        const minX = col < fixedCols ? headerW : headerW + frozenColsW;
        const minY = row < fixedRows ? headerH : headerH + frozenRowsH;

        const clampedX = Math.max(rect.x, minX);
        const clampedY = Math.max(rect.y, minY);
        const clampedRight = Math.min(rect.x + rect.w, viewW);
        const clampedBottom = Math.min(rect.y + rect.h, viewH);
        const clampedW = Math.max(0, clampedRight - clampedX);
        const clampedH = Math.max(0, clampedBottom - clampedY);

        this.editor.style.display = clampedW > 0 && clampedH > 0 ? "block" : "none";
        this.editor.style.left = clampedX + "px";
        this.editor.style.top = clampedY + "px";
        this.editor.style.width = clampedW + "px";
        this.editor.style.height = clampedH + "px";

        this.#syncFontStyle(row, col, rect.h);

        const rawValue = this.readCellValue(row, col);
        this.originalValue = rawValue;
        this.editor.value = this.formatValueForEditor(rawValue);
        this.editor.focus();

        this.setCursorMode(cursorMode);

        // ✅ 通过 EventBus 发射"已开始编辑"事件（指定 source 为 CellEditor）
        this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_AFTER_BEGIN, [row, col], { source: "CellEditor" });

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
        this.editor.style.textAlign = style.textAlign || "left";
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
        const rect = this.viewport.getCellRect(this.activeRow, this.activeCol, merge);

        // 与 show() 相同的约束逻辑，防止编辑器超出可视区域
        const headerW = this.sheet.getHeaderWidth?.() ?? 0;
        const headerH = this.sheet.getHeaderHeight?.() ?? 0;
        const frozenColsW = this.sheet.frozenColsWidth || 0;
        const frozenRowsH = this.sheet.frozenRowsHeight || 0;
        const viewW = this.viewport?.viewW ?? Infinity;
        const viewH = this.viewport?.viewH ?? Infinity;
        const fixedCols = this.sheet.fixedColumnsStart || 0;
        const fixedRows = this.sheet.fixedRowsTop || 0;

        const minX = this.activeCol < fixedCols ? headerW : headerW + frozenColsW;
        const minY = this.activeRow < fixedRows ? headerH : headerH + frozenRowsH;

        const clampedX = Math.max(rect.x, minX);
        const clampedY = Math.max(rect.y, minY);
        const clampedRight = Math.min(rect.x + rect.w, viewW);
        const clampedBottom = Math.min(rect.y + rect.h, viewH);
        const clampedW = Math.max(0, clampedRight - clampedX);
        const clampedH = Math.max(0, clampedBottom - clampedY);

        this.editor.style.display = clampedW > 0 && clampedH > 0 ? "block" : "none";
        this.editor.style.left = clampedX + "px";
        this.editor.style.top = clampedY + "px";
        this.editor.style.width = clampedW + "px";
        this.editor.style.height = clampedH + "px";
        this.editor.focus();
    }

    updatePosition() {
        if (this.activeRow < 0 || !this.editor) return;
        const merge = this.sheet.getMerge(this.activeRow, this.activeCol);
        const rect = this.viewport.getCellRect(this.activeRow, this.activeCol, merge);

        const headerW = this.sheet.getHeaderWidth?.() ?? 0;
        const headerH = this.sheet.getHeaderHeight?.() ?? 0;
        const frozenColsW = this.sheet.frozenColsWidth || 0;
        const frozenRowsH = this.sheet.frozenRowsHeight || 0;
        const viewW = this.viewport?.viewW ?? Infinity;
        const viewH = this.viewport?.viewH ?? Infinity;
        const fixedCols = this.sheet.fixedColumnsStart || 0;
        const fixedRows = this.sheet.fixedRowsTop || 0;

        const minX = this.activeCol < fixedCols ? headerW : headerW + frozenColsW;
        const minY = this.activeRow < fixedRows ? headerH : headerH + frozenRowsH;

        const clampedX = Math.max(rect.x, minX);
        const clampedY = Math.max(rect.y, minY);
        const clampedRight = Math.min(rect.x + rect.w, viewW);
        const clampedBottom = Math.min(rect.y + rect.h, viewH);
        const clampedW = Math.max(0, clampedRight - clampedX);
        const clampedH = Math.max(0, clampedBottom - clampedY);

        this.editor.style.left = clampedX + "px";
        this.editor.style.top = clampedY + "px";
        this.editor.style.width = clampedW + "px";
        this.editor.style.height = clampedH + "px";
    }

    #onBlur() {
        if (this.#scrollHiding) return;
        if (this.composing) return;
        if (this.activeRow < 0 || !this.sheet) return;

        // ✅ 通过 EventBus 发射"即将提交编辑"事件（指定 source 为 CellEditor）
        // EventHandler 会订阅此事件并触发 BEFORE_FINISH_EDITING hook
        const canFinish = this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_BEFORE_FINISH, [this.activeRow, this.activeCol], { source: "CellEditor" });
        if (canFinish === false) return;

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

            let targetRow = this.activeRow;
            let targetCol = this.activeCol;

            const merge = this.sheet.getMerge(this.activeRow, this.activeCol);
            if (merge) {
                targetRow = merge.topRow;
                targetCol = merge.topCol;
            }

            const realRow = this.sheet.toRealRow(targetRow);
            const oldCell = this.sheet.cellStore.get(realRow, targetCol);
            if (this.areValuesEqual(oldCell?.value, newValue)) {
                this.hide();
                this.#render();
                return;
            }

            // ✅ 通过 EventBus 发射 BEFORE_CHANGE 事件（值变更前，指定 source 为 CellEditor）
            const changeData = [{ row: targetRow, col: targetCol, oldValue: oldCell?.value, newValue }];
            const canChange = this.sheet.bus?.emit(SHEET_EVENTS.BEFORE_CHANGE, [changeData], { source: "CellEditor" });
            if (canChange === false) {
                this.editor.value = this.formatValueForEditor(this.originalValue);
                this.editor.focus();
                return;
            }

            this.sheet.setCell(targetRow, targetCol, newValue, oldCell?.styleId || 0);

            // ✅ 通过 EventBus 发射 AFTER_CHANGE 事件（值变更后，指定 source 为 CellEditor）
            this.sheet.bus?.emit(SHEET_EVENTS.AFTER_CHANGE, [changeData], { source: "CellEditor" });
        }

        this.hide();

        // ✅ 通过 EventBus 发射"已完成编辑"事件（指定 source 为 CellEditor）
        this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_AFTER_FINISH, [this.activeRow, this.activeCol, this.originalValue, newValue], {
            source: "CellEditor",
        });

        if (this.viewport && isFunction(this.viewport.invalidateAll)) {
            this.viewport.invalidateAll();
        }
        this.#render();
    }

    #batchFill(range, value) {
        const parsedValue = this.sheet.parseCellValue(range.topRow, range.topCol, value);

        const changes = [];
        const processedMerges = new Set();

        for (let r = range.topRow; r <= range.bottomRow; r++) {
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                if (this.sheet.isDisabled(r, c)) continue;

                const merge = this.sheet.getMerge(r, c);
                if (merge) {
                    const mergeKey = `${merge.topRow},${merge.topCol}`;
                    if (processedMerges.has(mergeKey)) continue;
                    processedMerges.add(mergeKey);

                    const mergeR = merge.topRow;
                    const mergeC = merge.topCol;
                    const realMergeR = this.sheet.toRealRow(mergeR);
                    const oldCell = this.sheet.cellStore.get(realMergeR, mergeC);
                    const oldValue = oldCell?.value ?? "";
                    if (oldValue !== parsedValue) {
                        changes.push({ row: mergeR, col: mergeC, oldValue, newValue: parsedValue });
                    }
                } else {
                    const realR = this.sheet.toRealRow(r);
                    const oldCell = this.sheet.cellStore.get(realR, c);
                    const oldValue = oldCell?.value ?? "";
                    if (oldValue !== parsedValue) {
                        changes.push({ row: r, col: c, oldValue, newValue: parsedValue });
                    }
                }
            }
        }

        if (changes.length === 0) return;

        this.sheet.bus.emit(SHEET_EVENTS.BEFORE_CHANGE, changes, { source: "CellEditor" });

        if (this.useBatchInBatchFill()) {
            this.sheet.beginBatch();
        }
        for (const { row, col, newValue } of changes) {
            const realR = this.sheet.toRealRow(row);
            const oldCell = this.sheet.cellStore.get(realR, col);
            this.sheet.setCell(row, col, newValue, oldCell?.styleId || 0);
        }
        if (this.useBatchInBatchFill()) {
            this.sheet.endBatch();
        }

        this.sheet.bus.emit(SHEET_EVENTS.AFTER_CHANGE, changes, { source: "CellEditor" });
    }

    #onKeyDown(e) {
        if (!this.sheet) return;
        if (this.composing) return;

        switch (e.key) {
            case "Enter":
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) {
                    this.#commitAndFillSelection();
                } else {
                    this.#commitAndMoveNext("enter");
                }
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

    #commitAndFillSelection() {
        if (this.activeRow < 0 || !this.sheet) return;

        const newValue = this.getEditorValue();
        const range = this.sheet.selection.getRange();

        this.#batchFill(range, newValue);

        this.hide();
        if (this.viewport && isFunction(this.viewport.invalidateAll)) {
            this.viewport.invalidateAll();
        }
        this.#render();
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
            this.viewport.scrollToCell(targetRow, currentCol);
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
            this.viewport.scrollToCell(currentRow, finalCol);
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
        if (this.sheet && this.canvasContext && isFunction(this.canvasContext.render)) {
            this.canvasContext.render(this.sheet);
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

    /** @override */
    onDestroy() {
        this.renderEngine = null;
        this.sheet = null;
        this.editor = null;
        this.activeRow = -1;
        this.activeCol = -1;
        this.composing = false;
        this.originalValue = "";
    }
}
