import { EventStrategy } from "./EventStrategy.js";
import { HOOKS } from "../../constants/hookNames.js";
import { CONFIG } from "../../constants/config";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import { isFunction } from "../../utils/helper.js";

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
    /**
     * 策略优先级
     * 使用语义化常量：KEYBOARD_BASE = 100（基础键盘输入）
     * @type {number}
     */
    priority = STRATEGY_PRIORITY.KEYBOARD_BASE;

    constructor(handler) {
        super(handler);

        // ✅ 性能优化：缓存上次检查结果
        // 避免在快速连续输入时重复DOM查询（如按住键盘不放，每秒30-60次触发）
        this.#lastCheckedElement = null;
        this.#lastCheckResult = false;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 私有属性：焦点检查缓存
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /** @type {HTMLElement|null} 上次检查的焦点元素 */
    #lastCheckedElement = null;

    /** @type {boolean} 上次检查的结果 */
    #lastCheckResult = false;

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

        // ✅ 关键修复：检查当前焦点是否在非Canvas的输入元素上
        // 如果焦点在 input、textarea、select 或 contenteditable 元素上，
        // 则不处理键盘事件，让浏览器默认行为生效
        if (this.#isFocusOnExternalInput()) {
            return; // 让input/textarea正常接收输入
        }

        const activeEditor = editor.getActiveEditor();
        if (activeEditor && activeEditor.editor && activeEditor.editor.style.display === "block") {
            this.#handleEditingKey(e);
            return;
        }

        this.#handleNavigationKey(e);
    }

    /**
     * 检查当前焦点是否在外部输入元素上（非Canvas编辑器）
     *
     * ✅ 解决致命Bug：防止键盘事件被全局劫持，
     * 导致页面上的input/textarea无法正常输入。
     *
     * 🎯 全面性保障：
     * - 覆盖所有HTML5原生输入元素
     * - 支持ARIA无障碍角色
     * - 识别Shadow DOM中的输入框
     * - 正确识别Canvas编辑器（.cs-cell-editor）
     * - 过滤禁用/只读/隐藏的无效输入框
     * - 性能优化：缓存机制 + 快速路径
     *
     * @returns {boolean} true=焦点在外部输入元素上，false=焦点在Canvas或其他区域
     */
    #isFocusOnExternalInput() {
        const activeElement = document.activeElement;

        if (!activeElement) return false;

        // ✅ 快速路径1：检查是否是body/html本身（非输入元素）
        if (activeElement.tagName === "BODY" || activeElement.tagName === "HTML") {
            return false;
        }

        // ✅ 快速路径2：缓存检查（避免重复DOM查询）
        if (this.#lastCheckedElement === activeElement) {
            return this.#lastCheckResult;
        }

        let result = this.#performFullCheck(activeElement);

        // 缓存结果（下次同一元素直接返回）
        this.#lastCheckedElement = activeElement;
        this.#lastCheckResult = result;

        return result;
    }

    /**
     * 执行完整的焦点元素检查（核心逻辑）
     */
    #performFullCheck(activeElement) {
        const tagName = activeElement.tagName.toLowerCase();

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 1️⃣ 第一层：快速排除非输入元素
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // 常见的文本输入元素白名单
        const INPUT_ELEMENTS = new Set([
            "input",
            "textarea",
            "select",
            // 可能的扩展元素
            "button", // 按钮也可能需要键盘响应
        ]);

        if (!INPUT_ELEMENTS.has(tagName)) {
            // 非标准输入元素，检查 contenteditable 和 ARIA 角色
            const isContentEditable = activeElement.isContentEditable || activeElement.getAttribute("contenteditable") === "true";

            const hasAriaInputRole = this.#hasAriaInputRole(activeElement);

            if (!isContentEditable && !hasAriaInputRole) {
                return false; // 完全不是输入元素
            }
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 2️⃣ 第二层：过滤无效状态
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // 排除禁用、只读、隐藏的元素
        if (
            activeElement.disabled ||
            activeElement.readOnly ||
            activeElement.style.display === "none" ||
            activeElement.style.visibility === "hidden" ||
            activeElement.offsetParent === null // 不在渲染树中
        ) {
            return false; // 虽然是input但无法交互
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 3️⃣ 第三层：识别Canvas编辑器（关键！）
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        if (this.#isOurCellEditor(activeElement)) {
            return false; // 是我们自己的编辑器，不拦截
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 4️⃣ 第四层：确认是外部输入元素
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        return true; // 通过所有检查 → 确实是外部输入框
    }

    /**
     * 检查元素是否有ARIA输入角色
     *
     * 支持WAI-ARIA规范中的文本输入相关角色：
     * - textbox: 多行或单行文本输入
     * - combobox: 下拉组合框
     * - searchbox: 搜索框
     * - spinbutton: 数字调节按钮
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    #hasAriaInputRole(element) {
        const role = element.getAttribute("role");
        if (!role) return false;

        const INPUT_ROLES = new Set(["textbox", "combobox", "searchbox", "spinbutton"]);

        return INPUT_ROLES.has(role.toLowerCase());
    }

    /**
     * 判断是否是我们自己的Canvas单元格编辑器
     *
     * ✅ 修复原bug：原来使用 .cell-editor 但实际class是 .cs-cell-editor
     *
     * 识别策略（按优先级）：
     * 1. CSS类名匹配：.cs-cell-editor（最可靠）
     * 2. DOM位置：在 #wrap 容器内（备用方案）
     * 3. 数据属性：data-editor-type（未来可扩展）
     *
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    #isOurCellEditor(element) {
        // 方式1：CSS类名匹配（最准确）
        if (element.classList.contains("cs-cell-editor")) {
            return true;
        }

        // 方式2：检查父级容器（兼容性方案）
        // 注意：#wrap 是canvas的容器，编辑器被appendChild到这里
        const wrapContainer = element.closest("#wrap");
        if (wrapContainer && wrapContainer.querySelector("canvas")) {
            // 确认这个wrap里确实有canvas（避免误判其他#wrap）

            // 进一步验证：检查是否在canvas附近（z-index层级关系）
            const canvas = wrapContainer.querySelector("canvas");
            if (canvas && element.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_CONTAINS) {
                return true;
            }
        }

        // 方式3：数据属性标记（未来扩展）
        if (element.getAttribute("data-canvas-editor") === "true") {
            return true;
        }

        // 方式4：实例引用检查（最可靠但需要额外实现）
        // TODO: 可以考虑在CellEditor创建时注册到全局映射表
        // const editorManager = this.handler.editor;
        // if (editorManager?.isOurEditor(element)) return true;

        return false;
    }

    /** 编辑状态下的按键处理（预留扩展） */
    #handleEditingKey(e) {}

    /**
     * 非编辑状态下的按键处理
     * 处理导航、删除、格式化、批量赋值等操作
     *
     * ✅ 新增：支持交互式单元格类型（如 StarRatingType、TrafficLightType）
     * 当活动单元格的 type 是交互式类型时，优先将键盘事件分发给它的 handleKeydown() 方法
     */
    #handleNavigationKey(e) {
        const { sheet, editor } = this.handler;
        const [r, c] = sheet.selection.getActive();

        // ✅ 新增：检查当前单元格是否为交互式类型
        const cellType = this.#getCellTypeInstance(r, c);
        if (cellType?.isInteractive && isFunction(cellType.handleKeydown)) {
            const { sheet } = this.handler;
            const cell = sheet.cellDataAccessor?.get(r, c);
            const currentValue = cell?.value;
            const result = cellType.handleKeydown(e, currentValue);

            if (result !== null && result !== undefined) {
                e.preventDefault(); // 阻止默认导航行为

                if (sheet.setCell) {
                    sheet.setCell(r, c, result);
                }

                this.handler.render();
                return; // ✅ 已被交互式类型处理，不再执行默认导航
            }

            // 如果返回 null/undefined，说明此按键未被该类型处理，继续执行默认逻辑
        }

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

    /**
     * 获取指定位置的单元格类型实例
     *
     * ✅ 用于交互式单元格类型的键盘事件分发
     * 支持 StarRatingType、TrafficLightType 等自定义渲染器
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {object|null} 单元格类型实例或 null
     */
    #getCellTypeInstance(row, col) {
        try {
            return this.handler.sheet.getCellTypeInstance(row, col);
        } catch (error) {
            return null;
        }
    }
}
