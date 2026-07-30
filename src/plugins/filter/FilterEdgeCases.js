/**
 * 筛选边界情况处理器
 *
 * 处理各种特殊值的标准化和显示：
 * - 空值（null, undefined, ""）
 * - 特殊数值（NaN, Infinity, -Infinity）
 * - 包含换行/制表符的字符串
 * - 布尔值
 * - 日期对象
 * - 数组
 */
export class FilterEdgeCases {
    /**
     * 处理特殊值
     *
     * @param {*} value - 待处理的值
     * @returns {Object} { normalized, display, isSpecial }
     */
    static handleSpecialValues(value) {
        if (value === undefined || value === null) {
            return { normalized: "__EXCEL_NULL__", display: "(空白)", isSpecial: true };
        }

        if (typeof value === "string") {
            if (value.trim() === "") {
                return { normalized: "__EXCEL_NULL__", display: "(空白)", isSpecial: true };
            }

            if (value.includes("\n") || value.includes("\t")) {
                return {
                    normalized: value.replace(/[\n\t]/g, " "),
                    display: value.replace(/[\n\t]/g, " "),
                    isSpecial: true,
                };
            }
        }

        if (typeof value === "number") {
            if (!isFinite(value)) {
                if (isNaN(value)) {
                    return { normalized: "#N/A", display: "#N/A", isSpecial: true };
                }
                if (value === Infinity) {
                    return { normalized: "#INF", display: "#INF", isSpecial: true };
                }
                if (value === -Infinity) {
                    return { normalized: "-#INF", display: "-#INF", isSpecial: true };
                }
            }
        }

        if (typeof value === "boolean") {
            return {
                normalized: value ? "TRUE" : "FALSE",
                display: value ? "TRUE" : "FALSE",
                isSpecial: false,
            };
        }

        if (value instanceof Date) {
            const dateStr = value.toLocaleDateString();
            return { normalized: dateStr, display: dateStr, isSpecial: false };
        }

        if (Array.isArray(value)) {
            return {
                normalized: JSON.stringify(value),
                display: "[Array]",
                isSpecial: true,
            };
        }

        if (typeof value === "object" && value !== null) {
            return {
                normalized: "[Object]",
                display: "[Object]",
                isSpecial: true,
            };
        }

        return { normalized: String(value), display: String(value), isSpecial: false };
    }

    /**
     * 验证筛选配置是否有效
     *
     * @param {Object} filter - 筛选配置
     * @returns {Object} { valid, error }
     */
    static validateFilterInput(filter) {
        if (!filter) return { valid: false, error: "Filter cannot be null/undefined" };

        if (!filter.type || !["values", "condition"].includes(filter.type)) {
            return { valid: false, error: `Invalid filter type: ${filter.type}` };
        }

        if (filter.type === "values") {
            if (!(filter.uncheckedValues instanceof Set)) {
                return { valid: false, error: "uncheckedValues must be a Set" };
            }
        }

        if (filter.type === "condition") {
            const validOperators = ["eq", "neq", "contains", "notContains", "startsWith", "endsWith", "gt", "gte", "lt", "lte"];

            if (!validOperators.includes(filter.operator)) {
                return { valid: false, error: `Invalid operator: ${filter.operator}` };
            }
        }

        return { valid: true, error: null };
    }

    static sanitizeSearchKeyword(keyword) {
        if (typeof keyword !== "string") {
            return "";
        }

        let sanitized = keyword.trim();

        sanitized = sanitized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        if (sanitized.length > 100) {
            sanitized = sanitized.substring(0, 100);
        }

        return sanitized;
    }

    static handleLargeDataset(values, options = {}) {
        const maxItems = options.maxItems || 10000;
        const sampleSize = options.sampleSize || 100;

        if (values.length <= maxItems) {
            return {
                truncated: false,
                values,
                totalCount: values.length,
            };
        }

        const sampled = [];

        for (let i = 0; i < sampleSize; i++) {
            const index = Math.floor((i / sampleSize) * maxItems);
            sampled.push(values[index]);
        }

        return {
            truncated: true,
            values: sampled,
            totalCount: values.length,
            message: `显示前 ${maxItems} 条，共 ${values.length} 条`,
        };
    }

    static handleConcurrentUpdates(updates) {
        const deduplicated = new Map();

        for (const update of updates) {
            const key = `${update.col}_${update.type}`;

            if (!deduplicated.has(key) || update.timestamp > deduplicated.get(key).timestamp) {
                deduplicated.set(key, update);
            }
        }

        return Array.from(deduplicated.values()).sort((a, b) => a.timestamp - b.timestamp);
    }

    static recoverFromError(error, context) {
        console.error("[Filter] Error in", context, ":", error);

        switch (context) {
            case "extractUniqueValues":
                return [];

            case "computeHiddenRows":
                return new Set();

            case "renderDropdown":
                return null;

            default:
                throw error;
        }
    }
}
