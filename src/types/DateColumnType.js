/**
 * 日期/时间/日期时间列类型（DateColumnType）
 *
 * 三合一列类型，通过 options.dateFormat.pattern 自动切换模式：
 *
 * | 模式       | pattern 示例           | 编辑器       | 数据存储格式              |
 * |------------|------------------------|--------------|---------------------------|
 * | 纯日期     | YYYY-MM-DD            | 日期选择器   | "2024-01-15"              |
 * | 纯时间     | HH:mm:ss              | 文本编辑器   | "14:30:00"                |
 * | 日期时间   | YYYY-MM-DD HH:mm:ss   | 文本编辑器   | "2024-01-15 14:30:00"     |
 *
 * ## 模式判断逻辑
 *
 * - **纯时间**：pattern 仅包含 H/h/m/s/:/空格（如 "HH:mm:ss"）
 * - **日期时间**：pattern 同时包含日期和时间的占位符
 * - **纯日期**：pattern 不包含任何时间占位符（默认模式）
 *
 * ## 自定义选项（this.options）
 *
 * | 选项                  | 类型    | 默认值        | 说明                                       |
 * |-----------------------|---------|---------------|--------------------------------------------|
 * | dateFormat.pattern    | string  | "YYYY-MM-DD"  | 日期/时间格式模式字符串                    |
 * | min                   | string  | —             | 最小值（如 "2020-01-01" 或 "08:00:00"）    |
 * | max                   | string  | —             | 最大值（如 "2030-12-31" 或 "18:00:00"）    |
 * | allowInvalid          | boolean | false         | 是否允许无效值（true 时返回 "invalid" 而非 false） |
 *
 * ## 格式化令牌（pattern 支持的占位符）
 *
 * | 令牌   | 含义             | 示例       |
 * |--------|------------------|------------|
 * | YYYY   | 四位年份         | 2024       |
 * | YY     | 两位年份         | 24         |
 * | MM     | 两位月份         | 01-12      |
 * | M      | 月份             | 1-12       |
 * | DD     | 两位日期         | 01-31      |
 * | D      | 日期             | 1-31       |
 * | HH     | 24小时制两位小时 | 00-23      |
 * | H      | 24小时制小时     | 0-23       |
 * | hh     | 12小时制两位小时 | 01-12      |
 * | h      | 12小时制小时     | 1-12       |
 * | mm     | 两位分钟         | 00-59      |
 * | m      | 分钟             | 0-59       |
 * | ss     | 两位秒           | 00-59      |
 * | s      | 秒               | 0-59       |
 * | A      | AM/PM 大写       | AM/PM      |
 * | a      | am/pm 小写       | am/pm      |
 * | Mon    | 英文月份缩写     | Jan-Dec    |
 * | 年/月/日 | 中文日期分隔符 | 2024年1月15日 |
 *
 * ## 支持的输入格式
 *
 * parse() 和 #toDate() 支持多种输入格式：
 * - Date 对象：直接使用
 * - 时间戳（数字）：new Date(timestamp)
 * - ISO 日期：YYYY-MM-DD、YYYY/MM/DD
 * - 斜杠日期：DD/MM/YYYY、MM/DD/YYYY（自动推断月/日顺序）
 * - 中文日期：YYYY年M月D日
 * - 24小时时间：HH:mm:ss、HH:mm
 * - 12小时时间：h:mm:ss AM/PM
 * - 日期时间：YYYY-MM-DD HH:mm:ss、YYYY/MM/DD HH:mm:ss
 *
 * @module types/DateColumnType
 * @see BaseColumnType 列类型基类，定义 name、editorType、format、parse 等接口
 * @see SORT_ORDER 排序顺序枚举
 */

import { BaseColumnType } from "./BaseColumnType.js";
import { isNumber, isString } from "../utils/helper.js";
import { SORT_ORDER } from "../constants/enums/SortOrder.js";
import { themeStyleProvider } from "../theme/index.js";

export class DateColumnType extends BaseColumnType {
    /** @type {string} 类型名称标识 */
    get name() {
        return "date";
    }

    /**
     * 关联的编辑器类型
     *
     * 返回 "date" 以便 EditorManager 正确路由到 DateEditor。
     * DateEditor 内部统一使用文本编辑器，确保所有模式都存储字符串格式。
     *
     * @type {string}
     */
    get editorType() {
        return "date";
    }

    /**
     * 格式化日期/时间/日期时间值为显示文本
     *
     * 将原始值（Date 对象、时间戳或字符串）按照 options.dateFormat.pattern
     * 格式化为字符串。无法解析的值直接转为字符串原样返回。
     *
     * @param {*} value - 原始值（Date 对象、时间戳或日期/时间字符串）
     * @returns {string} 格式化后的日期/时间文本，空值返回 ""
     */
    format(value) {
        if (value === undefined || value === null) return "";

        const date = this.#toDate(value);
        if (!date || isNaN(date.getTime())) return String(value);

        const pattern = this.options?.dateFormat?.pattern || "YYYY-MM-DD";

        return this.#formatDate(date, pattern);
    }

