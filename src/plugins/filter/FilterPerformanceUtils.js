export class FilterPerformanceUtils {
    static #nullCache = new WeakMap();
    static #batchCache = new Map();
    static BATCH_CACHE_TTL = 5000; // 5 秒

    static isNullCached(value) {
        if (this.#nullCache.has(value)) {
            return this.#nullCache.get(value);
        }

        const result = this.#checkIsNull(value);
        this.#nullCache.set(value, result);
        return result;
    }

    static #checkIsNull(value) {
        return value === null || value === undefined || value === "" || (typeof value === "string" && value.trim() === "");
    }

    static clearNullCache() {
        this.#nullCache = new WeakMap();
    }

    static preprocessColumnData(sheet, col, rowCount) {
        const cacheKey = `${col}_${rowCount}`;
        const cached = this.#batchCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.BATCH_CACHE_TTL) {
            return cached.data;
        }

        const data = [];
        for (let row = 0; row < rowCount; row++) {
            const rawValue = sheet.getCellValue(row, col);

            data.push({
                raw: rawValue,
                key: this.normalizeToKey(rawValue),
                isNull: this.isNullCached(rawValue),
            });
        }

        this.#batchCache.set(cacheKey, {
            data,
            timestamp: Date.now(),
        });

        return data;
    }

    static normalizeToKey(value) {
        if (this.isNullCached(value)) {
            return "__EXCEL_NULL__";
        }
        return String(value);
    }

    static invalidateBatchCache(col) {
        for (const [key] of this.#batchCache) {
            if (key.startsWith(`${col}_`)) {
                this.#batchCache.delete(key);
            }
        }
    }

    static clearAllBatchCache() {
        this.#batchCache.clear();
    }

    static debounce(func, wait = 100) {
        let timeoutId = null;

        return function (...args) {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }

            timeoutId = setTimeout(() => {
                func.apply(this, args);
                timeoutId = null;
            }, wait);
        };
    }

    static throttle(func, limit = 100) {
        let inThrottle = false;

        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;

                setTimeout(() => {
                    inThrottle = false;
                }, limit);
            }
        };
    }

    static batchUpdate(items, batchSize = 50, callback) {
        let index = 0;

        function processBatch() {
            const batch = items.slice(index, index + batchSize);

            if (batch.length === 0) {
                callback?.(items.length);
                return;
            }

            index += batchSize;
            requestAnimationFrame(processBatch);
        }

        processBatch();
    }

    static measureTime(label, fn) {
        const start = performance.now();
        const result = fn();
        const end = performance.now();

        console.log(`[FilterPerf] ${label}: ${end - start.toFixed(2)}ms`);

        return result;
    }

    static estimateMemoryUsage(object) {
        const sizeMap = new Map();
        const stack = [object];
        let totalSize = 0;

        while (stack.length > 0) {
            const obj = stack.pop();

            if (sizeMap.has(obj)) continue;
            sizeMap.set(obj, true);

            if (typeof obj === "object" && obj !== null) {
                for (const key of Object.keys(obj)) {
                    stack.push(obj[key]);
                    totalSize += 8; // 估算每个引用的大小
                }
            } else if (typeof obj === "string") {
                totalSize += obj.length * 2; // UTF-16
            } else {
                totalSize += 8;
            }
        }

        return Math.round(totalSize / 1024); // KB
    }
}
