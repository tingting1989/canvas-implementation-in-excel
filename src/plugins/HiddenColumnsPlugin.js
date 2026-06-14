/**
 * 隐藏列插件
 * 参考 Handsontable HiddenColumns API 设计
 * https://handsontable.com/docs/javascript-data-grid/api/hidden-columns/
 *
 * 核心原理（宽度=0 方案）：
 *   隐藏列时将列宽设为 0，显示时恢复原始宽度。
 *   无需维护双坐标体系（realCol/visibleCol），所有坐标计算自然适配：
 *   - getColX / getColWidth / totalWidth 自动跳过宽度为 0 的列
 *   - colAt 在二分查找后跳过隐藏列
 *   - 渲染循环中跳过宽度 <= 0 的列
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

    /** 插件是否激活 */
    #active = false;

    /**
     * 初始化隐藏列插件
     * @param {object} [options] - 隐藏列配置
     * @param {number[]} [options.columns] - 初始隐藏的列索引列表
     */
    init(options = {}) {
        super.init(options);
        console.log('HiddenColumnsPlugin init', options);
        if (Array.isArray(options.columns)) {
            for (const col of options.columns) {
                if (col >= 0) this.sheet.rowColManager.hideColumn(col);
            }
        }

        this.#active = true;
        this.#adjustSelection();

        this.renderEngine?.invalidateAll();
        this.render();
    }

    /** 插件是否激活 */
    get active() { return this.#active; }

    /** 获取所有隐藏列索引（升序数组） */
    get hiddenColumns() {
        return this.sheet ? this.sheet.rowColManager.getHiddenColumns() : [];
    }

    /** 隐藏列数量 */
    get hiddenCount() {
        return this.sheet ? this.sheet.rowColManager.getHiddenColumns().length : 0;
    }

    /**
     * 隐藏指定列
     * @param {number} col - 要隐藏的列索引
     * @fires afterHideColumn
     */
    hideColumn(col) {
        if (col < 0 || this.isHidden(col)) return;

        this.sheet.rowColManager.hideColumn(col);
        this.#adjustSelection();

        this.renderEngine?.invalidateAll();
        this.render();

        this.hooks?.runHooks(HOOKS.AFTER_HIDE_COLUMN, col, true);
    }

    /**
     * 隐藏多列
     * @param {number[]} cols - 要隐藏的列索引数组
     * @fires afterHideColumn
     */
    hideColumns(cols) {
        if (!Array.isArray(cols) || cols.length === 0) return;

        let changed = false;
        for (const col of cols) {
            if (col >= 0 && !this.isHidden(col)) {
                this.sheet.rowColManager.hideColumn(col);
                changed = true;
            }
        }
        if (changed) {
            this.#adjustSelection();
            this.renderEngine?.invalidateAll();
            this.render();
            for (const col of cols) {
                this.hooks?.runHooks(HOOKS.AFTER_HIDE_COLUMN, col, true);
            }
        }
    }

    /**
     * 显示指定列
     * @param {number} col - 要显示的列索引
     * @fires afterShowColumn
     */
    showColumn(col) {
        if (!this.isHidden(col)) return;

        this.sheet.rowColManager.showColumn(col);
        this.renderEngine?.invalidateAll();
        this.render();

        this.hooks?.runHooks(HOOKS.AFTER_SHOW_COLUMN, col, false);
    }

    /**
     * 显示多列
     * @param {number[]} cols - 要显示的列索引数组
     * @fires afterShowColumn
     */
    showColumns(cols) {
        if (!Array.isArray(cols) || cols.length === 0) return;

        let changed = false;
        for (const col of cols) {
            if (this.isHidden(col)) {
                this.sheet.rowColManager.showColumn(col);
                changed = true;
            }
        }
        if (changed) {
            this.renderEngine?.invalidateAll();
            this.render();
            for (const col of cols) {
                this.hooks?.runHooks(HOOKS.AFTER_SHOW_COLUMN, col, false);
            }
        }
    }

    /**
     * 判断指定列是否隐藏
     * @param {number} col - 列索引
     * @returns {boolean}
     */
    isHidden(col) {
        return this.sheet ? this.sheet.rowColManager.isColumnHidden(col) : false;
    }

    /**
     * 获取所有隐藏列索引
     * @returns {number[]} 升序排列的隐藏列索引数组
     */
    getHiddenColumns() {
        return this.hiddenColumns;
    }

    /** 获取可视列总数（排除隐藏列） */
    get visibleColCount() {
        return this.sheet ? this.sheet.rowColManager.visibleColCount : 0;
    }

    /**
     * 隐藏列后调整选区
     * 如果活动单元格的列被隐藏，自动将选区移到最近的可见列
     */
    #adjustSelection() {
        const sheet = this.sheet;
        if (!sheet) return;

        const rc = sheet.rowColManager;
        const selection = sheet.selection;
        const range = selection.getRange();
        const [focusRow, focusCol] = selection.getFocus();

        if (!rc.isColumnHidden(focusCol) && !rc.isColumnHidden(range.topCol) && !rc.isColumnHidden(range.bottomCol)) {
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
     * @param {number} col - 起始列号
     * @returns {number} 最近的可见列号，找不到返回 -1
     */
    #findNearestVisibleCol(col) {
        const rc = this.sheet.rowColManager;
        if (!rc.isColumnHidden(col)) return col;

        for (let c = col + 1; c < col + 100; c++) {
            if (!rc.isColumnHidden(c)) return c;
        }
        for (let c = col - 1; c >= 0; c--) {
            if (!rc.isColumnHidden(c)) return c;
        }
        return -1;
    }

    /** 启用插件 */
    enable() {
        super.enable();
        this.#active = true;
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