    /**
     * 验证日期/时间值是否有效
     *
     * 验证流程：
     * 1. 空值（""/undefined/null）视为合法
     * 2. 字符串输入：检查格式完整性（纯日期需 YYYY-MM-DD，纯时间需 HH:mm:ss，日期时间需两者兼具）
     * 3. 解析为 Date 对象：解析失败则无效
     * 4. 范围检查：与 min/max 比较（纯时间只比较一天内的时间部分）
     *
     * @param {*} value - 待验证的值
     * @returns {true|string|false} true 表示有效，字符串表示错误信息，false 表示无效（无提示信息）
     */
    validate(value) {
        if (value === "" || value === undefined || value === null) return true;

        const pattern = this.options?.dateFormat?.pattern || "YYYY-MM-DD";
        // 判断模式类型：纯时间 / 含时间部分 / 纯日期
        const isTimeOnly = /^[Hhms: ]+$/.test(pattern);
        const hasTimePart = /[Hhms]/.test(pattern);
        const min = this.options?.min;
        const max = this.options?.max;

        // 第 1 步：字符串输入的格式完整性检查
        if (typeof value === "string" && value.trim()) {
            const trimmed = value.trim();

            // 纯日期模式：只接受完整的 YYYY-MM-DD 或 YYYY/MM/DD 格式
            if (!isTimeOnly && !hasTimePart) {
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

        // 第 2 步：解析为 Date 对象，解析失败则无效
        const date = this.#toDate(value);
        if (!date || isNaN(date.getTime())) {
            return this.options?.allowInvalid ? "invalid" : false;
        }

        // 第 3 步：范围检查 - 最小值
        if (min) {
            const minDate = this.#parseToDate(min);
            if (minDate && date < minDate) {
                if (isTimeOnly) {
                    // 纯时间模式：只比较一天内的时间部分（忽略日期）
                    const minTime = this.#getTimeOfDay(minDate);
                    const valTime = this.#getTimeOfDay(date);
                    if (valTime < minTime) return `时间不能早于 ${this.format(min)}`;
                } else {
                    return `日期不能早于 ${this.format(min)}`;
                }
            }
        }

        // 第 3 步：范围检查 - 最大值
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
     * 解析用户输入为存储格式
     *
     * 所有模式都返回字符串格式，确保数据存储一致性。
     * 验证时内部会解析字符串为 Date 对象进行比较。
     *
     * 解析策略：
     * - Date 对象：根据 pattern 格式化为字符串
     * - 纯时间模式：验证时间格式有效后保留原字符串
     * - 日期时间模式：验证日期时间格式有效后保留原字符串
     * - 纯日期模式：验证日期格式有效后统一格式化为 YYYY-MM-DD
     * - 无法解析的输入：原样返回
     *
     * @param {*} input - 用户输入值
     * @returns {string} 解析后的字符串，空输入返回 ""
     */
    parse(input) {
        // 处理 Date 对象：根据 pattern 格式化为字符串
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

        // 纯日期模式：验证并统一格式化为 YYYY-MM-DD
        const dResult = this.#parseDateString(trimmed);
        if (dResult instanceof Date && !isNaN(dResult.getTime())) {
            return this.#formatDate(dResult, "YYYY-MM-DD");
        }
        // 不完整的日期（如 "11"）不应该被自动补全，拒绝并保留原值
        return input;
    }

    /**
     * 比较两个日期/时间值的大小
     *
     * 将两个值转为 Date 对象后比较时间戳。
     * 无法解析的值视为 -Infinity，排在最前面。
     *
     * @param {*} a - 第一个值
     * @param {*} b - 第二个值
     * @param {string} [order="asc"] - 排序顺序（"asc" 升序 / "desc" 降序）
     * @returns {number} 比较结果（负数 / 0 / 正数）
     */
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
     * 将任意值转换为 Date 对象
     *
     * 内部用于验证和比较，不直接用于 parse()（因为 parse() 返回字符串）。
     * 解析优先级：Date 对象 → 时间戳 → 纯时间字符串 → 纯日期字符串 → 日期时间字符串 → Date 构造器。
     *
     * @param {*} value - 输入值（Date / number / string）
     * @returns {Date|null} Date 对象，解析失败返回 null
     */
    #toDate(value) {
        if (value instanceof Date) return value;
        if (isNumber(value)) return new Date(value);
        if (isString(value)) {
            // 尝试解析为纯时间格式
            const timeResult = this.#parseTimeString(value);
            if (timeResult instanceof Date && !isNaN(timeResult.getTime())) return timeResult;

            // 尝试解析为纯日期格式
            const dateResult = this.#parseDateString(value);
            if (dateResult instanceof Date && !isNaN(dateResult.getTime())) return dateResult;

            // 尝试解析为日期时间格式
            const dtResult = this.#parseDateTimeString(value);
            if (dtResult instanceof Date && !isNaN(dtResult.getTime())) return dtResult;

            // 最后尝试 Date 构造器解析（如 ISO 8601 等标准格式）
            const d = new Date(value);
            return isNaN(d.getTime()) ? null : d;
        }
        return null;
    }

    /**
     * 将 min/max 配置值转换为 Date 对象
     *
     * 与 #toDate() 类似，但根据当前 pattern 模式选择优先解析策略，
     * 避免纯时间模式的 min/max 被错误解析为日期。
     *
     * @param {*} value - min/max 配置值
     * @returns {Date|null} Date 对象，解析失败返回 null
     */
    #parseToDate(value) {
        if (value instanceof Date) return value;
        if (isString(value)) {
            const pattern = this.options?.dateFormat?.pattern || "YYYY-MM-DD";
            const isTimeOnly = /^[Hhms: ]+$/.test(pattern);
            const hasTimePart = /[Hhms]/.test(pattern);

            if (isTimeOnly) {
                // 纯时间模式：优先解析为时间
                const tResult = this.#parseTimeString(value);
                if (tResult instanceof Date && !isNaN(tResult.getTime())) return tResult;
            } else if (hasTimePart) {
                // 日期时间模式：优先解析为日期时间
                const dtResult = this.#parseDateTimeString(value);
                if (dtResult instanceof Date && !isNaN(dtResult.getTime())) return dtResult;
                const d = new Date(value);
                return isNaN(d.getTime()) ? null : d;
            } else {
                // 纯日期模式：优先解析为日期
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
     *
     * 纯时间模式下，min/max 比较只关心时间部分，忽略日期。
     * 将时/分/秒转换为毫秒数，便于数值比较。
     *
     * @param {Date} date - 日期对象
     * @returns {number} 一天中的毫秒数（0 ~ 86399999）
     */
    #getTimeOfDay(date) {
        return date.getHours() * 3600000 + date.getMinutes() * 60000 + date.getSeconds() * 1000;
    }

    /**
     * 解析纯日期字符串为 Date 对象
     *
     * 支持的格式：
     * - YYYY-MM-DD 或 YYYY/MM/DD（ISO 格式）
     * - DD/MM/YYYY 或 MM/DD/YYYY（斜杠格式，自动推断月/日顺序）
     * - YYYY年M月D日（中文格式）
     *
     * 验证策略：解析后检查 getFullYear() 是否与输入年份一致，
     * 防止 JavaScript Date 构造器的自动溢出修正（如 2月30日 → 3月2日）。
     *
     * @param {string} str - 日期字符串
     * @returns {Date|null} Date 对象，解析失败返回 null
     */
    #parseDateString(str) {
        // YYYY-MM-DD 或 YYYY/MM/DD
        const iso = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
        if (iso) {
            const y = parseInt(iso[1], 10);
            const mo = parseInt(iso[2], 10) - 1;
            const d = parseInt(iso[3], 10);
            const date = new Date(y, mo, d);
            // 验证年份一致，防止日期溢出（如 2月30日被自动修正）
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            return null;
        }

        // DD/MM/YYYY 或 MM/DD/YYYY（自动推断：如果第一部分 > 12，一定是日）
        const sla = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
        if (sla) {
            const part1 = parseInt(sla[1], 10);
            const part2 = parseInt(sla[2], 10);
            const y = parseInt(sla[3], 10);
            // 第一部分 > 12，一定是日期（DD/MM/YYYY）
            if (part1 > 12) {
                const date = new Date(y, part2 - 1, part1);
                if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            }
            // 尝试 MM/DD/YYYY
            let date = new Date(y, part1 - 1, part2);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            // 尝试 DD/MM/YYYY
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
     * 解析纯时间字符串为 Date 对象
     *
     * 支持的格式：
     * - 24 小时制完整：HH:mm:ss（如 "14:30:00"）
     * - 24 小时制简写：HH:mm（如 "14:30"，秒默认为 0）
     * - 12 小时制：h:mm:ss AM/PM 或 h:mm AM/PM（如 "2:30:00 PM"）
     *
     * 返回的 Date 对象日期部分为当天，仅时间部分有意义。
     * 范围验证：小时 0-23（24h）/ 1-12（12h），分钟 0-59，秒 0-59。
     *
     * @param {string} str - 时间字符串
     * @returns {Date|null} Date 对象（日期为当天，时间为解析值），解析失败返回 null
     */
    #parseTimeString(str) {
        // 24小时制完整格式：HH:mm:ss
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

        // 24小时制简写格式：HH:mm（秒默认为 0）
        const h24Short = str.match(/^(\d{1,2}):(\d{1,2})$/);
        if (h24Short) {
            const h = parseInt(h24Short[1], 10);
            const m = parseInt(h24Short[2], 10);
            if (h < 0 || h > 23 || m < 0 || m > 59) return null;
            const date = new Date();
            date.setHours(h, m, 0, 0);
            return date;
        }

        // 12小时制格式：h:mm:ss AM/PM 或 h:mm AM/PM
        const h12 = str.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM|am|pm)$/i);
        if (h12) {
            let h = parseInt(h12[1], 10);
            const m = parseInt(h12[2], 10);
            const s = h12[3] ? parseInt(h12[3], 10) : 0;
            const ampm = h12[4].toUpperCase();
            if (h < 1 || h > 12 || m < 0 || m > 59 || s < 0 || s > 59) return null;
            // 12小时制 → 24小时制转换
            if (ampm === "PM" && h < 12) h += 12;
            if (ampm === "AM" && h === 12) h = 0;
            const date = new Date();
            date.setHours(h, m, s, 0);
            return date;
        }

        return null;
    }

    /**
     * 解析日期时间字符串为 Date 对象
     *
     * 支持的格式：
     * - YYYY-MM-DD HH:mm:ss 或 YYYY/MM/DD HH:mm:ss（ISO 日期时间）
     * - YYYY-MM-DD HH:mm 或 YYYY/MM/DD HH:mm（无秒）
     * - DD/MM/YYYY HH:mm:ss（斜杠日期时间，含秒）
     * - DD/MM/YYYY HH:mm（斜杠日期时间，无秒）
     *
     * 时间部分验证：小时 0-23，分钟 0-59，秒 0-59。
     * 日期部分验证：getFullYear() 与输入年份一致（防止溢出修正）。
     *
     * @param {string} str - 日期时间字符串
     * @returns {Date|null} Date 对象，解析失败返回 null
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

        // YYYY-MM-DD HH:mm 或 YYYY/MM/DD HH:mm（无秒）
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

        // DD/MM/YYYY HH:mm:ss（斜杠日期时间，含秒）
        const slaFull = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
        if (slaFull) {
            const part1 = parseInt(slaFull[1], 10);
            const part2 = parseInt(slaFull[2], 10);
            const y = parseInt(slaFull[3], 10);
            const h = parseInt(slaFull[4], 10);
            const mi = parseInt(slaFull[5], 10);
            const s = parseInt(slaFull[6], 10);
            if (h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) return null;
            // 尝试 DD/MM/YYYY 解释
            let date = new Date(y, part2 - 1, part1, h, mi, s);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            // 尝试 MM/DD/YYYY 解释
            date = new Date(y, part1 - 1, part2, h, mi, s);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            return null;
        }

        // DD/MM/YYYY HH:mm（斜杠日期时间，无秒）
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
     *
     * 将 Date 对象按照 pattern 中的占位符替换为对应的值。
     * 使用正则表达式按优先级匹配令牌（长令牌优先，如 YYYY 先于 YY）。
     *
     * 中文日期支持：当 pattern 包含"年/月/日"字符时，自动添加对应的令牌映射。
     *
     * @param {Date} date - 日期对象
     * @param {string} pattern - 格式模式字符串（如 "YYYY-MM-DD HH:mm:ss"）
     * @returns {string} 格式化后的日期/时间字符串
     */
    #formatDate(date, pattern) {
        const y = date.getFullYear();
        const mo = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        const h24 = date.getHours();
        // 12 小时制转换：0 时 → 12，13-23 时 → 1-11
        const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
        const ampm = h24 >= 12 ? "PM" : "AM";
        const mi = String(date.getMinutes()).padStart(2, "0");
        const s = String(date.getSeconds()).padStart(2, "0");
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        // 令牌映射表：占位符 → 格式化值
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

        // 中文日期支持：当 pattern 包含年/月/日时，添加对应的令牌
        if (/[年月日]/.test(pattern)) {
            tokens["年"] = "年";
            tokens["月"] = "月";
            tokens["日"] = "日";
        }

        // 使用正则替换所有令牌（长令牌优先匹配，如 YYYY 先于 YY）
        return pattern.replace(/YYYY|YY|MM|M|DD|D|HH|H|hh|h|mm|m|ss|s|Mon|A|a|年|月|日/g, (t) => tokens[t]);
    }
}
