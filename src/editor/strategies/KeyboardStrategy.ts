import { EventStrategy } from "./EventStrategy.js";
import { HOOKS } from "../../constants/hookNames.js";
import { CONFIG } from "../../constants/config";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import { isFunction } from "../../utils/helper.js";
import { InputDetector } from "../../utils/inputDetection.js";

/**
 * 键盘交互策略 (Keyboard Interaction Strategy)
 *
 * 处理Canvas表格中所有键盘相关的用户交互操作。
 * 负责单元格导航、编辑、数据操作等键盘快捷键功能。
 *
 * 优先级：STRATEGY_PRIORITY.KEYBOARD_BASE
 *
 * 核心功能：
 * 1. **方向键导航**：上下左右移动活动单元格，支持Shift扩展选区
 * 2. **Tab导航**：Tab/Shift+Tab在列间切换
 * 3. **编辑触发**：Enter/F2进入编辑模式，直接输入字符开始编辑
 * 4. **删除操作**：Delete/Backspace清空选区内容
 * 5. **撤销/重做**：Ctrl+Z/Ctrl+Y
 * 6. **全选**：Ctrl+A
 * 7. **格式切换**：Ctrl+B粗体/Ctrl+I斜体/Ctrl+U下划线
 * 8. **合并单元格跳转**：方向键自动跳过合并区域
 * 9. **隐藏列跳过**：左右移动时自动跳过隐藏列
 * 10. **交互类型单元格**：委托给CellType处理键盘事件
 *
 * 快捷键映射：
 * ┌──────────────┬──────────────────────────┐
 * │ 按键          │ 操作                     │
 * ├──────────────┼──────────────────────────┤
 * │ ArrowDown    │ 下移（+Shift扩展选区）    │
 * │ ArrowUp      │ 上移（+Shift扩展选区）    │
 * │ ArrowRight   │ 右移（+Shift扩展选区）    │
 * │ ArrowLeft    │ 左移（+Shift扩展选区）    │
 * │ Enter / F2   │ 进入编辑模式              │
 * │ Tab          │ 右移一列（+Shift左移）    │
 * │ Delete/Bksp  │ 清空选区内容              │
 * │ Ctrl+Z       │ 撤销                     │
 * │ Ctrl+Y       │ 重做                     │
 * │ Ctrl+A       │ 全选                     │
 * │ Ctrl+B       │ 切换粗体                 │
 * │ Ctrl+I       │ 切换斜体                 │
 * │ Ctrl+U       │ 切换下划线               │
 * │ 单字符键      │ 直接输入进入编辑          │
 * └──────────────┴──────────────────────────┘
 *
 * @class KeyboardStrategy
 * @extends EventStrategy
 */

/** 选区范围接口 */
interface SelectionRange {
    /** 起始行号 */
    topRow: number;
    /** 起始列号 */
    topCol: number;
    /** 结束行号 */
    bottomRow: number;
    /** 结束列号 */
    bottomCol: number;
}

export class KeyboardStrategy extends EventStrategy {
    /** 策略优先级：键盘基础交互 */
    priority: number = STRATEGY_PRIORITY.KEYBOARD_BASE;

    /** 上次检查的外部输入元素，用于检测焦点状态 */
    #lastCheckedElement: HTMLElement | null = null;
    /** 外部输入检测器，判断焦点是否在表单元素等外部控件上 */
    #inputDetector: InputDetector = new InputDetector();

    constructor(handler: any) {
        super(handler);
    }

    init(): void {}

    destroy(): void {}

    getEventHandlers(): Record<string, (e: Event) => boolean | void> {
        return {
            [DELEGATE_KEYS.DOCUMENT_KEYDOWN]: (e: Event) => this.#handleKeyDown(e as KeyboardEvent),
        };
    }

    /**
     * 处理键盘按下事件
     *
     * 根据当前编辑状态分发：
     * - 外部输入焦点 → 忽略
     * - 编辑器打开 → 委托给编辑中按键处理
     * - 非编辑状态 → 导航/快捷键处理
     *
     * @param e - 键盘事件
     */
    #handleKeyDown(e: KeyboardEvent): void | undefined {
        if (!this.enabled) return;

