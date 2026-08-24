import { EventStrategy } from "../../editor/strategies/EventStrategy.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import { ContextMenuUIManager } from "./ContextMenuUIManager.js";
import type { MenuItemData } from "./ContextMenuDropdown.js";

/** 菜单项配置接口（用于自定义菜单项） */
interface MenuItemConfig {
    /** 菜单项显示文本 */
    label?: string;
    /** 图标 HTML/SVG 字符串，渲染在文本左侧 */
    icon?: string;
    /** 自定义 HTML 内容，设置后 label/icon 均被忽略 */
    html?: string;
    /** 自定义渲染函数，优先级最高，可直接操作菜单项 DOM 元素 */
    render?: (el: HTMLElement) => void;
    /** 点击回调函数 */
    action?: (row: number, col: number, sheet: any) => void;
    /** 菜单项唯一标识键 */
    key?: string;
    /** 出现的上下文类型列表，如 ["cell", "rowHeader"] */
    contexts?: string[];
    /** 类型，"separator" 表示分隔线 */
    type?: string;
}

/** 内部菜单项条目 */
interface MenuItemEntry {
    /** 显示文本 */
    label: string;
    /** 图标 HTML/SVG */
    icon?: string;
    /** 自定义 HTML 内容 */
    html?: string;
    /** 自定义渲染函数 */
    render?: (el: HTMLElement) => void;
    /** 点击回调 */
    action: (row: number, col: number, sheet: any) => void;
}

/** 右键菜单 UI 行为选项（由插件透传） */
interface ContextMenuUIOptions {
    closeOnClickOutside?: boolean;
    closeOnEscape?: boolean;
    zIndex?: number;
    dropdownWidth?: number;
    dropdownMaxHeight?: number;
}

/** 右键菜单配置选项 */
interface ContextMenuOptions extends ContextMenuUIOptions {
    /** 自定义菜单项列表 */
    customItems?: MenuItemConfig[];
    /** 隐藏的菜单项键列表（完全不渲染） */
    hiddenItems?: string[];
    /** 禁用的菜单项键列表（灰色显示，不可点击） */
    disabledItems?: string[];
}

/**
 * 右键上下文菜单策略 (Context Menu Strategy)
 *
 * 处理Canvas表格中的右键菜单显示和命令执行。
 * 根据右键点击的位置类型（单元格/行标头/列标头）显示不同的上下文菜单。
 *
 * 优先级：STRATEGY_PRIORITY.POPUP_UI
 *
 * 核心功能：
 * 1. **上下文感知菜单**：根据右键位置显示不同菜单项
 * 2. **内置菜单操作**：插入/删除行列、合并/取消合并、隐藏/显示、冻结等
 * 3. **自定义菜单项**：支持通过配置添加自定义菜单项
 * 4. **禁用控制**：支持禁用特定菜单项，只读模式下自动禁用修改操作
 * 5. **PopupPanel 弹窗规范**：使用 PopupPanel + PopupManager 管理弹窗生命周期
 *
 * 菜单上下文类型：
 * - cell: 单元格右键菜单（最完整）
 * - rowHeader: 行标头右键菜单（行操作为主）
 * - colHeader: 列标头右键菜单（列操作为主）
 *
 * @class ContextMenuStrategy
 * @extends EventStrategy
 */
export class ContextMenuStrategy extends EventStrategy {
    /** 策略优先级：弹出UI */
    priority: number = STRATEGY_PRIORITY.POPUP_UI;

    /** UI 管理器（PopupPanel + PopupManager 规范） */
    #uiManager: ContextMenuUIManager = new ContextMenuUIManager();
    /** UI 行为选项（由插件透传） */
    #uiOptions: ContextMenuUIOptions = {};
    /** 右键点击的行号 */
    #row: number = -1;
    /** 右键点击的列号 */
    #col: number = -1;
    /** 当前上下文类型：cell/rowHeader/colHeader */
    #context: string = "cell";
    /** 菜单项映射表（键 → 菜单条目） */
    #menuItemMap: Map<string, MenuItemEntry> = new Map();
    /** 被隐藏的菜单项键集合（完全不渲染） */
    #hiddenKeys: Set<string> = new Set();
    /** 被禁用的菜单项键集合（灰色显示，不可点击） */
    #disabledKeys: Set<string> = new Set();
    /** 自定义菜单项列表 */
    #customItems: MenuItemConfig[] = [];

    /**
     * 只读模式下禁用的菜单项键集合
     * 包括所有会修改数据的操作：插入/删除行列、合并、清空、隐藏、冻结等
     */
    static #READONLY_DISABLED: Set<string> = new Set([
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

    /** 各上下文类型对应的菜单项顺序（null表示分隔线） */
    static #CONTEXT_ITEMS: Record<string, (string | null)[]> = {
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
            "autoFitRowHeight",
            "autoFitAllRows",
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
            "autoFitRowHeight",
            "autoFitAllRows",
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

