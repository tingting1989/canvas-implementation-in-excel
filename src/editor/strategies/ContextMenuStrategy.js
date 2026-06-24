import { EventStrategy } from "./EventStrategy.js";
import { HIT_TYPE } from "../../constants/hitType";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";

/**
 * 右键菜单策略
 * 优先级 0（默认），contextmenu 事件无与其他策略冲突
 *
 * 根据右击区域显示不同菜单：
 * - 单元格（cell）：完整菜单（行/列操作 + 合并 + 清空 + 自定义项）
 * - 行头（rowHeader）：行操作菜单（插入行/删除行/清空内容）
 * - 列头（colHeader）：列操作菜单（插入列/删除列/清空内容）
 * - 左上角（corner）：不弹出菜单
 *
 * 事件委托模式：
 * - hover 效果由内嵌 CSS :hover 伪类处理，无需 JS 监听
 * - click 事件委托到 #menuEl 容器，通过 data-key + #menuItemMap 查找目标项
 * - 菜单项增减不影响监听器数量，始终只有 1 个 click 委托监听器
 *
 * 自定义菜单项配置（customItems）：
 * - label: string        — 菜单项文本
 * - action: Function     — 点击回调 (row, col, sheet) => void
 * - key: string          — 可选，唯一标识，默认 custom_${index}
 * - contexts: string[]   — 可选，在哪些上下文中显示，默认 ["cell"]
 *                          可选值："cell" | "rowHeader" | "colHeader"
 * - type: "separator"    — 可选，插入分隔线
 *
 * 禁用内置菜单项（disabledItems）：
 * - 传入内置项 key 数组，如 ["mergeCells", "unmergeCells"]
 *
 * @example
 * new ContextMenuStrategy(handler, {
 *     customItems: [
 *         { label: "高亮行", contexts: ["cell", "rowHeader"], action: (r, c, s) => s.setRowStyle(r, styleId) },
 *         { type: "separator" },
 *         { label: "导出", contexts: ["cell"], action: (r, c, s) => exportSheet(s) },
 *     ],
 *     disabledItems: ["mergeCells", "unmergeCells"],
 * })
 */
export class ContextMenuStrategy extends EventStrategy {
    /** 右键菜单 DOM 容器 */
    #menuEl = null;

    /** 右键点击时的行号 */
    #row = -1;

    /** 右键点击时的列号 */
    #col = -1;

    /** 当前右击上下文：cell / rowHeader / colHeader */
    #context = "cell";

    /**
     * 所有菜单项 key → {label, action} 映射
     * 包含内置项（未被 disabledItems 过滤）和自定义项
     * 用于 click 委托时 O(1) 查找目标菜单项
     */
    #menuItemMap = new Map();

    /** 被禁用的内置菜单项 key 集合 */
    #disabledKeys = new Set();

    /** 自定义菜单项原始配置（保留 contexts 等信息用于按上下文过滤） */
    #customItems = [];

