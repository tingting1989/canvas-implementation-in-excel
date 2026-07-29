import { NullValueHandler } from "./NullValueTypes.js";

export class FilterEngine {
    #sheet;
    #filterState;

    constructor(sheet, filterState) {
        this.#sheet = sheet;
        this.#filterState = filterState;
    }

    extractUniqueValues(col) {
        const cached = this.#filterState.getUniqueValuesCache(col);
        if (cached && this.#filterState.isCacheValid(col)) {
            return cached;
        }

        const values = new Set();
        const hasNullValues = new Set([false]);

        const rowCount = this.#sheet.rowCount || 1000;

        for (let row = 0; row < rowCount; row++) {
            const cell = this.#sheet.data.cellStore.get(row, col);
            const cellValue = cell?.value;

            if (NullValueHandler.isNullValue(cellValue)) {
                values.add(NullValueHandler.NULL_KEY);
                hasNullValues.clear();
                hasNullValues.add(true);
            } else {
                const key = String(cellValue);
                values.add(key);
            }
        }

        const result = Array.from(values).filter((v) => v !== NullValueHandler.NULL_KEY);
        result.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        if (hasNullValues.has(true)) {
            result.push(NullValueHandler.NULL_KEY);
        }

        this.#filterState.cacheUniqueValues(col, result);
        return result;
    }

    computeHiddenRows() {
        const filters = this.#filterState.getAllFilters();
        console.log("[FilterEngine] computeHiddenRows, filters.size:", filters?.size);
        if (filters.size === 0) {
            return new Set();
        }

        const rowCount = this.#sheet.rowCount || 1000;
        const hiddenRows = new Set();

        for (let row = 0; row < rowCount; row++) {
            let visible = true;

            for (const [col, filter] of filters) {
                if (!this.#rowMatchesFilter(row, col, filter)) {
                    visible = false;
                    break;
                }
            }

            if (!visible) {
                hiddenRows.add(row);
            }
        }

        return hiddenRows;
    }

    #rowMatchesFilter(row, col, filter) {
        const cell = this.#sheet.data.cellStore.get(row, col);
        const cellValue = cell?.value;
        const isNullCell = NullValueHandler.isNullValue(cellValue);

        if (filter.type === "values") {
            const cellKey = isNullCell ? NullValueHandler.NULL_KEY : String(cellValue);
            return !filter.uncheckedValues.has(cellKey);
        }

        if (filter.type === "condition") {
            return this.#evaluateConditionWithNull(cellValue, isNullCell, filter.operator, filter.value);
        }

        return true;
    }

    #evaluateConditionWithNull(cellValue, isNullCell, operator, conditionValue) {
        const isConditionEmpty = NullValueHandler.isNullValue(conditionValue);

        if (operator === "eq") {
            if (isConditionEmpty) {
                return isNullCell;
            }
            if (isNullCell) return false;
            return cellValue == conditionValue;
        }

        if (operator === "neq") {
            if (isConditionEmpty) {
                return !isNullCell;
            }
            if (isNullCell) return true;
            return cellValue != conditionValue;
        }

        const textOperators = ["contains", "notContains", "startsWith", "endsWith"];
        if (textOperators.includes(operator)) {
            if (isNullCell) {
                return operator === "notContains";
            }
            return this.#evaluateTextCondition(cellValue, operator, conditionValue);
        }

        const numericOperators = ["gt", "gte", "lt", "lte"];
        if (numericOperators.includes(operator)) {
            if (isNullCell) {
                return false;
            }
            return this.#evaluateNumericCondition(cellValue, operator, conditionValue);
        }

        return true;
    }

    #evaluateTextCondition(value, operator, conditionValue) {
        const strValue = String(value).toLowerCase();
        const strCondition = String(conditionValue).toLowerCase();

        switch (operator) {
            case "contains":
                return strValue.includes(strCondition);
            case "notContains":
                return !strValue.includes(strCondition);
            case "startsWith":
                return strValue.startsWith(strCondition);
            case "endsWith":
                return strValue.endsWith(strCondition);
            default:
                return true;
        }
    }

    #evaluateNumericCondition(value, operator, conditionValue) {
        const numValue = Number(value);
        const numCondition = Number(conditionValue);

        if (isNaN(numValue) || isNaN(numCondition)) {
            return false;
        }

        switch (operator) {
            case "gt":
                return numValue > numCondition;
            case "gte":
                return numValue >= numCondition;
            case "lt":
                return numValue < numCondition;
            case "lte":
                return numValue <= numCondition;
            default:
                return true;
        }
    }
}