    constructor(handler: any, options: ContextMenuOptions = {}) {
        super(handler);
        this.#uiOptions = {
            closeOnClickOutside: options.closeOnClickOutside,
            closeOnEscape: options.closeOnEscape,
            zIndex: options.zIndex,
            dropdownWidth: options.dropdownWidth,
            dropdownMaxHeight: options.dropdownMaxHeight,
        };
        this.#buildMenuItems(options);
    }

    #buildMenuItems(options: ContextMenuOptions): void {
        const builtIn = this._buildBuiltInItems();
        const hiddenItems = options.hiddenItems || [];
        const disabledItems = options.disabledItems || [];
        this.#customItems = options.customItems || [];

        for (const key of hiddenItems) {
            this.#hiddenKeys.add(key);
        }
        for (const key of disabledItems) {
            this.#disabledKeys.add(key);
        }

        for (const [key, item] of Object.entries(builtIn)) {
            if (!this.#hiddenKeys.has(key)) {
                this.#menuItemMap.set(key, item);
            }
        }

        for (let i = 0; i < this.#customItems.length; i++) {
            const ci = this.#customItems[i];
            if (ci.type === "separator") continue;
            const key = ci.key || `custom_${i}`;
            this.#menuItemMap.set(key, {
                label: ci.label || "",
                icon: ci.icon,
                html: ci.html,
                render: ci.render,
                action: ci.action || (() => {}),
            });
        }
    }

    init(): void {}

    destroy(): void {
        this.#uiManager.close();
    }

    getEventHandlers(): Record<string, (e: Event) => boolean | void> {
        return {
            [DELEGATE_KEYS.CANVAS_CONTEXTMENU]: (e: Event) => this.#handleContextMenu(e as MouseEvent),
        };
    }

    _buildBuiltInItems(): Record<string, MenuItemEntry> {
        return {
            insertRowAbove: {
                label: "在上方插入行",
                action: (r, _c, sheet) => sheet.insertRow(r),
            },
            insertRowBelow: {
                label: "在下方插入行",
                action: (r, _c, sheet) => sheet.insertRow(r + 1),
            },
            deleteRow: {
                label: "删除行",
                action: (_r, _c, sheet) => {
                    const range = sheet.selection.getRange();
                    for (let i = range.bottomRow; i >= range.topRow; i--) {
                        sheet.deleteRow(i);
                    }
                },
            },
            insertColLeft: {
                label: "在左侧插入列",
                action: (_r, c, sheet) => sheet.insertCol(c),
            },
            insertColRight: {
                label: "在右侧插入列",
                action: (_r, c, sheet) => sheet.insertCol(c + 1),
            },
            deleteCol: {
                label: "删除列",
                action: (_r, _c, sheet) => {
                    const range = sheet.selection.getRange();
                    for (let i = range.bottomCol; i >= range.topCol; i--) {
                        sheet.deleteCol(i);
                    }
                },
            },
            mergeCells: {
                label: "合并单元格",
                action: (_r, _c, sheet) => {
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
                action: (_r, _c, sheet) => {
                    const range = sheet.selection.getRange();
                    sheet.beginBatch();
                    for (let row = range.topRow; row <= range.bottomRow; row++) {
                        for (let col = range.topCol; col <= range.bottomCol; col++) {
                            if (!sheet.isDisabled(row, col)) {
                                const clipboard = sheet.bus.emit(SHEET_EVENTS.GET_CLIPBOARD, undefined, { source: "ContextMenuStrategy" });
                                clipboard?.removeCellContent(sheet, row, col);
                                sheet.setCell(row, col, "", 0);
                            }
                        }
                    }
                    sheet.endBatch();
                },
            },
            hideRow: {
                label: "隐藏行",
                action: (_r, _c, sheet) => {
                    const hiddenRows = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "hiddenRows" }, { source: "ContextMenuStrategy" });
                    if (!hiddenRows) return;
                    const range = sheet.selection.getRange();
                    const rows: number[] = [];
                    for (let row = range.topRow; row <= range.bottomRow; row++) {
                        rows.push(row);
                    }
                    hiddenRows.hideRows(rows);
                },
            },
            showRow: {
                label: "显示行",
                action: (_r, _c, sheet) => {
                    const hiddenRows = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "hiddenRows" }, { source: "ContextMenuStrategy" });
                    if (!hiddenRows) return;
                    const rc = sheet.rowColManager;
                    const range = sheet.selection.getRange();
                    const rows: number[] = [];
                    for (let row = Math.max(0, range.topRow - 1); row <= range.bottomRow + 1; row++) {
                        if (rc.isRowHidden(row)) rows.push(row);
                    }
                    if (rows.length > 0) hiddenRows.showRows(rows);
                },
            },
            hideColumn: {
                label: "隐藏列",
                action: (_r, _c, sheet) => {
                    const hiddenCols = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "hiddenColumns" }, { source: "ContextMenuStrategy" });
                    if (!hiddenCols) return;
                    const range = sheet.selection.getRange();
                    const cols: number[] = [];
                    for (let col = range.topCol; col <= range.bottomCol; col++) {
                        cols.push(col);
                    }
                    hiddenCols.hideColumns(cols);
                },
            },
            showColumn: {
                label: "显示列",
                action: (_r, _c, sheet) => {
                    const hiddenCols = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "hiddenColumns" }, { source: "ContextMenuStrategy" });
                    if (!hiddenCols) return;
                    const rc = sheet.rowColManager;
                    const range = sheet.selection.getRange();
                    const cols: number[] = [];
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
                action: (_r, _c, sheet) => {
                    const freeze = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "freeze" }, { source: "ContextMenuStrategy" });
                    if (!freeze) return;
                    freeze.freeze(1, freeze.fixedColumnsStart);
                },
            },
            freezeCol: {
                label: "冻结首列",
                action: (_r, _c, sheet) => {
                    const freeze = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "freeze" }, { source: "ContextMenuStrategy" });
                    if (!freeze) return;
                    freeze.freeze(freeze.fixedRowsTop, 1);
                },
            },
            unfreeze: {
                label: "取消冻结",
                action: (_r, _c, sheet) => {
                    const freeze = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "freeze" }, { source: "ContextMenuStrategy" });
                    if (!freeze) return;
                    freeze.unfreeze();
                },
            },
            autoFitRowHeight: {
                label: "自适应行高",
                action: (_r, _c, sheet) => {
                    const range = sheet.selection.getRange();
                    sheet.autoFitRowHeight(range.topRow, range.bottomRow);
                    sheet._invalidateAll();
                },
            },
            autoFitAllRows: {
                label: "所有行自适应行高",
                action: (_r, _c, sheet) => {
                    const rowCount = sheet.rowColManager.rowCount;
                    sheet.autoFitRowHeight(0, rowCount - 1);
                    sheet._invalidateAll();
                },
            },
        };
    }

    #buildVisibleItems(): (MenuItemData | null)[] {
        const items: (MenuItemData | null)[] = [];
        const isReadOnly = this.handler.sheet?.readOnly;

        const order = ContextMenuStrategy.#CONTEXT_ITEMS[this.#context] || ContextMenuStrategy.#CONTEXT_ITEMS.cell;
        for (const key of order) {
            if (key === null) {
                items.push(null);
            } else {
                if (isReadOnly && ContextMenuStrategy.#READONLY_DISABLED.has(key)) continue;
                const item = this.#menuItemMap.get(key);
                if (item) {
                    const data: MenuItemData = { key, label: item.label };
                    if (item.icon) data.icon = item.icon;
                    if (item.html) data.html = item.html;
                    if (item.render) data.render = item.render;
                    if (this.#disabledKeys.has(key)) data.disabled = true;
                    items.push(data);
                }
            }
        }

        let hasCustom = false;
        for (let i = 0; i < this.#customItems.length; i++) {
            const ci = this.#customItems[i];
            if (ci.type === "separator") {
                if (hasCustom) items.push(null);
                continue;
            }
            const ctxs = ci.contexts || ["cell"];
            if (!ctxs.includes(this.#context)) continue;
            if (!hasCustom) {
                items.push(null);
                hasCustom = true;
            }
            const key = ci.key || `custom_${i}`;
            const data: MenuItemData = { key, label: ci.label || "" };
            if (ci.icon) data.icon = ci.icon;
            if (ci.html) data.html = ci.html;
            if (ci.render) data.render = ci.render;
            items.push(data);
        }

        return this.#cleanupSeparators(items);
    }

    /**
     * 清理多余的分隔线
     *
     * 移除以下情况的分隔线（null）：
     * - 开头或结尾的分隔线
     * - 连续多个分隔线合并为一个
     *
     * @param items - 包含 MenuItemData 和 null（分隔线）的原始列表
     * @returns 清理后的列表
     */
    #cleanupSeparators(items: (MenuItemData | null)[]): (MenuItemData | null)[] {
        const result: (MenuItemData | null)[] = [];
        let lastWasSeparator = false;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (item === null) {
                if (lastWasSeparator) continue;
                result.push(null);
                lastWasSeparator = true;
            } else {
                result.push(item);
                lastWasSeparator = false;
            }
        }

        while (result.length > 0 && result[result.length - 1] === null) {
            result.pop();
        }

        return result;
    }

    #handleContextMenu(e: MouseEvent): void {
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
    }

    #handleCellHit(hit: { row: number; col: number }, e: MouseEvent): void {
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

    #handleRowHeaderHit(hit: { index: number }, e: MouseEvent): void {
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

    #handleColHeaderHit(hit: { index: number }, e: MouseEvent): void {
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

    #showMenu(clientX: number, clientY: number, row: number, col: number): void {
        this.#row = row;
        this.#col = col;

        const items = this.#buildVisibleItems();

        this.#uiManager.open(
            { x: clientX, y: clientY },
            items,
            (key: string) => {
                const item = this.#menuItemMap.get(key);
                if (!item?.action) return;
                item.action(this.#row, this.#col, this.handler.sheet);
                this.handler.render();
            },
            this.#uiOptions,
        );
    }
}
