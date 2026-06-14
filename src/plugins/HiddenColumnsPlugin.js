/**
 * 隐藏列插件
 * 参考 Handsontable HiddenColumns API 设计
 * https://handsontable.com/docs/javascript-data-grid/api/hidden-columns/
 *
 * 核心原理：
 *   通过 RowColManager 的 setHiddenColumns(cols) 设置隐藏列集合，
 *   RowColManager 在坐标计算（getColX / colAt / totalWidth / colCount）中自动跳过隐藏列，
 *   Sheet.toRealCol / toVisibleCol 负责可视列号与实际列号的双向转换。
 *
 * 列号体系：
 *   实际列号（realCol）  — 数据在 CellStore 中的真实列索引，不受隐藏影响
 *   可视列号（visibleCol）— 渲染/交互层使用的列索引，隐藏列被跳过
 *   例如：列 1 隐藏时，realCol 0→visibleCol 0, realCol 1→隐藏, realCol 2→visibleCol 1
 *
 * 使用示例：
 * ```js
 * const hc = workbook.getPlugin('hiddenColumns');
 * hc.hideColumn(2);           // 隐藏第 2 列（C 列）
 * hc.hideColumns([1, 3]);     // 隐藏第 1、3 列
 * hc.showColumn(2);           // 显示第 2 列
 * hc.isHidden(1);             // true
 * hc.getHiddenColumns();      // [1, 3]
 * ```
 */
import { BasePlugin } from "./BasePlugin.js";
import { HOOKS } from "../constants/hookNames.js";

export class HiddenColumnsPlugin extends BasePlugin {
    static get PLUGIN_NAME() { return 'hiddenColumns'; }

    /** 隐藏列集合（存储实际列号） */
    #hiddenSet = new Set();
    /** 插件是否激活 */
    #active = false;

    /**
     * 初始化隐藏列插件
     * @param {object} [options] - 隐藏列配置
     * @param {number[]} [options.columns] - 初始隐藏的列索引列表
     */
    init(options = {}) {
        super.init(options);

        if (Array.isArray(options.columns)) {
            for (const col of options.columns) {
                if (col >= 0) this.#hiddenSet.add(col);
            }
        }

        this.#active = true;
        this.#applyHiddenColumns();
    }

