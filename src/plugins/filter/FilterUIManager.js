import { FilterDropdown } from "./FilterDropdown.js";
import { FilterEngine } from "./FilterEngine.js";
import { PopupManager } from "../../ui/components/PopupManager.js";

/**
 * 筛选 UI 管理器
 *
 * 负责管理筛选下拉面板的创建、显示和交互：
 * - 打开/关闭筛选面板
 * - 协调 FilterEngine 计算唯一值和隐藏行
 * - 处理筛选应用和清除
 *
 * @example
 * const manager = new FilterUIManager(sheet, filterState, plugin);
 * manager.openDropdown(0, { x: 100, y: 200 });
 */
export class FilterUIManager {
    #dropdown = null;
    #popupId = null;
    #filterEngine = null;
    #filterState = null;
    #sheet = null;
    #filterPlugin = null;

    /**
     * @param {import("../../workbook/Sheet.js").Sheet} sheet
     * @param {import("./FilterState.js").FilterState} filterState
     * @param {import("../FilterPlugin.js").FilterPlugin} filterPlugin - 用于触发渲染
     */
    constructor(sheet, filterState, filterPlugin) {
        this.#sheet = sheet;
        this.#filterState = filterState;
        this.#filterEngine = new FilterEngine(sheet, filterState);
        this.#filterPlugin = filterPlugin;
    }

    /**
     * 获取筛选引擎实例
     * @returns {FilterEngine}
     */
    get filterEngine() {
        return this.#filterEngine;
    }

    /**
     * 打开指定列的筛选下拉面板
     *
     * @param {number} col - 列索引
     * @param {Object} position - 显示位置 { x, y }
     */
    openDropdown(col, position) {
        this.closeDropdown();

        const uniqueValues = this.#filterEngine.extractUniqueValues(col);
        const currentFilter = this.#filterState.getColumnFilter(col);
        const columnType = this.#filterPlugin.getColumnType(col);

        const dropdown = new FilterDropdown();

        this.#popupId = PopupManager.getInstance().register(dropdown);

        dropdown.show(
            col,
            position,
            uniqueValues,
            currentFilter,
            {
                dropdownWidth: 240,
                dropdownMaxHeight: 360,
                virtualScrollThreshold: 200,
                columnType,
            },
            (filter) => {
                PopupManager.getInstance().unregister(this.#popupId);
                this.#onApply(filter, col);
            },
            () => {
                PopupManager.getInstance().unregister(this.#popupId);
                this.#onClear(col);
            },
        );

        this.#dropdown = dropdown;
    }

    /**
     * 关闭当前打开的筛选下拉面板
     */
    closeDropdown() {
        if (this.#dropdown) {
            this.#dropdown.hide();
            if (this.#popupId) {
                PopupManager.getInstance().unregister(this.#popupId);
            }
            this.#dropdown = null;
            this.#popupId = null;
        }
    }

    /**
     * 检查筛选下拉面板是否处于打开状态
     *
     * @returns {boolean}
     */
    isDropdownOpen() {
        return this.#dropdown !== null && this.#dropdown.visible;
    }

    /**
     * 处理筛选应用
     *
     * @param {Object} filter - 筛选配置
     * @param {number} col - 列索引
     * @private
     */
    #onApply(filter, col) {
        if (this.#isFilterEmpty(filter)) {
            this.closeDropdown();
            return;
        }

        this.#filterState.setColumnFilter(col, filter);
        this.#applyHiddenRows();
    }

    /**
     * 处理筛选清除
     *
     * @param {number} col - 列索引
     * @private
     */
    #onClear(col) {
        this.#filterState.removeColumnFilter(col);
        this.#applyHiddenRows();
    }

    /**
     * 判断筛选是否为空（无实际效果）
     *
     * @param {Object} filter - 筛选配置
     * @returns {boolean} 是否为空
     * @private
     */
    #isFilterEmpty(filter) {
        if (!filter) return true;

        if (filter.type === "values") {
            return filter.uncheckedValues.size === 0;
        }

        if (filter.type === "condition") {
            return !filter.operator || !filter.value;
        }

        return true;
    }

    /**
     * 应用隐藏行
     *
     * 根据筛选条件计算需要隐藏的行，并更新到 rowColManager
     * @private
     */
    #applyHiddenRows() {
        const hiddenRows = this.#filterEngine.computeHiddenRows();

        const rc = this.#sheet.rowColManager;

        rc.clearHiddenRows();

        for (const row of hiddenRows) {
            rc.hideRow(row);
        }

        this.#filterPlugin?.renderEngine?.invalidateAll();
        this.#filterPlugin?.renderEngine?.render();
    }

    destroy() {
        this.closeDropdown();
        this.#sheet = null;
        this.#filterState = null;
        this.#filterEngine = null;
    }
}