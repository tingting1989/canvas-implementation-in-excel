export class FilterState {

    #columnFilters = new Map();
    #uniqueValuesCache = new Map();
    #invalidatedColumns = new Set();

    setColumnFilter(col, filter) {
        this.#columnFilters.set(col, filter);
    }

    removeColumnFilter(col) {
        this.#columnFilters.delete(col);
        this.#uniqueValuesCache.delete(col);
    }

    getColumnFilter(col) {
        return this.#columnFilters.get(col) || null;
    }

    getAllFilters() {
        return new Map(this.#columnFilters);
    }

    hasActiveFilters() {
        return this.#columnFilters.size > 0;
    }

    clearAll() {
        this.#columnFilters.clear();
        this.#uniqueValuesCache.clear();
        this.#invalidatedColumns.clear();
    }

    cacheUniqueValues(col, values) {
        this.#uniqueValuesCache.set(col, values);
    }

    getUniqueValuesCache(col) {
        return this.#uniqueValuesCache.get(col) || null;
    }

    invalidateColumnCache(col) {
        if (col !== undefined) {
            this.#invalidatedColumns.add(col);
            this.#uniqueValuesCache.delete(col);
        } else {
            this.#uniqueValuesCache.clear();
        }
    }

    isCacheValid(col) {
        return !this.#invalidatedColumns.has(col);
    }
}
