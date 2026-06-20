/**
 * 隐藏行插件
 * 参考 Handsontable HiddenRows API 设计
 * https://handsontable.com/docs/javascript-data-grid/api/hidden-rows/
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
import { BaseHidePlugin } from "./BaseHidePlugin.js";
import { HOOKS } from "../constants/hookNames.js";

export class HiddenRowsPlugin extends BaseHidePlugin {
    static get PLUGIN_NAME() {
        return "hiddenRows";
    }

    static get AXIS() {
        return "row";
    }

    static get AFTER_HIDE_HOOK() {
        return HOOKS.AFTER_HIDE_ROW;
    }

    static get AFTER_SHOW_HOOK() {
        return HOOKS.AFTER_SHOW_ROW;
    }

    // ─── 保持原有 API 兼容（作为 thin wrapper）─────────────────

    hideRow(row) {
        this.hideOne(row);
    }

    hideRows(rows) {
        this.hideMultiple(rows);
    }

    showRow(row) {
        this.showOne(row);
    }

    showRows(rows) {
        this.showMultiple(rows);
    }

    getHiddenRows() {
        return this.getHiddenItems();
    }

    get hiddenRows() {
        return this.hiddenItems;
    }

    get visibleRowCount() {
        return this.visibleCount;
    }
}
