import { BaseColumnType } from "./BaseColumnType.js";
import { isNumber, isString } from "../utils/helper.js";
import { SORT_ORDER } from "../constants/enums/SortOrder.js";
import { themeStyleProvider } from "../theme/index.js";

/**
 * 日期/时间/日期时间列类型（三合一）
 *
 * 通过 pattern 自动切换模式：
 * - 纯日期：YYYY-MM-DD → 原生日期选择器
 * - 纯时间：HH:mm:ss → 文本编辑器
 * - 日期时间：YYYY-MM-DD HH:mm:ss → 文本编辑器
 *
 * 配置选项：
 *   dateFormat: { pattern: 'YYYY-MM-DD' | 'HH:mm:ss' | 'YYYY-MM-DD HH:mm:ss' | ... }
 *   min: '2020-01-01' 或 '2020-01-01 08:00:00' — 最小值
 *   max: '2030-12-31' 或 '2030-12-31 18:00:00' — 最大值
 *   allowInvalid: boolean — 是否允许无效值
 */
export class DateColumnType extends BaseColumnType {
    get name() {
        return "date";
    }

    /**
     * 根据 pattern 动态选择编辑器
     * - 纯日期 pattern → 原生日期选择器（体验最佳）
     * - 含时间 token → 文本编辑器
     */
    get editorType() {
        const pattern = this.options?.dateFormat?.pattern || "YYYY-MM-DD";
        const hasTimeTokens = /[Hhms]/.test(pattern);
        return hasTimeTokens ? "text" : "date";
    }

    /**
     * 格式化日期/时间/日期时间
     * @param {*} value - 原始值（Date 对象、时间戳或字符串）
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
        const pattern = this.options?.dateFormat?.pattern || "YYYY-MM-DD";
        const isTimeOnly = /^[Hhms: ]+$/.test(pattern);

        if (min) {
            const minDate = this.#parseToDate(min);
            if (minDate && date < minDate) {
                if (isTimeOnly) {
                    const minTime = this.#getTimeOfDay(minDate);
                    const valTime = this.#getTimeOfDay(date);
                    if (valTime < minTime) return `时间不能早于 ${this.format(min)}`;
                } else {
                    return `日期不能早于 ${this.format(min)}`;
                }
            }
        }
        if (max) {
            const maxDate = this.#parseToDate(max);
            if (maxDate && date > maxDate) {
                if (isTimeOnly) {
                    const maxTime = this.#getTimeOfDay(maxDate);
                    const valTime = this.#getTimeOfDay(date);
                    if (valTime > maxTime) return `时间不能晚于 ${this.format(max)}`;
                } else {
                    return `日期不能晚于 ${this.format(max)}`;
                }
            }
        }

        return true;
    }

    /**
     * 解析用户输入
     * 支持：纯日期、纯时间、日期时间格式
     */
    parse(input) {
        if (!input || !input.trim()) return "";
        const trimmed = input.trim();

        // 尝试日期时间格式（含时间部分）
        const dtResult = this.#parseDateTimeString(trimmed);
        if (dtResult instanceof Date && !isNaN(dtResult.getTime())) return dtResult;

        // 尝试纯日期格式
        const dResult = this.#parseDateString(trimmed);
        if (dResult instanceof Date && !isNaN(dResult.getTime())) return dResult;

        // 尝试纯时间格式
        const tResult = this.#parseTimeString(trimmed);
        if (tResult instanceof Date && !isNaN(tResult.getTime())) return tResult;

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
        return order === SORT_ORDER.ASC ? ta - tb : tb - ta;
    }

    getDefaultStyle(baseStyle) {
        const textAlign = baseStyle?.textAlign ?? "center";
        return { ...baseStyle, textAlign };
    }

    // ──────────────────────────────────────
    // 私有方法
    // ──────────────────────────────────────

