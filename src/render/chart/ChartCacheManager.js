export class ChartCacheManager {
    #globalVersion = 0;
    #chartVersions = new Map();
    #pendingInvalidation = false;
    #sheet = null;

    constructor(sheet) {
        this.#sheet = sheet;
        this.#setupListeners();
    }

    #setupListeners() {
        if (this.#sheet.cellStore && typeof this.#sheet.cellStore.on === "function") {
            this.#sheet.cellStore.on("change", () => {
                this.#pendingInvalidation = true;
            });
        }
        if (this.#sheet.reactiveStore && typeof this.#sheet.reactiveStore.on === "function") {
            this.#sheet.reactiveStore.on("flush", () => {
                if (this.#pendingInvalidation) {
                    this.#globalVersion++;
                    this.#pendingInvalidation = false;
                }
            });
        }
    }

    isDirty(chartId) {
        const lastVersion = this.#chartVersions.get(chartId) ?? -1;
        return lastVersion < this.#globalVersion;
    }

    markClean(chartId) {
        this.#chartVersions.set(chartId, this.#globalVersion);
    }

    invalidateAll() {
        this.#globalVersion++;
        this.#pendingInvalidation = false;
    }

    get globalVersion() {
        return this.#globalVersion;
    }

    destroy() {
        this.#chartVersions.clear();
    }
}
