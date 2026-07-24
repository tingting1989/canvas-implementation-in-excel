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
     * 返回 "date" 以便 EditorManager 正确路由到 DateEditor
     * DateEditor 内部统一使用文本编辑器，确保所有模式都存储字符串格式
     */
    get editorType() {
        return "date";
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

        const pattern = this.options?.dateFormat?.pattern || "YYYY-MM-DD";
        const isTimeOnly = /^[Hhms: ]+$/.test(pattern);
        const hasTimePart = /[Hhms]/.test(pattern);
        const min = this.options?.min;
        const max = this.options?.max;

        // 如果是字符串输入，检查格式完整性
        if (typeof value === "string" && value.trim()) {
            const trimmed = value.trim();

            // 纯日期模式：只接受完整的 YYYY-MM-DD 格式
            if (!isTimeOnly && !hasTimePart) {
                // 检查是否匹配完整日期格式（YYYY-MM-DD 或 YYYY/MM/DD）
                const isCompleteDate = /^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(trimmed);
                if (!isCompleteDate) {
                    return this.options?.allowInvalid ? "invalid" : false;
                }
            }

            // 纯时间模式：只接受完整的 HH:mm:ss 格式
            if (isTimeOnly) {
                const isCompleteTime = /^\d{2}:\d{2}:\d{2}$/.test(trimmed);
                if (!isCompleteTime) {
                    return this.options?.allowInvalid ? "invalid" : false;
                }
            }

            // 日期时间模式：检查日期和时间部分的完整性
            if (hasTimePart) {
                const parts = trimmed.split(" ");
                if (parts.length !== 2) {
                    return this.options?.allowInvalid ? "invalid" : false;
                }
                const datePart = parts[0];
                const timePart = parts[1];
                const isCompleteDate = /^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(datePart);
                const isCompleteTime = /^\d{2}:\d{2}:\d{2}$/.test(timePart);
                if (!isCompleteDate || !isCompleteTime) {
                    return this.options?.allowInvalid ? "invalid" : false;
                }
            }
        }

        const date = this.#toDate(value);
        if (!date || isNaN(date.getTime())) {
            return this.options?.allowInvalid ? "invalid" : false;
        }

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
     * 支持：Date对象、纯日期、纯时间、日期时间格式
     *
     * 注意：所有模式都返回字符串格式，确保数据存储一致性
     * 验证时内部会解析字符串为 Date 对象进行比较
     */
    parse(input) {
        // 处理 Date 对象
        if (input instanceof Date) {
            const pattern = this.options?.dateFormat?.pattern || "YYYY-MM-DD";
            const isTimeOnly = /^[Hhms: ]+$/.test(pattern);
            const hasTimePart = /[Hhms]/.test(pattern);

            if (isTimeOnly) {
                return this.#formatDate(input, pattern);
            } else if (hasTimePart) {
                return this.#formatDate(input, pattern);
            } else {
                return this.#formatDate(input, "YYYY-MM-DD");
            }
        }

        if (!input || !input.trim()) return "";
        const trimmed = input.trim();

        const pattern = this.options?.dateFormat?.pattern || "YYYY-MM-DD";
        const isTimeOnly = /^[Hhms: ]+$/.test(pattern);
        const hasTimePart = /[Hhms]/.test(pattern);

        // 纯时间模式：验证并保留字符串格式
        if (isTimeOnly) {
            const tResult = this.#parseTimeString(trimmed);
            if (tResult instanceof Date && !isNaN(tResult.getTime())) return trimmed;
            return input;
        }

        // 日期时间模式：验证并保留字符串格式
        if (hasTimePart) {
            const dtResult = this.#parseDateTimeString(trimmed);
            if (dtResult instanceof Date && !isNaN(dtResult.getTime())) return trimmed;
            const date = new Date(trimmed);
            if (!isNaN(date.getTime())) return trimmed;
            return input;
        }

        // 纯日期模式：验证并保留字符串格式（统一为 YYYY-MM-DD）
        const dResult = this.#parseDateString(trimmed);
        if (dResult instanceof Date && !isNaN(dResult.getTime())) {
            return this.#formatDate(dResult, "YYYY-MM-DD");
        }
        // 不完整的日期（如 "11"）不应该被自动补全，拒绝并保留原值
        return input;
    }

    compare(a, b, order = "asc") {
        const da = this.#toDate(a);
        const db = this.#toDate(b);
        const ta = da && !isNaN(da.getTime()) ? da.getTime() : -Infinity;
        const tb = db && !isNaN(db.getTime()) ? db.getTime() : -Infinity;
        return order === SORT_ORDER.ASC ? ta - tb : tb - ta;
    }

    // ──────────────────────────────────────
    // 私有方法
    // ──────────────────────────────────────

    /**
     * 将值转为 Date 对象（内部使用，用于验证和比较）
     * 对于字符串值，尝试解析为 Date 而不调用 parse()（因为 parse() 可能返回字符串）
     * @private
     */
    #toDate(value) {
        if (value instanceof Date) return value;
        if (isNumber(value)) return new Date(value);
        if (isString(value)) {
            // 尝试解析时间格式
            const timeResult = this.#parseTimeString(value);
            if (timeResult instanceof Date && !isNaN(timeResult.getTime())) return timeResult;

            // 尝试解析日期格式
            const dateResult = this.#parseDateString(value);
            if (dateResult instanceof Date && !isNaN(dateResult.getTime())) return dateResult;

            // 尝试解析日期时间格式
            const dtResult = this.#parseDateTimeString(value);
            if (dtResult instanceof Date && !isNaN(dtResult.getTime())) return dtResult;

            // 尝试直接用 Date 解析
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
            const pattern = this.options?.dateFormat?.pattern || "YYYY-MM-DD";
            const isTimeOnly = /^[Hhms: ]+$/.test(pattern);
            const hasTimePart = /[Hhms]/.test(pattern);

            if (isTimeOnly) {
                const tResult = this.#parseTimeString(value);
                if (tResult instanceof Date && !isNaN(tResult.getTime())) return tResult;
            } else if (hasTimePart) {
                const dtResult = this.#parseDateTimeString(value);
                if (dtResult instanceof Date && !isNaN(dtResult.getTime())) return dtResult;
                const d = new Date(value);
                return isNaN(d.getTime()) ? null : d;
            } else {
                const dResult = this.#parseDateString(value);
                if (dResult instanceof Date && !isNaN(dResult.getTime())) return dResult;
                const d = new Date(value);
                return isNaN(d.getTime()) ? null : d;
            }
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