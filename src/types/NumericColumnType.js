import { BaseColumnType } from "./BaseColumnType.js";
import { isNumber } from "../utils/helper.js";
import { SORT_ORDER } from "../constants/enums/SortOrder.js";
import { themeStyleProvider } from "../theme/index.js";

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
 * **其他特性**：
 * - 默认右对齐显示
 * - 智能解析输入（自动去除千分位逗号）
 * - 数值排序支持
 *
 * @extends {BaseColumnType}
 *
 * @example
 * // 创建数字列类型实例
 * const numericType = new NumericColumnType({
 *     numericFormat: { pattern: '0,0.00' },
 *     min: 0,
 *     max: 100,
 *     allowInvalid: false
 * });
 *
 * // 在列配置中使用
 * columns: [
 *     { type: 'numeric', width: 120, options: { numericFormat: { pattern: '$0,0.00' } } }
 * ]
 */
export class NumericColumnType extends BaseColumnType {
    /**
     * 获取类型名称
     * @returns {string} 固定返回 'numeric'
     */
    get name() {
        return "numeric";
    }

    /**
     * 获取编辑器类型
     * @returns {string} 固定返回 'numeric'，对应 NumericEditor
     */
    get editorType() {
        return "numeric";
    }

    /**
     * 格式化数值为显示文本
     *
     * 根据配置的格式模式对数值进行格式化。支持多种格式模式：
     * - 千分位格式: `0,0.00`, `0,0.0`, `0,0`
     * - 小数格式: `0.00`, `0.0`, `0`
     * - 百分比格式: `0.00%`, `0.0%`, `0%`
     * - 货币格式: `$0,0.00`, `€0,0.00`, `¥0,0.00`
     * - 科学计数法: `0.00E+00`
     *
     * @param {*} value - 原始值（可以是数字或可转换为数字的字符串）
     * @returns {string} 格式化后的显示文本
     *
     * @example
     * const type = new NumericColumnType({ numericFormat: { pattern: '0,0.00' } });
     * type.format(12345.6789); // 返回 "12,345.68"
     *
     * const percentType = new NumericColumnType({ numericFormat: { pattern: '0.00%' } });
     * percentType.format(0.456); // 返回 "45.60%"
     */
    format(value) {
        if (value === undefined || value === null || value === "") return "";
        const num = isNumber(value) ? value : parseFloat(value);
        if (isNaN(num)) return String(value);

        const pattern = this.options?.numericFormat?.pattern;
        if (!pattern) return String(num);

        return this.#formatByPattern(num, pattern);
    }

    /**
     * 验证值是否有效
     *
     * 验证规则：
     * 1. 空值（""、undefined、null）视为有效
     * 2. 非数字值：根据 allowInvalid 配置决定返回 'invalid' 或 false
     * 3. 数字值：检查是否在 min 和 max 范围内
     *
     * @param {*} value - 待验证的值
     * @returns {boolean|string}
     *   - `true`: 值有效
     *   - `false`: 值无效（当 allowInvalid 为 false 时）
     *   - `"invalid"`: 值无效但允许通过（当 allowInvalid 为 true 时）
     *   - `string`: 具体的错误消息（超出范围时）
     *
     * @example
     * const type = new NumericColumnType({ min: 0, max: 100 });
     * type.validate(50);    // true
     * type.validate(150);   // "数值不能大于 100"
     * type.validate(-5);    // "数值不能小于 0"
     * type.validate("abc"); // false
     *
     * const lenientType = new NumericColumnType({ allowInvalid: true });
     * lenientType.validate("abc"); // "invalid"
     */
    validate(value) {
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

    /**
     * 解析用户输入为数字
     *
     * 自动清理输入：
     * - 去除千分位逗号和空格
     * - 尝试转换为浮点数
     * - 如果转换失败则返回原始输入
     *
     * @param {string} input - 用户输入的字符串
     * @returns {number|string} 解析后的数字，或原始输入（无法转换时）
     *
     * @example
     * const type = new NumericColumnType();
     * type.parse("1,234.56");  // 1234.56
     * type.parse("  999  ");   // 999
     * type.parse("abc");       // "abc"
     * type.parse("");          // ""
     */
    parse(input) {
        if (!input) return "";
        const cleaned = String(input).replace(/[,\s]+/g, "");
        const num = parseFloat(cleaned);
        return isNaN(num) ? input : num;
    }

    /**
     * 排序比较函数
     *
     * 用于表格排序时比较两个数值的大小。
     * 无法解析的非数字值视为 -Infinity，排在最前面。
     *
     * @param {*} a - 第一个比较值
     * @param {*} b - 第二个比较值
     * @param {'asc'|'desc'} [order='asc'] - 排序方向
     * @returns {number} 比较结果
     *   - 负数: a 应该排在 b 前面
     *   - 正数: a 应该排在 b 后面
     *   - 零: a 和 b 相等
     *
     * @example
     * const type = new NumericColumnType();
     * type.compare(10, 5);      // 5 (10 > 5)
     * type.compare(5, 10);      // -5 (5 < 10)
     * type.compare(10, 10);     // 0
     * type.compare("abc", 5);   // -Infinity ("abc" 排在前面)
     */
    compare(a, b, order = "asc") {
        const na = isNumber(a) ? a : parseFloat(a);
        const nb = isNumber(b) ? b : parseFloat(b);

        if (isNaN(na) && isNaN(nb)) return 0;

        const va = isNaN(na) ? -Infinity : na;
        const vb = isNaN(nb) ? -Infinity : nb;
        return order === SORT_ORDER.ASC ? va - vb : vb - va;
    }

    /**
     * 根据格式模式格式化数字
     *
     * 支持的格式模式：
     *
     * | 模式 | 描述 | 示例 |
     * |------|------|------|
     * | `0,0.00` | 千分位，2位小数 | 1,234.56 |
     * | `0,0.0` | 千分位，1位小数 | 1,234.6 |
     * | `0,0` | 千分位，无小数 | 1,234 |
     * | `0.00` | 2位小数 | 1234.56 |
     * | `0.0` | 1位小数 | 1234.6 |
     * | `0` | 整数 | 1234 |
     * | `0.00%` | 百分比，2位小数 | 45.60% |
     * | `0.0%` | 百分比，1位小数 | 45.6% |
     * | `0%` | 百分比，无小数 | 46% |
     * | `$0,0.00` | 美元格式 | $1,234.56 |
     * | `€0,0.00` | 欧元格式 | €1,234.56 |
     * | `¥0,0.00` | 人民币格式 | ¥1,234.56 |
     * | `0.00E+00` | 科学计数法 | 1.23E+03 |
     *
     * @private
     * @param {number} num - 待格式化的数字
     * @param {string} pattern - 格式模式
     * @returns {string} 格式化后的字符串
     */
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
