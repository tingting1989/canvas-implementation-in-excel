import { ColumnType } from "./ColumnType.js";

/**
 * 数字列类型
 *
 * 支持：
 * - 数字格式化（千分位、小数位、百分比、货币）
 * - 数字验证（范围限制）
 * - 右对齐默认样式
 * - 数字排序
 */
export class NumericColumnType extends ColumnType {
    get name() {
        return "numeric";
    }

    get editorType() {
        return "numeric";
    }

    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: "right" };
    }

    format(value) {
        if (value === undefined || value === null) return "";
        const num = typeof value === "number" ? value : parseFloat(value);
        if (isNaN(num)) return String(value);

        const pattern = this.options?.numericFormat?.pattern;
        if (!pattern) return String(num);

        return this.#formatByPattern(num, pattern);
    }

    validate(value) {
        if (value === "" || value === undefined || value === null) return true;

        const num = typeof value === "number" ? value : parseFloat(value);
        if (isNaN(num)) {
            return this.options?.allowInvalid ? "invalid" : false;
        }

        const min = this.options?.min;
        const max = this.options?.max;
        if (min !== undefined && num < min) {
            return `数值不能小于 ${min}`;
        }
        if (max !== undefined && num > max) {
            return `数值不能大于 ${max}`;
        }

        return true;
    }

    parse(input) {
        if (!input) return "";
        const cleaned = String(input).replace(/[,\s]+/g, "");
        const num = parseFloat(cleaned);
        return isNaN(num) ? input : num;
    }

    compare(a, b, order = "asc") {
        const na = typeof a === "number" ? a : parseFloat(a);
        const nb = typeof b === "number" ? b : parseFloat(b);
        const va = isNaN(na) ? -Infinity : na;
        const vb = isNaN(nb) ? -Infinity : nb;
        return order === "asc" ? va - vb : vb - va;
    }

    #formatByPattern(num, pattern) {
        // 千分位格式: 0,0.00 / 0,0.0 / 0,0
        if (pattern === "0,0.00" || pattern === "0,0.0" || pattern === "0,0") {
            const decimals = pattern.includes(".00") ? 2 : pattern.includes(".0") ? 1 : 0;
            return num.toLocaleString("en-US", {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            });
        }

        // 百分比格式: 0.00% / 0.0% / 0%
        if (pattern === "0.00%" || pattern === "0.0%" || pattern === "0%") {
            const decimals = pattern.includes(".00") ? 2 : pattern.includes(".0") ? 1 : 0;
            return (
                (num * 100).toLocaleString("en-US", {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals,
                }) + "%"
            );
        }

        // 货币格式: $0,0.00 / €0,0.00 / ¥0,0.00 等
        if (pattern.startsWith("$") || pattern.startsWith("\u20AC") || pattern.startsWith("\u00A5")) {
            const symbol = pattern[0];
            const rest = pattern.slice(1);
            const decimals = rest.includes(".00") ? 2 : rest.includes(".0") ? 1 : 0;
            const hasGroup = rest.includes(",");
            const formatted = hasGroup
                ? num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
                : num.toFixed(decimals);
            return symbol + formatted;
        }

        // 小数格式: 0.00 / 0.0 / 0
        if (pattern === "0.00" || pattern === "0.0" || pattern === "0") {
            const decimals = pattern.includes(".00") ? 2 : pattern.includes(".0") ? 1 : 0;
            return num.toFixed(decimals);
        }

        // 科学计数法: 0.00E+00
        if (pattern === "0.00E+00") {
            return num.toExponential(2);
        }

        return String(num);
    }
}
