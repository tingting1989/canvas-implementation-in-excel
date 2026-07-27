import { EventStrategy } from "./EventStrategy.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";

export class ValidationStrategy extends EventStrategy {
    name = "validation";

    priority = STRATEGY_PRIORITY.DATA_VALIDATION;

    #plugin;

    constructor(handler, plugin) {
        super(handler);
        this.#plugin = plugin;
    }

    getEventHandlers() {
        return {};
    }

    interceptBeforeSetValue(row, col, value) {
        if (!this.enabled || !this.#plugin?.active) return true;

        return this.#plugin.interceptBeforeSetValue(row, col, value);
    }

    handleAfterSetValue(row, col, value) {
        if (!this.enabled || !this.#plugin?.active) return;

        this.#plugin.handleAfterSetValue(row, col, value);
    }

    interceptBeforePaste(data) {
        if (!this.enabled || !this.#plugin?.active) return true;

        return this.#plugin.interceptBeforePaste(data);
    }

    handleCellSelected(row, col) {
        if (!this.enabled || !this.#plugin?.active || !this.#plugin?.uiController) return;

        this.#plugin.uiController.onCellSelected(row, col);
    }
}
