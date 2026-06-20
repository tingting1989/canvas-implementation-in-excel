/**
 * 隐藏行插件
 * 参考 Handsontable HiddenRows API 设计
 * https://handsontable.com/docs/javascript-data-grid/api/hidden-rows/
 *
 * 核心原理（高度=0 方案，与 HiddenColumns 对称）：
 *   隐藏行时将行高设为 0，显示时恢复原始高度。
 *   无需维护双坐标体系（realRow/visibleRow），所有坐标计算自然适配：
 *   - getRowY / getRowHeight / totalHeight 自动跳过高度为 0 的行
 *   - rowAt 在二分查找后跳过隐藏行
 *   - 渲染循环中跳过高度 <= 0 的行
 *
 * 使用示例：
 * ```js
 * const hr = workbook.getPlugin('hiddenRows');
 * hr.hideRow(2);           // 隐藏第 2 行
 * hr.hideRows([1, 3]);     // 隐藏第 1、3 行
 * hr.showRow(2);           // 显示第 2 行
 * hr.isHidden(1);          // true
 * hr.getHiddenRows();      // [1, 3]
 * ```
 */
import { BasePlugin } from "./BasePlugin.js";
import { HOOKS } from "../constants/hookNames.js";

export class HiddenRowsPlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "hiddenRows";
    }

    /** 插件是否激活 */
    #active = false;

    /**
     * 初始化隐藏行插件
     * @param {object} [options] - 隐藏行配置
     * @param {number[]} [options.rows] - 初始隐藏的行索引列表
     */
    init(options = {}) {
        super.init(options);
        if (Array.isArray(options.rows)) {
            for (const row of options.rows) {
                if (row >= 0) this.sheet.rowColManager.hideRow(row);
            }
        }

        this.#active = true;
        this.#adjustSelection();

        this.renderEngine?.invalidateAll();
        this.render();
    }

    /** 插件是否激活 */
    get active() {
        return this.#active;
    }

    /** 获取所有隐藏行索引（升序数组） */
    get hiddenRows() {
        return this.sheet ? this.sheet.rowColManager.getHiddenRows() : [];
    }

    /** 隐藏行数量 */
    get hiddenCount() {
        return this.sheet ? this.sheet.rowColManager.getHiddenRows().length : 0;
    }

    /**
     * 隐藏指定行
     * @param {number} row - 要隐藏的行索引
     * @fires afterHideRow
     */
    hideRow(row) {
        if (row < 0 || this.isHidden(row)) return;

        this.sheet.rowColManager.hideRow(row);
        this.#adjustSelection();

        this.renderEngine?.invalidateAll();
        this.render();

        this.hooks?.runHooks(HOOKS.AFTER_HIDE_ROW, row, true);
    }

    /**
     * 隐藏多行
     * @param {number[]} rows - 要隐藏的行索引数组
     * @fires afterHideRow
     */
    hideRows(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return;

        let changed = false;
        for (const row of rows) {
            if (row >= 0 && !this.isHidden(row)) {
                this.sheet.rowColManager.hideRow(row);
                changed = true;
            }
        }
        if (changed) {
            this.#adjustSelection();
            this.renderEngine?.invalidateAll();
            this.render();
            for (const row of rows) {
                this.hooks?.runHooks(HOOKS.AFTER_HIDE_ROW, row, true);
            }
        }
    }

    /**
     * 显示指定行
     * @param {number} row - 要显示的行索引
     * @fires afterShowRow
     */
    showRow(row) {
        if (!this.isHidden(row)) return;

        this.sheet.rowColManager.showRow(row);
        this.renderEngine?.invalidateAll();
        this.render();

        this.hooks?.runHooks(HOOKS.AFTER_SHOW_ROW, row, false);
    }

    /**
     * 显示多行
     * @param {number[]} rows - 要显示的行索引数组
     * @fires afterShowRow
     */
    showRows(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return;

        let changed = false;
        for (const row of rows) {
            if (this.isHidden(row)) {
                this.sheet.rowColManager.showRow(row);
                changed = true;
            }
        }
        if (changed) {
            this.renderEngine?.invalidateAll();
            this.render();
            for (const row of rows) {
                this.hooks?.runHooks(HOOKS.AFTER_SHOW_ROW, row, false);
            }
        }
    }

    /**
     * 判断指定行是否隐藏
     * @param {number} row - 行索引
     * @returns {boolean}
     */
    isHidden(row) {
        return this.sheet ? this.sheet.rowColManager.isRowHidden(row) : false;
    }

    /**
     * 获取所有隐藏行索引
     * @returns {number[]} 升序排列的隐藏行索引数组
     */
    getHiddenRows() {
        return this.hiddenRows;
    }

    /** 获取可视行总数（排除隐藏行） */
    get visibleRowCount() {
        return this.sheet ? this.sheet.rowColManager.visibleRowCount : 0;
    }

    /**
     * 隐藏行后调整选区
     * 如果活动单元格的行被隐藏，自动将选区移到最近的可见行
     */
    #adjustSelection() {
        const sheet = this.sheet;
        if (!sheet) return;

        const rc = sheet.rowColManager;
        const selection = sheet.selection;
        const range = selection.getRange();
        const [focusRow, focusCol] = selection.getFocus();

        if (!rc.isRowHidden(focusRow) && !rc.isRowHidden(range.topRow) && !rc.isRowHidden(range.bottomRow)) {
            return;
        }

        const newRow = this.#findNearestVisibleRow(focusRow);
        if (newRow < 0) return;

        const newTopRow = this.#findNearestVisibleRow(range.topRow);
        const newBottomRow = this.#findNearestVisibleRow(range.bottomRow);

        if (newTopRow >= 0 && newBottomRow >= 0) {
            selection.setRange(newTopRow, range.topCol, newBottomRow, range.bottomCol);
        }
        selection.setActive(newRow, focusCol);
    }

    /**
     * 从指定行开始，向下再向上查找最近的可见行
     * @param {number} row - 起始行号
     * @returns {number} 最近的可见行号，找不到返回 -1
     */
    #findNearestVisibleRow(row) {
        const rc = this.sheet.rowColManager;
        if (!rc.isRowHidden(row)) return row;

        for (let r = row + 1; r < row + 100; r++) {
            if (!rc.isRowHidden(r)) return r;
        }
        for (let r = row - 1; r >= 0; r--) {
            if (!rc.isRowHidden(r)) return r;
        }
        return -1;
    }

    /** 启用插件 */
    enable() {
        super.enable();
        this.#active = true;
    }

    /** 禁用插件，清除所有隐藏行，恢复全量显示 */
    disable() {
        super.disable();
        this.#active = false;

        const sheet = this.sheet;
        if (sheet) {
            sheet.rowColManager.clearHiddenRows();
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