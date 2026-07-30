/**
 * 筛选性能优化工具
 *
 * 提供各种性能优化功能：
 * - 空值检测缓存（WeakMap）
 * - 批量数据预处理缓存
 * - 防抖处理
 */
export class FilterPerformanceUtils {
    static #nullCache = new WeakMap();
    static #batchCache = new Map();
    static BATCH_CACHE_TTL = 5000; // 5 秒

    /**
     * 检查值是否为空（带缓存）
     *
     * @param {*} value - 待检测的值
     * @returns {boolean} 是否为空
     */
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

    /**
     * 清除空值缓存
     */
    static clearNullCache() {
        this.#nullCache = new WeakMap();
    }

    /**
     * 预处理列数据
     *
     * 批量获取列数据并缓存，包含标准化和空值检测结果
     *
     * @param {Object} sheet - Sheet 对象
     * @param {number} col - 列索引
     * @param {number} rowCount - 行数
     * @returns {Array} 预处理后的数据数组
     */
    static preprocessColumnData(sheet, col, rowCount) {
        const cacheKey = `${col}_${rowCount}`;
        const cached = this.#batchCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.BATCH_CACHE_TTL) {
            return cached.data;
        }

        const data = [];
        for (let row = 0; row < rowCount; row++) {
            const cell = sheet.data.cellStore.get(row, col);
            const rawValue = cell?.value;

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

    /**
     * 标准化值为筛选用的键
     *
     * @param {*} value - 待标准化的值
     * @returns {string} 标准化后的键
     */
    static normalizeToKey(value) {
        if (this.isNullCached(value)) {
            return "__EXCEL_NULL__";
        }
        return String(value);
    }

    /**
     * 使指定列的批量缓存失效
     *
     * @param {number} col - 列索引
     */
    static invalidateBatchCache(col) {
        for (const [key] of this.#batchCache) {
            if (key.startsWith(`${col}_`)) {
                this.#batchCache.delete(key);
            }
        }
    }

    /**
     * 清除所有批量缓存
     */
    static clearAllBatchCache() {
        this.#batchCache.clear();
    }

    /**
     * 防抖函数
     *
     * @param {Function} func - 要防抖的函数
     * @param {number} wait - 等待时间（毫秒）
     * @returns {Function} 防抖后的函数
     */
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

    /**
     * 节流函数
     *
     * @param {Function} func - 要节流的函数
     * @param {number} limit - 时间限制（毫秒）
     * @returns {Function} 节流后的函数
     */
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
