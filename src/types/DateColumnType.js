import { BaseColumnType } from "./BaseColumnType.js";
import { isNumber, isString } from "../utils/utils.js";

/**
 * 日期列类型
 *
 * 支持：
 * - 日期格式化（多种格式模式）
 * - 日期输入解析
 * - 日期范围验证
 * - 日期排序
 * - 默认居中对齐
 *
 * 配置选项：
 *   dateFormat: { pattern: 'YYYY-MM-DD' | 'YYYY/MM/DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | ... }
 *   min: '2020-01-01' — 最小日期
 *   max: '2030-12-31' — 最大日期
 *   allowInvalid: boolean — 是否允许无效日期
 */
export class DateColumnType extends BaseColumnType {
    get name() {
        return "date";
    }

    get editorType() {
        return "date";
    }

    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: "center" };
    }

    /**
     * 格式化日期
     * @param {*} value - 原始值（Date 对象、时间戳或日期字符串）
     * @returns {string}
     */
    format(value) {
        if (value === undefined || value === null) return "";

        const date = this.#toDate(value);
        if (!date || isNaN(date.getTime())) return String(value);

        const pattern = this.options?.dateFormat?.pattern || "YYYY-MM-DD";

        return this.#formatDate(date, pattern);
    }

    validate(value) {
        if (value === "" || value === undefined || value === null) return true;

        const date = this.#toDate(value);
        if (!date || isNaN(date.getTime())) {
            return this.options?.allowInvalid ? "invalid" : false;
        }

        const min = this.options?.min;
        const max = this.options?.max;
        if (min) {
            const minDate = this.#toDate(min);
            if (minDate && date < minDate) return `日期不能早于 ${this.format(min)}`;
        }
        if (max) {
            const maxDate = this.#toDate(max);
            if (maxDate && date > maxDate) return `日期不能晚于 ${this.format(max)}`;
        }

        return true;
    }

    parse(input) {
        if (!input || !input.trim()) return "";
        const trimmed = input.trim();

        // 尝试多种常见日期格式
        const formats = [
            // YYYY-MM-DD
            /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/,

            // DD/MM/YYYY
            /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/,

            // MM/DD/YYYY
            /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/,

            // YYYY年MM月DD日
            /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,
        ];

        for (const regex of formats) {
            const match = trimmed.match(regex);
            if (match) {
                let year, month, day;
                if (regex === formats[0]) {
                    // YYYY-MM-DD
                    year = parseInt(match[1], 10);
                    month = parseInt(match[2], 10) - 1;
                    day = parseInt(match[3], 10);
                } else if (regex === formats[1]) {
                    // DD/MM/YYYY (先尝试日/月/年)
                    const part1 = parseInt(match[1], 10);
                    const part2 = parseInt(match[2], 10);
                    year = parseInt(match[3], 10);

                    // 启发式判断：如果 part1 > 12 则可能是日/月格式
                    if (part1 > 12) {
                        day = part1;
                        month = part2 - 1;
                    } else {
                        month = part1 - 1;
                        day = part2;
                    }
                } else if (regex === formats[2]) {
                    // MM/DD/YYYY
                    month = parseInt(match[1], 10) - 1;
                    day = parseInt(match[2], 10);
                    year = parseInt(match[3], 10);
                } else if (regex === formats[3]) {
                    // YYYY年MM月DD日
                    year = parseInt(match[1], 10);
                    month = parseInt(match[2], 10) - 1;
                    day = parseInt(match[3], 10);
                }

                const date = new Date(year, month, day);
                if (!isNaN(date.getTime())) return date;

                return input; // 无法解析，保留原值
            }
        }

        // 尝试直接用 Date 解析
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) return date;

        return input;
    }

    compare(a, b, order = "asc") {
        const da = this.#toDate(a);
        const db = this.#toDate(b);
        const ta = da && !isNaN(da.getTime()) ? da.getTime() : -Infinity;
        const tb = db && !isNaN(db.getTime()) ? db.getTime() : -Infinity;
        return order === "asc" ? ta - tb : tb - ta;
    }

    /**
     * 将值转为 Date 对象
     * @param {*} value
     * @returns {Date|null}
     */
    #toDate(value) {
        if (value instanceof Date) return value;
        if (isNumber(value)) return new Date(value);
        if (isString(value)) {
            const d = new Date(value);
            return isNaN(d.getTime()) ? null : d;
        }
        return null;
    }

    /**
     * 按格式模式格式化日期
     * @param {Date} date
     * @param {string} pattern
     * @returns {string}
     */
    #formatDate(date, pattern) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        const h = String(date.getHours()).padStart(2, "0");
        const mi = String(date.getMinutes()).padStart(2, "0");
        const s = String(date.getSeconds()).padStart(2, "0");
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        const tokens = {
            YYYY: String(y),
            YY: String(y).slice(-2),
            MM: m,
            M: String(date.getMonth() + 1),
            DD: d,
            D: String(date.getDate()),
            HH: h,
            mm: mi,
            ss: s,
            Mon: monthNames[date.getMonth()],
        };

        // 如果 pattern 中包含中文，则扩展中文 token
        if (/[年月日]/.test(pattern)) {
            tokens["年"] = "年";
            tokens["月"] = "月";
            tokens["日"] = "日";
        }

        return pattern.replace(/YYYY|YY|MM|M|DD|D|HH|mm|ss|Mon|年|月|日/g, (t) => tokens[t]);
    }
}
