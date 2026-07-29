import { FilterDropdown } from "./FilterDropdown.js";
import { FilterEngine } from "./FilterEngine.js";
import { PopupManager } from "../../ui/components/PopupManager.js";

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

    get filterEngine() {
        return this.#filterEngine;
    }

    openDropdown(col, position) {
        this.closeDropdown();

        const uniqueValues = this.#filterEngine.extractUniqueValues(col);
        const currentFilter = this.#filterState.getColumnFilter(col);
        console.log("[FilterUIManager] openDropdown, col:", col, "currentFilter:", currentFilter);

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

    isDropdownOpen() {
        return this.#dropdown !== null && this.#dropdown.visible;
    }

    #onApply(filter, col) {
        console.log("[FilterUIManager] #onApply, filter:", filter, "col:", col, "isEmpty:", this.#isFilterEmpty(filter));
        if (this.#isFilterEmpty(filter)) {
            console.log("[FilterUIManager] isEmpty=true, doing nothing (no changes)");
            this.closeDropdown();
            return;
        }

        console.log("[FilterUIManager] setting column filter");
        this.#filterState.setColumnFilter(col, filter);
        this.#applyHiddenRows();
    }

    #onClear(col) {
        console.log("[FilterUIManager] #onClear, col:", col);
        this.#filterState.removeColumnFilter(col);
        this.#applyHiddenRows();
    }

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

    #applyHiddenRows() {
        const hiddenRows = this.#filterEngine.computeHiddenRows();
        console.log("[FilterUIManager] #applyHiddenRows, hiddenRows.size:", hiddenRows?.size);

        const rc = this.#sheet.rowColManager;
        console.log("[FilterUIManager] before clear, hiddenRows:", rc.getHiddenRows());

        // 先显示所有行，再隐藏需要隐藏的行
        rc.clearHiddenRows();
        console.log("[FilterUIManager] after clear, hiddenRows:", rc.getHiddenRows());

        for (const row of hiddenRows) {
            rc.hideRow(row);
        }
        console.log("[FilterUIManager] after hide, hiddenRows:", rc.getHiddenRows());

        // 触发重新渲染
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