        const { sheet, editor } = this.handler;
        if (!sheet || !editor) return;

        if (this.#inputDetector.isExternalInput()) {
            return;
        }

        const activeEditor = editor.getActiveEditor();
        if (activeEditor && activeEditor.editor && activeEditor.editor.style.display === "block") {
            this.#handleEditingKey(e);
            return;
        }

        this.#handleNavigationKey(e);
    }

    /** 编辑器打开时的按键处理（预留扩展点） */
    #handleEditingKey(_e: KeyboardEvent): void {}

    /**
     * 非编辑状态下的导航和快捷键处理
     *
     * 处理顺序：
     * 1. 交互类型单元格委托
     * 2. Ctrl/Meta组合键（撤销/重做/全选/格式）
     * 3. 方向键/Enter/Tab/Delete等单键
     * 4. 直接字符输入
     *
     * @param e - 键盘事件
     */
    #handleNavigationKey(e: KeyboardEvent): void {
        const { sheet, editor } = this.handler;
        const [r, c] = sheet.selection.getActive();

        const cellType = this.#getCellTypeInstance(r, c);
        if (cellType?.isInteractive && isFunction(cellType.handleKeydown)) {
            const { sheet } = this.handler;
            const cell = sheet.cellDataAccessor?.get(r, c);
            const currentValue = cell?.value;
            const result = cellType.handleKeydown(e, currentValue);

            if (result !== null && result !== undefined) {
                e.preventDefault();

                if (sheet.setCell) {
                    sheet.setCell(r, c, result);
                }

                this.handler.render();
                return;
            }
        }

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
                if (!sheet.readOnly && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    this.#handleDirectInput(e);
                }
                break;
        }
    }

    /**
     * 删除选区内容
     * 遍历选区内所有非禁用单元格，清空其值并触发 beforeChange/afterChange 钩子
     */
    #handleDelete(): void {
        const { sheet } = this.handler;
        const accessor = sheet.cellDataAccessor;
        const range = sheet.selection.getRange();

        const changes: Array<{ row: number; col: number; oldValue: unknown; newValue: string }> = [];
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
     * 直接输入字符：打开编辑器并填入按键字符
     * @param e - 键盘事件
     */
    #handleDirectInput(e: KeyboardEvent): void {
        const { sheet, editor } = this.handler;

        const [ar, ac] = sheet.selection.getActive();
        editor.show(ar, ac);

        const activeEditor = editor.getActiveEditor();
        const inputEl = activeEditor?.editor;
        if (inputEl) {
            inputEl.value = e.key;

            if (inputEl.type === "text" || inputEl.type === "search" || inputEl.type === "url" || inputEl.type === "password") {
                inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
            }
        }
    }

    /** Ctrl+B 切换粗体 */
    #handleToggleBold(): void {
        const { sheet } = this.handler;
        const range = sheet.selection.getRange();
        this.#toggleStyleProperty(range, "fontWeight", "bold", "normal");
        this.handler.render();
    }

    /** Ctrl+I 切换斜体 */
    #handleToggleItalic(): void {
        const { sheet } = this.handler;
        const range = sheet.selection.getRange();
        this.#toggleStyleProperty(range, "fontStyle", "italic", "normal");
        this.handler.render();
    }

    /** Ctrl+U 切换下划线 */
    #handleToggleUnderline(): void {
        const { sheet } = this.handler;
        const range = sheet.selection.getRange();
        this.#toggleStyleProperty(range, "textDecoration", "underline", "none");
        this.handler.render();
    }

    /**
     * 切换选区样式属性
     * 根据锚点单元格的当前值在 activeValue/inactiveValue 间切换，应用到整个选区
     *
     * @param range - 选区范围
     * @param prop - 样式属性名
     * @param activeValue - 激活值（如 "bold"）
     * @param inactiveValue - 非激活值（如 "normal"）
     */
    #toggleStyleProperty(range: SelectionRange, prop: string, activeValue: string, inactiveValue: string): void {
        const { sheet } = this.handler;

        const [ar, ac] = sheet.selection.getActive();
        const anchorStyle = sheet.resolveStyle(ar, ac);
        const newValue = anchorStyle[prop] === activeValue ? inactiveValue : activeValue;

        sheet.setRangeStyle(range, { [prop]: newValue });

        this.handler.runHooks(HOOKS.AFTER_CHANGE, []);
    }

    /**
     * 方向键↓：下移活动单元格
     * @param row - 当前行号
     * @param col - 当前列号
     * @param shiftKey - 是否按住Shift（扩展选区）
     */
    #handleArrowDown(row: number, col: number, shiftKey: boolean): void {
        const { sheet } = this.handler;
        const rc = sheet.rowColManager;

        let currentRow: number, currentCol: number;
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
            this.#notifySelectionChanged(sheet);
        } else {
            this.#selectCellOrMerge(sheet, target.row, currentCol);
        }
        this.handler.viewport.scrollToCell(target.row, currentCol);
        this.handler.render();
    }

    /** 方向键↑：上移活动单元格 */
    #handleArrowUp(row: number, col: number, shiftKey: boolean): void {
        const { sheet } = this.handler;

        let currentRow: number, currentCol: number;
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
            this.#notifySelectionChanged(sheet);
        } else {
            this.#selectCellOrMerge(sheet, target.row, currentCol);
        }
        this.handler.viewport.scrollToCell(target.row, currentCol);
        this.handler.render();
    }

    /** 方向键→：右移活动单元格，自动跳过隐藏列 */
    #handleArrowRight(row: number, col: number, shiftKey: boolean): void {
        const { sheet } = this.handler;
        const rc = sheet.rowColManager;

        let currentRow: number, currentCol: number;
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
            this.#notifySelectionChanged(sheet);
        } else {
            this.#selectCellOrMerge(sheet, currentRow, target.col);
        }
        this.handler.viewport.scrollToCell(currentRow, target.col);
        this.handler.render();
    }

    /** 方向键←：左移活动单元格，自动跳过隐藏列 */
    #handleArrowLeft(row: number, col: number, shiftKey: boolean): void {
        const { sheet } = this.handler;

        let currentRow: number, currentCol: number;
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
            this.#notifySelectionChanged(sheet);
        } else {
            this.#selectCellOrMerge(sheet, currentRow, target.col);
        }
        this.handler.viewport.scrollToCell(currentRow, target.col);
        this.handler.render();
    }

    /** Tab键：在列间切换，自动跳过隐藏列 */
    #handleTab(row: number, col: number, shiftPressed: boolean): void {
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

    /**
     * 选中单元格或合并区域
     * @param sheet - 工作表实例
     * @param row - 行号
     * @param col - 列号
     */
    #selectCellOrMerge(sheet: any, row: number, col: number): void {
        const merge = sheet.getMerge(row, col);
        if (merge) {
            sheet.selection.setRange(merge.topRow, merge.topCol, merge.bottomRow, merge.bottomCol);
        } else {
            sheet.selection.setActive(row, col);
        }
        this.#notifySelectionChanged(sheet);
    }

    /** 通知选区变更，触发 AFTER_SELECTION 钩子 */
    #notifySelectionChanged(sheet: any): void {
        const range = sheet.selection.getRange();
        const focus = sheet.selection.getFocus();
        this.handler.runHooks(HOOKS.AFTER_SELECTION, range, focus);
    }

    /**
     * 获取合并单元格的左上角坐标
     * @param row - 行号
     * @param col - 列号
     * @returns 合并区域左上角或原始坐标
     */
    #getTopLeft(row: number, col: number): { row: number; col: number } {
        const merge = this.handler.sheet?.getMerge(row, col);
        if (merge) {
            return { row: merge.topRow, col: merge.topCol };
        }
        return { row, col };
    }

    /**
     * 安全获取单元格类型实例
     * @param row - 行号
     * @param col - 列号
     * @returns CellType实例或null
     */
    #getCellTypeInstance(row: number, col: number): any | null {
        try {
            return this.handler.sheet.getCellTypeInstance(row, col);
        } catch (error) {
            return null;
        }
    }
}