    /**
     * 将值转为 Date 对象
     * @private
     */
    #toDate(value) {
        if (value instanceof Date) return value;
        if (isNumber(value)) return new Date(value);
        if (isString(value)) {
            const parsed = this.parse(value);
            if (parsed instanceof Date && !isNaN(parsed.getTime())) return parsed;
            const d = new Date(value);
            return isNaN(d.getTime()) ? null : d;
        }
        return null;
    }

    /**
     * 将 min/max 配置值转为 Date 对象
     * @private
     */
    #parseToDate(value) {
        if (value instanceof Date) return value;
        if (isString(value)) {
            const parsed = this.parse(value);
            if (parsed instanceof Date && !isNaN(parsed.getTime())) return parsed;
        }
        return null;
    }

    /**
     * 获取一天中的毫秒数（用于纯时间比较）
     * @private
     */
    #getTimeOfDay(date) {
        return date.getHours() * 3600000 + date.getMinutes() * 60000 + date.getSeconds() * 1000;
    }

    /**
     * 解析纯日期格式
     * @private
     */
    #parseDateString(str) {
        // YYYY-MM-DD 或 YYYY/MM/DD
        const iso = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
        if (iso) {
            const y = parseInt(iso[1], 10);
            const mo = parseInt(iso[2], 10) - 1;
            const d = parseInt(iso[3], 10);
            const date = new Date(y, mo, d);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            return null;
        }

        // DD/MM/YYYY 或 MM/DD/YYYY
        const sla = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
        if (sla) {
            const part1 = parseInt(sla[1], 10);
            const part2 = parseInt(sla[2], 10);
            const y = parseInt(sla[3], 10);
            if (part1 > 12) {
                const date = new Date(y, part2 - 1, part1);
                if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            }
            let date = new Date(y, part1 - 1, part2);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            date = new Date(y, part2 - 1, part1);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            return null;
        }

        // YYYY年MM月DD日 或 YYYY年M月D日
        const cn = str.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
        if (cn) {
            const y = parseInt(cn[1], 10);
            const mo = parseInt(cn[2], 10) - 1;
            const d = parseInt(cn[3], 10);
            const date = new Date(y, mo, d);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            return null;
        }

        return null;
    }

    /**
     * 解析纯时间格式
     * @private
     */
    #parseTimeString(str) {
        // 24小时制：HH:mm:ss
        const h24Full = str.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
        if (h24Full) {
            const h = parseInt(h24Full[1], 10);
            const m = parseInt(h24Full[2], 10);
            const s = parseInt(h24Full[3], 10);
            if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null;
            const date = new Date();
            date.setHours(h, m, s, 0);
            return date;
        }

        // 24小时制：HH:mm
        const h24Short = str.match(/^(\d{1,2}):(\d{1,2})$/);
        if (h24Short) {
            const h = parseInt(h24Short[1], 10);
            const m = parseInt(h24Short[2], 10);
            if (h < 0 || h > 23 || m < 0 || m > 59) return null;
            const date = new Date();
            date.setHours(h, m, 0, 0);
            return date;
        }

        // 12小时制：h:mm:ss AM/PM
        const h12 = str.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM|am|pm)$/i);
        if (h12) {
            let h = parseInt(h12[1], 10);
            const m = parseInt(h12[2], 10);
            const s = h12[3] ? parseInt(h12[3], 10) : 0;
            const ampm = h12[4].toUpperCase();
            if (h < 1 || h > 12 || m < 0 || m > 59 || s < 0 || s > 59) return null;
            if (ampm === "PM" && h < 12) h += 12;
            if (ampm === "AM" && h === 12) h = 0;
            const date = new Date();
            date.setHours(h, m, s, 0);
            return date;
        }

        return null;
    }

    /**
     * 解析日期时间格式
     * @private
     */
    #parseDateTimeString(str) {
        // YYYY-MM-DD HH:mm:ss 或 YYYY/MM/DD HH:mm:ss
        const full = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
        if (full) {
            const y = parseInt(full[1], 10);
            const mo = parseInt(full[2], 10) - 1;
            const d = parseInt(full[3], 10);
            const h = parseInt(full[4], 10);
            const mi = parseInt(full[5], 10);
            const s = parseInt(full[6], 10);
            if (h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) return null;
            const date = new Date(y, mo, d, h, mi, s);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            return null;
        }

        // YYYY-MM-DD HH:mm 或 YYYY/MM/DD HH:mm
        const noSec = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{1,2}):(\d{1,2})$/);
        if (noSec) {
            const y = parseInt(noSec[1], 10);
            const mo = parseInt(noSec[2], 10) - 1;
            const d = parseInt(noSec[3], 10);
            const h = parseInt(noSec[4], 10);
            const mi = parseInt(noSec[5], 10);
            if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
            const date = new Date(y, mo, d, h, mi, 0);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            return null;
        }

        // DD/MM/YYYY HH:mm:ss
        const slaFull = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
        if (slaFull) {
            const part1 = parseInt(slaFull[1], 10);
            const part2 = parseInt(slaFull[2], 10);
            const y = parseInt(slaFull[3], 10);
            const h = parseInt(slaFull[4], 10);
            const mi = parseInt(slaFull[5], 10);
            const s = parseInt(slaFull[6], 10);
            if (h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) return null;
            let date = new Date(y, part2 - 1, part1, h, mi, s);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            date = new Date(y, part1 - 1, part2, h, mi, s);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            return null;
        }

        // DD/MM/YYYY HH:mm
        const slaNoSec = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})\s+(\d{1,2}):(\d{1,2})$/);
        if (slaNoSec) {
            const part1 = parseInt(slaNoSec[1], 10);
            const part2 = parseInt(slaNoSec[2], 10);
            const y = parseInt(slaNoSec[3], 10);
            const h = parseInt(slaNoSec[4], 10);
            const mi = parseInt(slaNoSec[5], 10);
            if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
            let date = new Date(y, part2 - 1, part1, h, mi, 0);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            date = new Date(y, part1 - 1, part2, h, mi, 0);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            return null;
        }

        return null;
    }

    /**
     * 按格式模式格式化日期/时间
     * @private
     */
    #formatDate(date, pattern) {
        const y = date.getFullYear();
        const mo = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        const h24 = date.getHours();
        const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
        const ampm = h24 >= 12 ? "PM" : "AM";
        const mi = String(date.getMinutes()).padStart(2, "0");
        const s = String(date.getSeconds()).padStart(2, "0");
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        const tokens = {
            YYYY: String(y),
            YY: String(y).slice(-2),
            MM: mo,
            M: String(date.getMonth() + 1),
            DD: d,
            D: String(date.getDate()),
            HH: String(h24).padStart(2, "0"),
            H: String(h24),
            hh: String(h12).padStart(2, "0"),
            h: String(h12),
            mm: mi,
            m: String(date.getMinutes()),
            ss: s,
            s: String(date.getSeconds()),
            A: ampm,
            a: ampm.toLowerCase(),
            Mon: monthNames[date.getMonth()],
        };

        if (/[年月日]/.test(pattern)) {
            tokens["年"] = "年";
            tokens["月"] = "月";
            tokens["日"] = "日";
        }

        return pattern.replace(/YYYY|YY|MM|M|DD|D|HH|H|hh|h|mm|m|ss|s|Mon|A|a|年|月|日/g, (t) => tokens[t]);
    }
}