    /** 插件是否激活 */
    get active() { return this.#active; }

    /** 获取所有隐藏列索引（升序数组） */
    get hiddenColumns() {
        return [...this.#hiddenSet].sort((a, b) => a - b);
    }

    /** 隐藏列数量 */
    get hiddenCount() {
        return this.#hiddenSet.size;
    }

    /**
     * 隐藏指定列
     * @param {number} col - 要隐藏的列索引（实际列号）
     * @fires afterHideColumn
     */
    hideColumn(col) {
        if (col < 0 || this.#hiddenSet.has(col)) return;

        this.#hiddenSet.add(col);
        this.#applyHiddenColumns();

        this.hooks?.runHooks(HOOKS.AFTER_HIDE_COLUMN, col, true);
    }

    /**
     * 隐藏多列
     * @param {number[]} cols - 要隐藏的列索引数组（实际列号）
     * @fires afterHideColumn
     */
    hideColumns(cols) {
        if (!Array.isArray(cols) || cols.length === 0) return;

        let changed = false;
        for (const col of cols) {
            if (col >= 0 && !this.#hiddenSet.has(col)) {
                this.#hiddenSet.add(col);
                changed = true;
            }
        }
        if (changed) {
            this.#applyHiddenColumns();
            for (const col of cols) {
                this.hooks?.runHooks(HOOKS.AFTER_HIDE_COLUMN, col, true);
            }
        }
    }

    /**
     * 显示指定列
     * @param {number} col - 要显示的列索引（实际列号）
     * @fires afterShowColumn
     */
    showColumn(col) {
        if (!this.#hiddenSet.has(col)) return;

        this.#hiddenSet.delete(col);
        this.#applyHiddenColumns();

        this.hooks?.runHooks(HOOKS.AFTER_SHOW_COLUMN, col, false);
    }

    /**
     * 显示多列
     * @param {number[]} cols - 要显示的列索引数组（实际列号）
     * @fires afterShowColumn
     */
    showColumns(cols) {
        if (!Array.isArray(cols) || cols.length === 0) return;

        let changed = false;
        for (const col of cols) {
            if (this.#hiddenSet.has(col)) {
                this.#hiddenSet.delete(col);
                changed = true;
            }
        }
        if (changed) {
            this.#applyHiddenColumns();
            for (const col of cols) {
                this.hooks?.runHooks(HOOKS.AFTER_SHOW_COLUMN, col, false);
            }
        }
    }

    /**
     * 判断指定列是否隐藏
     * @param {number} col - 列索引（实际列号）
     * @returns {boolean}
     */
    isHidden(col) {
        return this.#hiddenSet.has(col);
    }

    /**
     * 获取所有隐藏列索引
     * @returns {number[]} 升序排列的隐藏列索引数组
     */
    getHiddenColumns() {
        return this.hiddenColumns;
    }

    /**
     * 将可视列号转换为实际列号
     * @param {number} visibleCol - 可视列号
     * @returns {number} 实际列号
     */
    toRealCol(visibleCol) {
        const sheet = this.sheet;
        if (!sheet) return visibleCol;
        return sheet.toRealCol(visibleCol);
    }

    /**
     * 将实际列号转换为可视列号
     * @param {number} realCol - 实际列号
     * @returns {number} 可视列号（如果该列隐藏则返回 -1）
     */
    toVisibleCol(realCol) {
        const sheet = this.sheet;
        if (!sheet) return realCol;
        return sheet.toVisibleCol(realCol);
    }

    /** 获取可视列总数（排除隐藏列） */
    get visibleColCount() {
        const sheet = this.sheet;
        if (!sheet) return 0;
        return sheet.rowColManager.visibleColCount;
    }

    /**
     * 将隐藏列配置应用到 RowColManager
     */
    #applyHiddenColumns() {
        const sheet = this.sheet;
        if (!sheet) return;

        sheet.rowColManager.setHiddenColumns(this.#hiddenSet);
        this.#adjustSelection();

        this.renderEngine?.invalidateAll();
        this.render();
    }

    /**
     * 隐藏列后调整选区
     * 如果活动单元格的列被隐藏，自动将选区移到最近的可见列
     */
    #adjustSelection() {
        const sheet = this.sheet;
        if (!sheet) return;

        const selection = sheet.selection;
        const range = selection.getRange();
        const [focusRow, focusCol] = selection.getFocus();

        if (!this.#hiddenSet.has(focusCol) && !this.#hiddenSet.has(range.topCol) && !this.#hiddenSet.has(range.bottomCol)) {
            return;
        }

        const newCol = this.#findNearestVisibleCol(focusCol);
        if (newCol < 0) return;

        const newTopCol = this.#findNearestVisibleCol(range.topCol);
        const newBottomCol = this.#findNearestVisibleCol(range.bottomCol);

        if (newTopCol >= 0 && newBottomCol >= 0) {
            selection.setRange(range.topRow, newTopCol, range.bottomRow, newBottomCol);
        }
        selection.setActive(focusRow, newCol);
    }

    /**
     * 从指定列开始，向右再向左查找最近的可见列
     * @param {number} col - 起始列号（实际列号）
     * @returns {number} 最近的可见列号，找不到返回 -1
     */
    #findNearestVisibleCol(col) {
        if (!this.#hiddenSet.has(col)) return col;

        for (let c = col + 1; c < col + 100; c++) {
            if (!this.#hiddenSet.has(c)) return c;
        }
        for (let c = col - 1; c >= 0; c--) {
            if (!this.#hiddenSet.has(c)) return c;
        }
        return -1;
    }

    /** 启用插件，应用隐藏列配置 */
    enable() {
        super.enable();
        this.#active = true;
        this.#applyHiddenColumns();
    }

    /** 禁用插件，清除所有隐藏列，恢复全量显示 */
    disable() {
        super.disable();
        this.#active = false;

        const sheet = this.sheet;
        if (sheet) {
            sheet.rowColManager.clearHiddenColumns();
        }
        this.renderEngine?.invalidateAll();
        this.render();
    }

    /** 销毁插件，先禁用再清理基类资源 */
    destroy() {
        this.disable();
        super.destroy();
    }
}