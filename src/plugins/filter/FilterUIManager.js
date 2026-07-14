import { FilterDropdown } from "./FilterDropdown.js";
import { FilterEngine } from "./FilterEngine.js";
import { PopupManager } from "../../ui/components/PopupManager.js";

export class FilterUIManager {

    #dropdown = null;
    #popupId = null;
    #filterEngine = null;
    #filterState = null;
    #sheet = null;

    constructor(sheet, filterState) {
        this.#sheet = sheet;
        this.#filterState = filterState;
        this.#filterEngine = new FilterEngine(sheet, filterState);
    }

    get filterEngine() {
        return this.#filterEngine;
    }

    openDropdown(col, position) {
        this.closeDropdown();

        const uniqueValues = this.#filterEngine.extractUniqueValues(col);
        const currentFilter = this.#filterState.getColumnFilter(col);

        const dropdown = document.createElement("filter-dropdown");
        
        this.#popupId = PopupManager.getInstance().register(dropdown);

        dropdown.show(
            col,
            position,
            uniqueValues,
            currentFilter,
            {
                dropdownWidth: 240,
                dropdownMaxHeight: 360,
                virtualScrollThreshold: 200
            },
            (filter) => {
                PopupManager.getInstance().unregister(this.#popupId);
                this.#onApply(filter, col);
            },
            () => {
                PopupManager.getInstance().unregister(this.#popupId);
                this.#onClear(col);
            }
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
        if (this.#isFilterEmpty(filter)) {
            this.#filterState.removeColumnFilter(col);
        } else {
            this.#filterState.setColumnFilter(col, filter);
        }
        
        this.#applyHiddenRows();
    }

    #onClear(col) {
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
        this.#sheet.setHiddenRows(hiddenRows);
    }

    destroy() {
        this.closeDropdown();
        this.#sheet = null;
        this.#filterState = null;
        this.#filterEngine = null;
    }
}
