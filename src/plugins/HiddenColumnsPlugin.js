/**
 * 隐藏列插件
 * 参考 Handsontable HiddenColumns API 设计
 * https://handsontable.com/docs/javascript-data-grid/api/hidden-columns/
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
import { BaseHidePlugin } from "./BaseHidePlugin.js";
import { HOOKS } from "../constants/hookNames.js";

export class HiddenColumnsPlugin extends BaseHidePlugin {
    static get PLUGIN_NAME() {
        return "hiddenColumns";
    }

    static get AXIS() {
        return BaseHidePlugin.AXIS_COL;
    }

    static get AFTER_HIDE_HOOK() {
        return HOOKS.AFTER_HIDE_COLUMN;
    }

    static get AFTER_SHOW_HOOK() {
        return HOOKS.AFTER_SHOW_COLUMN;
    }

    // ─── 保持原有 API 兼容（作为 thin wrapper）─────────────────

    hideColumn(col) {
        this.hideOne(col);
    }

    hideColumns(cols) {
        this.hideMultiple(cols);
    }

    showColumn(col) {
        this.showOne(col);
    }

    showColumns(cols) {
        this.showMultiple(cols);
    }

    getHiddenColumns() {
        return this.getHiddenItems();
    }

    get hiddenColumns() {
        return this.hiddenItems;
    }

    get visibleColCount() {
        return this.visibleCount;
    }
}
