import { EventStrategy } from "./EventStrategy.js";
import { HOOKS } from "../../constants/hookNames.js";
import { CONFIG } from "../../constants/config";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";

/**
 * 键盘交互策略
 * 优先级 0（默认），低于 CopyPasteStrategy(10)，确保 Ctrl+C/V/X 优先被 CopyPastePlugin 拦截
 *
 * 处理以下键盘操作：
 * - 方向键导航（支持 Shift 扩展选区）
 * - Enter/F2 进入编辑
 * - Tab 切换单元格
 * - Delete/Backspace 批量清空选区内容
 * - Ctrl+A 全选
 * - Ctrl+Z/Y 撤销/重做
 * - Ctrl+B/I/U 格式化加粗/斜体/下划线（批量格式化）
 * - 直接输入字符进入批量赋值模式
 *
 * 注意：Ctrl+C/V/X（复制/粘贴/剪切）已移至 CopyPasteStrategy，由 CopyPastePlugin 管理。
 */
export class KeyboardStrategy extends EventStrategy {
    constructor(handler) {
        super(handler);
    }

    init() {}

    destroy() {}

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.DOCUMENT_KEYDOWN]: (e) => this.#handleKeyDown(e),
        };
    }

    /**
     * 键盘事件总入口
     * 根据当前编辑状态分发到不同的处理方法
     */
    #handleKeyDown(e) {
        if (!this.enabled) return;

        const { sheet, editor } = this.handler;
        if (!sheet || !editor) return;

        const activeEditor = editor.getActiveEditor();
        if (activeEditor && activeEditor.editor && activeEditor.editor.style.display === "block") {
            this.#handleEditingKey(e);
            return;
        }

        this.#handleNavigationKey(e);
    }

    /** 编辑状态下的按键处理（预留扩展） */
    #handleEditingKey(e) {}

    /**
     * 非编辑状态下的按键处理
     * 处理导航、删除、格式化、批量赋值等操作
     */
    #handleNavigationKey(e) {
        const { sheet, editor } = this.handler;
        const [r, c] = sheet.selection.getActive();

        // Ctrl/Meta 快捷键检测（独立于 switch，避免拦截非 Ctrl 时的字母输入）
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case "z":
                    e.preventDefault();
                    sheet.undo();
                    this.handler.render();
                    return;
                case "y":
                    e.preventDefault();
                    sheet.redo();
                    this.handler.render();
                    return;
                case "a":
                    e.preventDefault();
                    const rcAll = sheet.rowColManager;
                    sheet.selection.selectAll(rcAll.rowCount - 1, rcAll.realColCount - 1);
                    this.handler.render();
                    return;
                case "b":
                    e.preventDefault();
                    this.#handleToggleBold();
                    return;
                case "i":
                    e.preventDefault();
                    this.#handleToggleItalic();
                    return;
                case "u":
                    e.preventDefault();
                    this.#handleToggleUnderline();
                    return;
            }
        }

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                this.#handleArrowDown(r, c, e.shiftKey);
                break;
            case "ArrowUp":
                e.preventDefault();
                this.#handleArrowUp(r, c, e.shiftKey);
                break;
            case "ArrowRight":
                e.preventDefault();
                this.#handleArrowRight(r, c, e.shiftKey);
                break;
            case "ArrowLeft":
                e.preventDefault();
                this.#handleArrowLeft(r, c, e.shiftKey);
                break;
            case "Enter":
            case "F2":
                if (sheet.readOnly) break;
                e.preventDefault();
                editor.show(r, c, "end");
                break;
            case "Tab":
                e.preventDefault();
                this.#handleTab(r, c, e.shiftKey);
                break;
            case "Delete":
            case "Backspace":
                e.preventDefault();
                this.#handleDelete();
                break;
            default:
                /**
                 * 直接输入可打印字符 → 进入批量赋值模式
                 * 选中区域后直接输入，所有选中单元格填充相同值
                 * 这是 Excel 的标准行为：
                 * - 选中 A1:C3 → 输入 "hello" → A1:C3 全部变为 "hello"
                 * - 输入后光标自动进入编辑状态，位于活动单元格
                 */
                if (!sheet.readOnly && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    this.#handleDirectInput(e);
                }
                break;
        }
    }

    /**
     * 批量删除（Delete / Backspace）
     * 清空选区内所有非禁用单元格的内容
     * 触发 beforeChange 和 afterChange 钩子
     */
    #handleDelete() {
        const { sheet } = this.handler;
        const accessor = sheet.cellDataAccessor;
        const range = sheet.selection.getRange();

        const changes = [];
        for (let r = range.topRow; r <= range.bottomRow; r++) {
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                if (!sheet.isDisabled(r, c)) {
                    const oldCell = accessor.get(r, c);
                    if (oldCell && oldCell.value !== "") {
                        changes.push({ row: r, col: c, oldValue: oldCell.value, newValue: "" });
                    }
                }
            }
        }

        if (changes.length === 0) return;

        this.handler.runHooks(HOOKS.BEFORE_CHANGE, changes);

        sheet.beginBatch();
        for (const { row, col } of changes) {
            const oldCell = accessor.get(row, col);
            sheet.setCell(row, col, "", oldCell?.styleId || 0);
        }
        sheet.endBatch();

        this.handler.runHooks(HOOKS.AFTER_CHANGE, changes);
        this.handler.render();
    }

    /**
     * 直接输入字符 → 批量赋值模式
     * 选中区域后直接输入可打印字符：
     * 1. 先清空选区所有单元格
     * 2. 将输入的字符作为初始值进入编辑状态
     * 3. 编辑完成（blur/Enter）时，将值写入活动单元格
     *    （Ctrl+Enter 时写入整个选区）
     *
     * 行为与 Excel 一致：
     * - 选中 A1:C3 → 输入 "hello" → 仅 A1 变为 "hello"（活动单元格）
     * - 选中 A1:C3 → 输入 "hello" → Ctrl+Enter → A1:C3 全部变为 "hello"
     */
    #handleDirectInput(e) {
        const { sheet, editor } = this.handler;

        const [ar, ac] = sheet.selection.getActive();
        editor.show(ar, ac);

        const activeEditor = editor.getActiveEditor();
        const inputEl = activeEditor?.editor;
        if (inputEl) {
            inputEl.value = e.key;

            // 原生 date/number/month 等类型输入框不支持 setSelectionRange
            if (inputEl.type === "text" || inputEl.type === "search" || inputEl.type === "url" || inputEl.type === "password") {
                inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
            }
        }
    }

    /**
     * 标记批量赋值模式
     * 在 sheet 上存储批量填充信息，
     * TextEditor blur 时读取并执行批量填充
     *
     * @param {import("../../workbook/Sheet.js").Sheet} sheet
     * @param {{ topRow: number, topCol: number, bottomRow: number, bottomCol: number }} range
     */
    #markBatchFill(sheet, range) {
        sheet._batchFillRange = {
            topRow: range.topRow,
            topCol: range.topCol,
            bottomRow: range.bottomRow,
            bottomCol: range.bottomCol,
        };
    }

    /**
     * 切换加粗（Ctrl+B）
     * 对选区内所有单元格切换 fontWeight: bold / normal
     */
    #handleToggleBold() {
        const { sheet } = this.handler;
        const range = sheet.selection.getRange();
        this.#toggleStyleProperty(range, "fontWeight", "bold", "normal");
        this.handler.render();
    }

    /**
     * 切换斜体（Ctrl+I）
     * 对选区内所有单元格切换 fontStyle: italic / normal
     */
    #handleToggleItalic() {
        const { sheet } = this.handler;
        const range = sheet.selection.getRange();
        this.#toggleStyleProperty(range, "fontStyle", "italic", "normal");
        this.handler.render();
    }

    /**
     * 切换下划线（Ctrl+U）
     * 对选区内所有单元格切换 textDecoration: underline / none
     */
    #handleToggleUnderline() {
        const { sheet } = this.handler;
        const range = sheet.selection.getRange();
        this.#toggleStyleProperty(range, "textDecoration", "underline", "none");
        this.handler.render();
    }

    /**
     * 通用样式属性切换
     * 以锚点单元格的当前样式判断切换方向，对整个选区统一应用
     * 避免遍历所有单元格检查，提升大范围选区性能
     *
     * @param {{ topRow: number, topCol: number, bottomRow: number, bottomCol: number }} range - 选区范围
     * @param {string} prop - 样式属性名（如 "fontWeight"）
     * @param {string} activeValue - 激活值（如 "bold"）
     * @param {string} inactiveValue - 未激活值（如 "normal"）
     */
    #toggleStyleProperty(range, prop, activeValue, inactiveValue) {
        const { sheet } = this.handler;

        const [ar, ac] = sheet.selection.getActive();
        const anchorStyle = sheet.resolveStyle(ar, ac);
        const newValue = anchorStyle[prop] === activeValue ? inactiveValue : activeValue;

        sheet.setRangeStyle(range, { [prop]: newValue });

        this.handler.runHooks(HOOKS.AFTER_CHANGE, []);
    }

    #handleArrowDown(row, col, shiftKey) {
        const { sheet } = this.handler;
        const rc = sheet.rowColManager;

        let currentRow, currentCol;
        if (shiftKey) {
            [currentRow, currentCol] = sheet.selection.getFocus();
        } else {
            [currentRow, currentCol] = [row, col];
        }

        let nextRow = Math.min(rc.rowCount - 1, currentRow + 1);
        const merge = sheet.getMerge(currentRow, currentCol);
        if (merge && currentRow + 1 <= merge.bottomRow) {
            nextRow = merge.bottomRow + 1;
        }
        nextRow = Math.min(CONFIG.MAX_ROWS - 1, nextRow);
        const target = this.#getTopLeft(nextRow, currentCol);

        if (shiftKey) {
            sheet.selection.setRange(sheet.selection.getAnchor()[0], sheet.selection.getAnchor()[1], target.row, currentCol);
        } else {
            this.#selectCellOrMerge(sheet, target.row, currentCol);
        }
        this.handler.viewport.scrollToCell(target.row, currentCol);
        this.handler.render();
    }

    #handleArrowUp(row, col, shiftKey) {
        const { sheet } = this.handler;

        let currentRow, currentCol;
        if (shiftKey) {
            [currentRow, currentCol] = sheet.selection.getFocus();
        } else {
            [currentRow, currentCol] = [row, col];
        }

        let prevRow = Math.max(0, currentRow - 1);
        const merge = sheet.getMerge(currentRow, currentCol);
        if (merge && currentRow - 1 >= merge.topRow) {
            prevRow = merge.topRow - 1;
        }
        const target = this.#getTopLeft(prevRow, currentCol);

        if (shiftKey) {
            sheet.selection.setRange(sheet.selection.getAnchor()[0], sheet.selection.getAnchor()[1], target.row, currentCol);
        } else {
            this.#selectCellOrMerge(sheet, target.row, currentCol);
        }
        this.handler.viewport.scrollToCell(target.row, currentCol);
        this.handler.render();
    }

    #handleArrowRight(row, col, shiftKey) {
        const { sheet } = this.handler;
        const rc = sheet.rowColManager;

        let currentRow, currentCol;
        if (shiftKey) {
            [currentRow, currentCol] = sheet.selection.getFocus();
        } else {
            [currentRow, currentCol] = [row, col];
        }

        let nextCol = Math.min(rc.colCount - 1, currentCol + 1);
        const merge = sheet.getMerge(currentRow, currentCol);
        if (merge && currentCol + 1 <= merge.bottomCol) {
            nextCol = merge.bottomCol + 1;
        }
        nextCol = Math.min(CONFIG.MAX_COLS - 1, nextCol);

        while (sheet.rowColManager.isColumnHidden(nextCol) && nextCol < CONFIG.MAX_COLS - 1) {
            nextCol++;
        }

        const target = this.#getTopLeft(currentRow, nextCol);

        if (shiftKey) {
            sheet.selection.setRange(sheet.selection.getAnchor()[0], sheet.selection.getAnchor()[1], currentRow, target.col);
        } else {
            this.#selectCellOrMerge(sheet, currentRow, target.col);
        }
        this.handler.viewport.scrollToCell(currentRow, target.col);
        this.handler.render();
    }

    #handleArrowLeft(row, col, shiftKey) {
        const { sheet } = this.handler;

        let currentRow, currentCol;
        if (shiftKey) {
            [currentRow, currentCol] = sheet.selection.getFocus();
        } else {
            [currentRow, currentCol] = [row, col];
        }

        let prevCol = Math.max(0, currentCol - 1);
        const merge = sheet.getMerge(currentRow, currentCol);
        if (merge && currentCol - 1 >= merge.topCol) {
            prevCol = merge.topCol - 1;
        }

        while (sheet.rowColManager.isColumnHidden(prevCol) && prevCol > 0) {
            prevCol--;
        }

        const target = this.#getTopLeft(currentRow, prevCol);

        if (shiftKey) {
            sheet.selection.setRange(sheet.selection.getAnchor()[0], sheet.selection.getAnchor()[1], currentRow, target.col);
        } else {
            this.#selectCellOrMerge(sheet, currentRow, target.col);
        }
        this.handler.viewport.scrollToCell(currentRow, target.col);
        this.handler.render();
    }

    #handleTab(row, col, shiftPressed) {
        const { sheet } = this.handler;
        const rc = sheet.rowColManager;
        let nextCol = shiftPressed ? Math.max(0, col - 1) : Math.min(rc.colCount - 1, col + 1);

        while (sheet.rowColManager.isColumnHidden(nextCol)) {
            if (shiftPressed) {
                if (nextCol <= 0) break;
                nextCol--;
            } else {
                if (nextCol >= rc.colCount - 1) break;
                nextCol++;
            }
        }

        const target = this.#getTopLeft(row, nextCol);
        this.#selectCellOrMerge(sheet, row, target.col);
        this.handler.viewport.scrollToCell(row, target.col);
        this.handler.render();
    }

    #selectCellOrMerge(sheet, row, col) {
        const merge = sheet.getMerge(row, col);
        if (merge) {
            sheet.selection.setRange(merge.topRow, merge.topCol, merge.bottomRow, merge.bottomCol);
        } else {
            sheet.selection.setActive(row, col);
        }
    }

    /**
     * 获取合并单元格的左上角位置
     * 如果 (row, col) 在合并区域内，返回合并区域的左上角
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {{ row: number, col: number }}
     */
    #getTopLeft(row, col) {
        const merge = this.handler.sheet?.getMerge(row, col);
        if (merge) {
            return { row: merge.topRow, col: merge.topCol };
        }
        return { row, col };
    }
}