    /**
     * 只读模式下禁用的内置菜单项 key
     */
    static #READONLY_DISABLED = new Set([
        "insertRowAbove",
        "insertRowBelow",
        "insertColLeft",
        "insertColRight",
        "deleteRow",
        "deleteCol",
        "mergeCells",
        "unmergeCells",
        "clearContent",
        "insertImage",
        "hideRow",
        "showRow",
        "hideColumn",
        "showColumn",
        "freezeAtCell",
        "freezeRow",
        "freezeCol",
        "unfreeze",
    ]);

    /**
     * 各上下文对应的内置菜单项排列顺序
     * null 表示分隔线，字符串为 #menuItemMap 中的 key
     */
    static #CONTEXT_ITEMS = {
        cell: [
            "insertRowAbove",
            "insertRowBelow",
            "insertColLeft",
            "insertColRight",
            null,
            "deleteRow",
            "deleteCol",
            null,
            "hideRow",
            "showRow",
            "hideColumn",
            "showColumn",
            null,
            "freezeAtCell",
            "freezeRow",
            "freezeCol",
            "unfreeze",
            null,
            "mergeCells",
            "unmergeCells",
            null,
            "insertImage",
            null,
            "clearContent",
        ],
        rowHeader: [
            "insertRowAbove",
            "insertRowBelow",
            null,
            "deleteRow",
            null,
            "hideRow",
            "showRow",
            null,
            "freezeAtCell",
            "freezeRow",
            "unfreeze",
            null,
            "clearContent",
        ],
        colHeader: [
            "insertColLeft",
            "insertColRight",
            null,
            "deleteCol",
            null,
            "hideColumn",
            "showColumn",
            null,
            "freezeAtCell",
            "freezeCol",
            "unfreeze",
            null,
            "clearContent",
        ],
    };

    /**
     * @param {EventHandler} handler - 事件处理器实例
     * @param {object} [options={}] - 菜单配置
     * @param {Array} [options.customItems=[]] - 自定义菜单项
     * @param {string[]} [options.disabledItems=[]] - 禁用的内置菜单项 key
     */
    constructor(handler, options = {}) {
        super(handler);
        this.#buildMenuItems(options);
    }

    /**
     * 构建菜单项映射
     * 将内置项和自定义项统一注册到 #menuItemMap，供委托查找
     *
     * @param {object} options - 同构造函数 options
     */
    #buildMenuItems(options) {
        const builtIn = this._buildBuiltInItems();
        const disabledItems = options.disabledItems || [];
        this.#customItems = options.customItems || [];

        for (const key of disabledItems) {
            this.#disabledKeys.add(key);
        }

        // 注册未被禁用的内置菜单项
        for (const [key, item] of Object.entries(builtIn)) {
            if (!this.#disabledKeys.has(key)) {
                this.#menuItemMap.set(key, item);
            }
        }

        // 注册自定义菜单项（分隔线不需要注册，仅保留在 #customItems 中用于渲染）
        for (let i = 0; i < this.#customItems.length; i++) {
            const ci = this.#customItems[i];
            if (ci.type === "separator") continue;
            const key = ci.key || `custom_${i}`;
            this.#menuItemMap.set(key, { label: ci.label, action: ci.action });
        }
    }

    /** 初始化：创建菜单 DOM 容器 */
    init() {
        this.#createMenu();
    }

    /** 销毁：移除菜单 DOM */
    destroy() {
        this.#menuEl?.remove();
        this.#menuEl = null;
    }

    /**
     * 注册 canvas 级别的事件处理器
     * - contextmenu：右键弹出菜单
     * - mousedown：点击菜单外部关闭
     */
    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_CONTEXTMENU]: (e) => this.#handleContextMenu(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEDOWN]: (e) => this.#handleDismiss(e),
        };
    }

    /**
     * 构建内置菜单项定义
     * 每个 action 签名为 (row, col, sheet) => void
     * row/col 为右击位置，sheet 为当前工作表
     *
     * @returns {Object<string, {label: string, action: Function}>}
     */
    _buildBuiltInItems() {
        return {
            insertRowAbove: {
                label: "在上方插入行",
                action: (r, c, sheet) => sheet.insertRow(r),
            },
            insertRowBelow: {
                label: "在下方插入行",
                action: (r, c, sheet) => sheet.insertRow(r + 1),
            },
            deleteRow: {
                label: "删除行",
                action: (r, c, sheet) => {
                    const range = sheet.selection.getRange();
                    for (let i = range.bottomRow; i >= range.topRow; i--) {
                        sheet.deleteRow(i);
                    }
                },
            },
            insertColLeft: {
                label: "在左侧插入列",
                action: (r, c, sheet) => sheet.insertCol(c),
            },
            insertColRight: {
                label: "在右侧插入列",
                action: (r, c, sheet) => sheet.insertCol(c + 1),
            },
            deleteCol: {
                label: "删除列",
                action: (r, c, sheet) => {
                    const range = sheet.selection.getRange();
                    for (let i = range.bottomCol; i >= range.topCol; i--) {
                        sheet.deleteCol(i);
                    }
                },
            },
            mergeCells: {
                label: "合并单元格",
                action: (r, c, sheet) => {
                    const range = sheet.selection.getRange();
                    sheet.mergeCells(range.topRow, range.topCol, range.bottomRow, range.bottomCol);
                },
            },
            unmergeCells: {
                label: "取消合并",
                action: (r, c, sheet) => sheet.unmergeCells(r, c),
            },
            insertImage: {
                label: "插入图片",
                action: (r, c, sheet) => {
                    const clipboard = sheet.bus.emit(SHEET_EVENTS.GET_CLIPBOARD, undefined, { source: "ContextMenuStrategy" });
                    if (!clipboard) return;
                    clipboard.insertImageFromFile(sheet, { row: r, col: c });
                },
            },
            clearContent: {
                label: "清空内容",
                action: (r, c, sheet) => {
                    const range = sheet.selection.getRange();
                    sheet.beginBatch();
                    for (let row = range.topRow; row <= range.bottomRow; row++) {
                        for (let col = range.topCol; col <= range.bottomCol; col++) {
                            if (!sheet.isDisabled(row, col)) {
                                const realR = sheet.toRealRow(row);
                                const clipboard = sheet.bus.emit(SHEET_EVENTS.GET_CLIPBOARD, undefined, { source: "ContextMenuStrategy" });
                                clipboard?.removeCellContent(sheet, realR, col);
                                sheet.setCell(row, col, "", 0);
                            }
                        }
                    }
                    sheet.endBatch();
                },
            },
            hideRow: {
                label: "隐藏行",
                action: (r, c, sheet) => {
                    const hiddenRows = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "hiddenRows" }, { source: "ContextMenuStrategy" });
                    if (!hiddenRows) return;
                    const range = sheet.selection.getRange();
                    const rows = [];
                    for (let row = range.topRow; row <= range.bottomRow; row++) {
                        rows.push(row);
                    }
                    hiddenRows.hideRows(rows);
                },
            },
            showRow: {
                label: "显示行",
                action: (r, c, sheet) => {
                    const hiddenRows = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "hiddenRows" }, { source: "ContextMenuStrategy" });
                    if (!hiddenRows) return;
                    const rc = sheet.rowColManager;
                    const range = sheet.selection.getRange();
                    const rows = [];
                    for (let row = Math.max(0, range.topRow - 1); row <= range.bottomRow + 1; row++) {
                        if (rc.isRowHidden(row)) rows.push(row);
                    }
                    if (rows.length > 0) hiddenRows.showRows(rows);
                },
            },
            hideColumn: {
                label: "隐藏列",
                action: (r, c, sheet) => {
                    const hiddenCols = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "hiddenColumns" }, { source: "ContextMenuStrategy" });
                    if (!hiddenCols) return;
                    const range = sheet.selection.getRange();
                    const cols = [];
                    for (let col = range.topCol; col <= range.bottomCol; col++) {
                        cols.push(col);
                    }
                    hiddenCols.hideColumns(cols);
                },
            },
            showColumn: {
                label: "显示列",
                action: (r, c, sheet) => {
                    const hiddenCols = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "hiddenColumns" }, { source: "ContextMenuStrategy" });
                    if (!hiddenCols) return;
                    const rc = sheet.rowColManager;
                    const range = sheet.selection.getRange();
                    const cols = [];
                    for (let col = Math.max(0, range.topCol - 1); col <= range.bottomCol + 1; col++) {
                        if (rc.isColumnHidden(col)) cols.push(col);
                    }
                    if (cols.length > 0) hiddenCols.showColumns(cols);
                },
            },
            freezeAtCell: {
                label: "冻结至此处",
                action: (r, c, sheet) => {
                    const freeze = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "freeze" }, { source: "ContextMenuStrategy" });
                    if (!freeze) return;
                    freeze.freeze(r, c);
                },
            },
            freezeRow: {
                label: "冻结首行",
                action: (r, c, sheet) => {
                    const freeze = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "freeze" }, { source: "ContextMenuStrategy" });
                    if (!freeze) return;
                    freeze.freeze(1, freeze.fixedColumnsStart);
                },
            },
            freezeCol: {
                label: "冻结首列",
                action: (r, c, sheet) => {
                    const freeze = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "freeze" }, { source: "ContextMenuStrategy" });
                    if (!freeze) return;
                    freeze.freeze(freeze.fixedRowsTop, 1);
                },
            },
            unfreeze: {
                label: "取消冻结",
                action: (r, c, sheet) => {
                    const freeze = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "freeze" }, { source: "ContextMenuStrategy" });
                    if (!freeze) return;
                    freeze.unfreeze();
                },
            },
        };
    }

    /**
     * 创建右键菜单 DOM 容器（一次性）
     * - 内嵌 <style> 处理 .ctx-item:hover 效果，替代 JS mouseenter/mouseleave
     * - click 事件委托到容器，通过 data-key 查找 #menuItemMap
     */
    #createMenu() {
        this.#menuEl = document.createElement("div");
        this.#menuEl.className = "ctx-menu";
        Object.assign(this.#menuEl.style, {
            position: "fixed",
            display: "none",
            zIndex: "10000",
            background: "#fff",
            border: "1px solid #d0d0d0",
            borderRadius: "6px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            padding: "4px 0",
            minWidth: "180px",
            fontFamily: "12px sans-serif",
            fontSize: "13px",
            userSelect: "none",
        });

        // 内嵌 CSS：hover 效果由浏览器原生 :hover 处理，无需 JS 监听
        const style = document.createElement("style");
        style.textContent = `.ctx-menu .ctx-item:hover{background:#f0f4ff}`;
        this.#menuEl.appendChild(style);

        // 事件委托：所有菜单项的 click 统一由容器处理
        this.#menuEl.addEventListener("click", (e) => {
            const el = e.target.closest(".ctx-item");
            if (!el) return;
            const item = this.#menuItemMap.get(el.dataset.key);
            if (!item?.action) return;
            item.action(this.#row, this.#col, this.handler.sheet);
            this.handler.render();
            this.#hideMenu();
        });

        document.body.appendChild(this.#menuEl);
    }

    /**
     * 根据当前上下文 (#context) 动态渲染菜单项
     * 每次显示菜单时调用，清空旧内容后重新构建
     *
     * 渲染顺序：
     * 1. 按 #CONTEXT_ITEMS[context] 定义的顺序渲染内置项
     * 2. 过滤出当前上下文匹配的自定义项，追加到末尾
     */
    #renderMenuItems() {
        // 保留内嵌 <style>，清空其余子元素
        const styleEl = this.#menuEl.querySelector("style");
        this.#menuEl.innerHTML = "";
        if (styleEl) this.#menuEl.appendChild(styleEl);

        const isReadOnly = this.handler.sheet?.readOnly;

        // 渲染当前上下文的内置菜单项
        const order = ContextMenuStrategy.#CONTEXT_ITEMS[this.#context] || ContextMenuStrategy.#CONTEXT_ITEMS.cell;
        for (const key of order) {
            if (key === null) {
                this.#appendSeparator();
            } else {
                // 只读模式下跳过编辑类菜单项
                if (isReadOnly && ContextMenuStrategy.#READONLY_DISABLED.has(key)) continue;
                const item = this.#menuItemMap.get(key);
                if (item) this.#appendItem(key, item.label);
            }
        }

        let hasCustom = false;
        for (let i = 0; i < this.#customItems.length; i++) {
            const ci = this.#customItems[i];
            if (ci.type === "separator") {
                if (hasCustom) this.#appendSeparator();
                continue;
            }
            const ctxs = ci.contexts || ["cell"];
            if (!ctxs.includes(this.#context)) continue;
            if (!hasCustom) {
                this.#appendSeparator();
                hasCustom = true;
            }
            const key = ci.key || `custom_${i}`;
            this.#appendItem(key, ci.label);
        }
    }

    /** 追加分隔线到菜单容器 */
    #appendSeparator() {
        const sep = document.createElement("div");
        Object.assign(sep.style, {
            height: "1px",
            background: "#e0e0e0",
            margin: "4px 8px",
        });
        this.#menuEl.appendChild(sep);
    }

    /**
     * 追加菜单项到菜单容器
     * @param {string} key - 菜单项 key（对应 #menuItemMap）
     * @param {string} label - 显示文本
     */
    #appendItem(key, label) {
        const el = document.createElement("div");
        el.className = "ctx-item";
        el.dataset.key = key;
        el.textContent = label;
        Object.assign(el.style, {
            padding: "6px 16px",
            cursor: "pointer",
            color: "#333",
        });
        this.#menuEl.appendChild(el);
    }

    /**
     * 点击菜单外部自动关闭
     * @param {MouseEvent} e
     */
    #handleDismiss(e) {
        if (this.#menuEl && !this.#menuEl.contains(e.target)) {
            this.#hideMenu();
        }
    }

    /**
     * 右键菜单事件入口
     * 阻止浏览器默认右键菜单，根据 hit 类型分发处理
     *
     * @param {MouseEvent} e - contextmenu 事件
     */
    #handleContextMenu(e) {
        if (!this.enabled || !this.handler.sheet) return;
        e.preventDefault();

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit) return;

        if (hit.type === HIT_TYPE.CELL) {
            this.#handleCellHit(hit, e);
        } else if (hit.type === HIT_TYPE.ROW_HEADER) {
            this.#handleRowHeaderHit(hit, e);
        } else if (hit.type === HIT_TYPE.COL_HEADER) {
            this.#handleColHeaderHit(hit, e);
        }

        // HIT_TYPE.CORNER（左上角）不弹出菜单
    }

    /**
     * 处理单元格右击
     * 如果右击的单元格不在当前选区内，先选中它（合并单元格则选中整个合并区）
     *
     * @param {object} hit - hitTest 结果 {type, row, col}
     * @param {MouseEvent} e - 原始事件（用于获取坐标）
     */
    #handleCellHit(hit, e) {
        const sheet = this.handler.sheet;
        const merge = sheet.getMerge(hit.row, hit.col);
        const row = merge ? merge.topRow : hit.row;
        const col = merge ? merge.topCol : hit.col;

        if (!sheet.selection.contains(row, col)) {
            if (merge) {
                sheet.selection.setRange(merge.topRow, merge.topCol, merge.bottomRow, merge.bottomCol);
            } else {
                sheet.selection.setActive(row, col);
            }
            this.handler.render();
        }

        this.#context = "cell";
        this.#showMenu(e.clientX, e.clientY, row, col);
    }

    /**
     * 处理行头右击
     * 自动选中整行（从第 0 列到最后一列）
     *
     * @param {object} hit - hitTest 结果 {type, index}
     * @param {MouseEvent} e - 原始事件
     */
    #handleRowHeaderHit(hit, e) {
        const sheet = this.handler.sheet;
        const row = hit.index;
        const totalCols = sheet.rowColManager.colCount;

        if (!sheet.selection.contains(row, 0)) {
            sheet.selection.setRange(row, 0, row, totalCols - 1);
            this.handler.render();
        }

        this.#context = "rowHeader";
        this.#showMenu(e.clientX, e.clientY, row, 0);
    }

    /**
     * 处理列头右击
     * 自动选中整列（从第 0 行到最后一行）
     *
     * @param {object} hit - hitTest 结果 {type, index}
     * @param {MouseEvent} e - 原始事件
     */
    #handleColHeaderHit(hit, e) {
        const sheet = this.handler.sheet;
        const col = hit.index;
        const totalRows = sheet.rowColManager.rowCount;

        if (!sheet.selection.contains(0, col)) {
            sheet.selection.setRange(0, col, totalRows - 1, col);
            this.handler.render();
        }

        this.#context = "colHeader";
        this.#showMenu(e.clientX, e.clientY, 0, col);
    }

    /**
     * 显示右键菜单
     * 先根据上下文渲染菜单项，再计算位置（自动调整防止超出视口）
     *
     * @param {number} clientX - 鼠标 X 坐标
     * @param {number} clientY - 鼠标 Y 坐标
     * @param {number} row - 右击行号
     * @param {number} col - 右击列号
     */
    #showMenu(clientX, clientY, row, col) {
        this.#row = row;
        this.#col = col;

        // 根据上下文动态渲染菜单内容
        this.#renderMenuItems();

        // 计算菜单位置，防止超出视口
        this.#menuEl.style.display = "block";
        const menuW = this.#menuEl.offsetWidth;
        const menuH = this.#menuEl.offsetHeight;
        const winW = window.innerWidth;
        const winH = window.innerHeight;

        let x = clientX;
        let y = clientY;
        if (x + menuW > winW) x = winW - menuW;
        if (y + menuH > winH) y = winH - menuH;

        this.#menuEl.style.left = x + "px";
        this.#menuEl.style.top = y + "px";
    }

    /** 隐藏右键菜单 */
    #hideMenu() {
        if (this.#menuEl) {
            this.#menuEl.style.display = "none";
        }
    }
}
