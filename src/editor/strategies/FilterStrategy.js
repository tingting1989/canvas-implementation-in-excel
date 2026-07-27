import { EventStrategy } from "./EventStrategy.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";

export class FilterStrategy extends EventStrategy {
    name = "filter";

    priority = STRATEGY_PRIORITY.DATA_FILTER;

    #plugin;

    constructor(handler, plugin) {
        super(handler);
        this.#plugin = plugin;
    }

    getEventHandlers() {
        return {};
    }

    handleAfterSetCellData(row, col, oldValue, newValue) {
        if (!this.enabled || !this.#plugin?.enabled) return;

        const filterState = this.#plugin.sheet?.filterState;
        if (filterState) {
            filterState.invalidateColumnCache(col);
            this.#plugin.refreshHeaderIcon(col);
        }
    }

    handleColumnSorted(col) {
        if (!this.enabled || !this.#plugin?.enabled) return;

        this.#plugin.refreshHeaderIcon(col);
    }

    handleFilterApplied() {
        if (!this.enabled || !this.#plugin?.enabled) return;

        this.#plugin.#refreshAllHeaderIcons();
    }
}
