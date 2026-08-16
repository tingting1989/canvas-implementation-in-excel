/**
 * 数字列类型
 *
 * 用于处理数值型数据的列类型，提供以下核心功能：
 *
 * **格式化支持**：
 * - 千分位格式: `0,0.00`, `0,0.0`, `0,0`
 * - 小数格式: `0.00`, `0.0`, `0`
 * - 百分比格式: `0.00%`, `0.0%`, `0%`
 * - 货币格式: `$0,0.00`, `€0,0.00`, `¥0,0.00`
 * - 科学计数法: `0.00E+00`
 *
 * **验证功能**：
 * - 自动检测无效数值（NaN）
 * - 支持配置最小值和最大值范围限制
 * - 可选允许无效值通过验证
 *
 * @extends BaseColumnType
 */

import { BaseColumnType } from "./BaseColumnType.js";
import { isNumber } from "../utils/helper.js";
import { SORT_ORDER } from "../constants/enums/SortOrder.js";

export class NumericColumnType extends BaseColumnType {
    get name(): string {
        return "numeric";
    }

    get editorType(): string {
        return "numeric";
    }

    format(value: any): string {
        if (value === undefined || value === null || value === "") return "";
        const num = isNumber(value) ? value : parseFloat(value);
        if (isNaN(num)) return String(value);

        const pattern = this.options?.numericFormat?.pattern;
        if (!pattern) return String(num);

        return this.#formatByPattern(num, pattern);
    }

    validate(value: any): boolean | string {
        if (value === "" || value === undefined || value === null) return true;

        const num = isNumber(value) ? value : parseFloat(value);
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

    parse(input: any): number | string {
        if (!input) return "";
        const cleaned = String(input).replace(/[,\s]+/g, "");
        const num = parseFloat(cleaned);
        return isNaN(num) ? input : num;
    }

    compare(a: any, b: any, order: string = "asc"): number {
        const na = isNumber(a) ? a : parseFloat(a);
        const nb = isNumber(b) ? b : parseFloat(b);

        if (isNaN(na) && isNaN(nb)) return 0;

        const va = isNaN(na) ? -Infinity : na;
        const vb = isNaN(nb) ? -Infinity : nb;
        return order === SORT_ORDER.ASC ? va - vb : vb - va;
    }

    #formatByPattern(num: number, pattern: string): string {
        if (pattern === "0,0.00" || pattern === "0,0.0" || pattern === "0,0") {
            const decimals = pattern.includes(".00") ? 2 : pattern.includes(".0") ? 1 : 0;
            return num.toLocaleString("en-US", {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            });
        }

        if (pattern === "0.00%" || pattern === "0.0%" || pattern === "0%") {
            const decimals = pattern.includes(".00") ? 2 : pattern.includes(".0") ? 1 : 0;
            return (
                (num * 100).toLocaleString("en-US", {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals,
                }) + "%"
            );
        }

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

        if (pattern === "0.00" || pattern === "0.0" || pattern === "0") {
            const decimals = pattern.includes(".00") ? 2 : pattern.includes(".0") ? 1 : 0;
            return num.toFixed(decimals);
        }

        if (pattern === "0.00E+00") {
            return num.toExponential(2);
        }

        return String(num);
    }
}
