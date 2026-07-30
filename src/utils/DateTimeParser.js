import { isNumber, isString } from "./helper.js";

/**
 * 日期时间解析器类
 * 用于将各种格式的字符串、数字或Date对象转换为标准的JavaScript Date对象
 * 支持多种日期格式：ISO格式、斜杠分隔格式、中文格式等
 * 支持多种时间格式：24小时制、12小时制（AM/PM）
 */
export class DateTimeParser {
    /**
     * 通用解析方法 - 自动识别并解析各种类型的输入值
     * 按照优先级尝试不同的解析策略：时间 -> 日期 -> 日期时间 -> 原生Date构造函数
     *
     * @param {*} value - 待解析的值，可以是：
     *   - Date对象：直接返回
     *   - 数字（时间戳）：转换为Date对象
     *   - 字符串：尝试按时间、日期、日期时间的顺序解析
     * @returns {Date|null} 解析成功返回Date对象，失败返回null
     *
     * @example
     * // Date对象直接返回
     * DateTimeParser.parseAny(new Date()) // => Date对象
     *
     * @example
     * // 时间戳转换
     * DateTimeParser.parseAny(1700000000000) // => 对应的Date对象
     *
     * @example
     * // 各种字符串格式
     * DateTimeParser.parseAny("2024-01-15")      // => 日期
     * DateTimeParser.parseAny("14:30:00")         // => 时间
     * DateTimeParser.parseAny("2024-01-15 14:30") // => 日期时间
     */
    static parseAny(value) {
        if (value instanceof Date) return value;
        if (isNumber(value)) return new Date(value);

        if (isString(value)) {
            const timeResult = DateTimeParser.parseTimeString(value);
            if (timeResult instanceof Date && !isNaN(timeResult.getTime())) return timeResult;

            const dateResult = DateTimeParser.parseDateString(value);
            if (dateResult instanceof Date && !isNaN(dateResult.getTime())) return dateResult;

            const dtResult = DateTimeParser.parseDateTimeString(value);
            if (dtResult instanceof Date && !isNaN(dtResult.getTime())) return dtResult;

            const d = new Date(value);
            return isNaN(d.getTime()) ? null : d;
        }
        return null;
    }

    /**
     * 根据指定模式解析日期时间值
     * 提供精确的解析控制，适用于需要明确解析类型的场景
     *
     * @param {*} value - 待解析的值（Date对象、数字或字符串）
     * @param {string} mode - 解析模式，可选值：
     *   - "time": 仅解析时间格式（如"14:30:00"）
     *   - "date": 优先解析日期格式，失败则回退到通用解析
     *   - "datetime": 优先解析日期时间格式，失败则回退到通用解析
     *   - 其他值：使用通用解析方法parseAny
     * @returns {Date|null} 解析成功返回Date对象，失败返回null
     *
     * @example
     * // 按时间模式解析
     * DateTimeParser.parseByMode("14:30:00", "time") // => 当天14:30:00的Date对象
     *
     * @example
     * // 按日期模式解析
     * DateTimeParser.parseByMode("2024-01-15", "date") // => 2024年1月15日的Date对象
     *
     * @example
     * // 按日期时间模式解析
     * DateTimeParser.parseByMode("2024-01-15 14:30", "datetime") // => 完整的日期时间
     */
    static parseByMode(value, mode) {
        if (value instanceof Date) return value;
        if (!isString(value) && !isNumber(value)) return null;

        if (isNumber(value)) return new Date(value);

        switch (mode) {
            case "time":
                return DateTimeParser.parseTimeString(value);
            case "date":
                return DateTimeParser.parseDateString(value) || DateTimeParser.parseAny(value);
            case "datetime":
                return DateTimeParser.parseDateTimeString(value) || DateTimeParser.parseAny(value);
            default:
                return DateTimeParser.parseAny(value);
        }
    }

    /**
     * 解析纯日期字符串（不包含时间部分）
     * 支持多种日期格式，自动处理月份和日期的顺序歧义
     *
     * @param {string} str - 日期字符串，支持以下格式：
     *   - ISO格式：YYYY-MM-DD 或 YYYY/MM/DD（如"2024-01-15"）
     *   - 斜杠格式：MM/DD/YYYY 或 DD/MM/YYYY（如"01/15/2024"）
     *   - 中文格式：YYYY年MM月DD日（如"2024年1月15日"）
     * @returns {Date|null} 解析成功返回Date对象（时间部分为00:00:00），失败返回null
     *
     * @example
     * // ISO格式
     * DateTimeParser.parseDateString("2024-01-15")  // => 2024-01-15T00:00:00
     * DateTimeParser.parseDateString("2024/01/15")  // => 2024-01-15T00:00:00
     *
     * @example
     * // 斜杠格式（智能判断月/日顺序）
     * DateTimeParser.parseDateString("01/15/2024")  // => 2024-01-15（1月15日）
     * DateTimeParser.parseDateString("15/01/2024")  // => 2024-01-15（1月15日，因为15>12判定为日）
     *
     * @example
     * // 中文格式
     * DateTimeParser.parseDateString("2024年1月15日") // => 2024-01-15T00:00:00
     */
    static parseDateString(str) {
        const iso = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
        if (iso) {
            const y = parseInt(iso[1], 10);
            const mo = parseInt(iso[2], 10) - 1;
            const d = parseInt(iso[3], 10);
            const date = new Date(y, mo, d);
            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;
            return null;
        }

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
     * 解析纯时间字符串（不包含日期部分）
     * 返回的Date对象使用当前日期，仅设置时间部分
     *
     * @param {string} str - 时间字符串，支持以下格式：
     *   - 24小时制完整格式：HH:mm:ss（如"14:30:00"）
     *   - 24小时制简短格式：HH:mm（如"14:30"，秒数默认为0）
     *   - 12小时制格式：H:mm:ss AM/PM 或 H:mm AM/PM（如"2:30 PM"、"2:30:00 pm"）
     * @returns {Date|null} 解析成功返回Date对象（日期部分为当前日期），失败返回null
     *
     * @example
     * // 24小时制完整格式
     * DateTimeParser.parseTimeString("14:30:00") // => 今天14:30:00
     * DateTimeParser.parseTimeString("09:15:30") // => 今天09:15:30
     *
     * @example
     * // 24小时制简短格式（秒数为0）
     * DateTimeParser.parseTimeString("14:30")    // => 今天14:30:00
     * DateTimeParser.parseTimeString("9:5")      // => 今天09:05:00
     *
     * @example
     * // 12小时制（支持AM/PM）
     * DateTimeParser.parseTimeString("2:30 PM")   // => 今天14:30:00
     * DateTimeParser.parseTimeString("12:00 AM")  // => 今天00:00:00（午夜）
     * DateTimeParser.parseTimeString("12:00 PM")  // => 今天12:00:00（正午）
     */
    static parseTimeString(str) {
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

        const h24Short = str.match(/^(\d{1,2}):(\d{1,2})$/);
        if (h24Short) {
            const h = parseInt(h24Short[1], 10);
            const m = parseInt(h24Short[2], 10);

            if (h < 0 || h > 23 || m < 0 || m > 59) return null;

            const date = new Date();
            date.setHours(h, m, 0, 0);
            return date;
        }

        const h12 = str.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM|am|pm)$/i);
        if (h12) {
            let h = parseInt(h12[1], 10);
            const m = parseInt(h12[2], 10);
            const s = h12[3] ? parseInt(h12[3], 10) : 0;
            const ampm = h12[4].toUpperCase();

            if (h < 1 || h > 12 || m < 0 || m > 59 || s < 0 || s > 59) return null;

            if (ampm === "AM") {
                if (h === 12) h = 0;
            } else {
                if (h !== 12) h += 12;
            }

            const date = new Date();
            date.setHours(h, m, s, 0);
            return date;
        }

        return null;
    }

    /**
     * 解析完整的日期时间字符串（同时包含日期和时间部分）
     * 支持多种国际化和本地化格式
     *
     * @param {string} str - 日期时间字符串，支持以下格式：
     *   - ISO完整格式：YYYY-MM-DDTHH:mm:ss 或 YYYY-MM-DD HH:mm:ss（如"2024-01-15T14:30:00"）
     *   - ISO简短格式：YYYY-MM-DDTHH:mm 或 YYYY-MM-DD HH:mm（秒数默认为0）
     *   - 斜杠格式：MM/DD/YYYY HH:mm:ss（如"01/15/2024 14:30:00"）
     *   - 中文完整格式：YYYY年MM月DD日 HH:mm:ss（如"2024年1月15日 14:30:00"）
     *   - 中文简短格式：YYYY年MM月DD日 HH:mm（秒数默认为0）
     * @returns {Date|null} 解析成功返回完整的Date对象，失败返回null
     *
     * @example
     * // ISO格式（支持T或空格分隔）
     * DateTimeParser.parseDateTimeString("2024-01-15T14:30:00") // => 2024-01-15T14:30:00
     * DateTimeParser.parseDateTimeString("2024-01-15 14:30")   // => 2024-01-15T14:30:00
     *
     * @example
     * // 斜杠格式（智能判断月/日顺序）
     * DateTimeParser.parseDateTimeString("01/15/2024 14:30:00") // => 2024-01-15T14:30:00
     *
     * @example
     * // 中文格式
     * DateTimeParser.parseDateTimeString("2024年1月15日 14:30:00") // => 2024-01-15T14:30:00
     * DateTimeParser.parseDateTimeString("2024年1月15日 14:30")    // => 2024-01-15T14:30:00
     */
    static parseDateTimeString(str) {
        const isoFull = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})[T\s](\d{1,2}):(\d{1,2}):(\d{1,2})$/);
        if (isoFull) {
            const y = parseInt(isoFull[1], 10);
            const mo = parseInt(isoFull[2], 10) - 1;
            const d = parseInt(isoFull[3], 10);
            const h = parseInt(isoFull[4], 10);
            const mi = parseInt(isoFull[5], 10);
            const s = parseInt(isoFull[6], 10);
            const date = new Date(y, mo, d, h, mi, s);

            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;

            return null;
        }

        const isoShort = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})[T\s](\d{1,2}):(\d{1,2})$/);
        if (isoShort) {
            const y = parseInt(isoShort[1], 10);
            const mo = parseInt(isoShort[2], 10) - 1;
            const d = parseInt(isoShort[3], 10);
            const h = parseInt(isoShort[4], 10);
            const mi = parseInt(isoShort[5], 10);
            const date = new Date(y, mo, d, h, mi, 0);

            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;

            return null;
        }

        const slashFull = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
        if (slashFull) {
            const part1 = parseInt(slashFull[1], 10);
            const part2 = parseInt(slashFull[2], 10);
            const y = parseInt(slashFull[3], 10);
            const h = parseInt(slashFull[4], 10);
            const mi = parseInt(slashFull[5], 10);
            const s = parseInt(slashFull[6], 10);
            let date;

            if (part1 > 12) {
                date = new Date(y, part2 - 1, part1, h, mi, s);
            } else {
                date = new Date(y, part1 - 1, part2, h, mi, s);
            }

            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;

            return null;
        }

        const cnFull = str.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
        if (cnFull) {
            const y = parseInt(cnFull[1], 10);
            const mo = parseInt(cnFull[2], 10) - 1;
            const d = parseInt(cnFull[3], 10);
            const h = parseInt(cnFull[4], 10);
            const mi = parseInt(cnFull[5], 10);
            const s = parseInt(cnFull[6], 10);
            const date = new Date(y, mo, d, h, mi, s);

            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;

            return null;
        }

        const cnShort = str.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{1,2})$/);
        if (cnShort) {
            const y = parseInt(cnShort[1], 10);
            const mo = parseInt(cnShort[2], 10) - 1;
            const d = parseInt(cnShort[3], 10);
            const h = parseInt(cnShort[4], 10);
            const mi = parseInt(cnShort[5], 10);
            const date = new Date(y, mo, d, h, mi, 0);

            if (!isNaN(date.getTime()) && date.getFullYear() === y) return date;

            return null;
        }

        return null;
    }

    /**
     * 获取一天中的时间（从午夜开始的毫秒数）
     * 用于时间比较或计算时间差
     *
     * @param {Date} date - Date对象
     * @returns {number} 从午夜00:00:00开始的毫秒数（0-86399999）
     *
     * @example
     * // 午夜
     * DateTimeParser.getTimeOfDay(new Date(2024, 0, 1, 0, 0, 0)) // => 0
     *
     * @example
     * // 下午2点30分15秒
     * DateTimeParser.getTimeOfDay(new Date(2024, 0, 1, 14, 30, 15)) // => 52215000
     * // 计算过程：14*3600000 + 30*60000 + 15*1000 = 50400000 + 1800000 + 15000 = 52215000
     */
    static getTimeOfDay(date) {
        return date.getHours() * 3600000 + date.getMinutes() * 60000 + date.getSeconds() * 1000;
    }

    /**
     * 根据指定的模式格式化Date对象为字符串
     * 支持灵活的格式化模式，包括国际化、本地化和自定义格式
     *
     * @param {Date} date - 要格式化的Date对象
     * @param {string} pattern - 格式化模式字符串，支持以下占位符：
     *
     *   **日期部分：**
     *   - YYYY: 四位年份（如2024）
     *   - YY: 两位年份（如24）
     *   - MM: 两位月份，01-12
     *   - M: 月份，1-12
     *   - DD: 两位日期，01-31
     *   - D: 日期，1-31
     *   - Mon: 英文月份缩写（Jan-Dec）
     *   - 年/月/日: 中文字符（当pattern中包含中文时自动启用）
     *
     *   **时间部分（24小时制）：**
     *   - HH: 两位小时，00-23
     *   - H: 小时，0-23
     *   - mm: 两位分钟，00-59
     *   - m: 分钟，0-59
     *   - ss: 两位秒数，00-59
     *   - s: 秒数，0-59
     *
     *   **时间部分（12小时制）：**
     *   - hh: 两位小时，01-12
     *   - h: 小时，1-12
     *   - A: AM/PM标识（大写）
     *   - a: am/pm标识（小写）
     *
     * @returns {string} 格式化后的日期时间字符串
     *
     * @example
     * // ISO标准格式
     * DateTimeParser.formatDate(new Date(2024, 0, 15, 14, 30, 5), "YYYY-MM-DD HH:mm:ss")
     * // => "2024-01-15 14:30:05"
     *
     * @example
     * // 中文格式
     * DateTimeParser.formatDate(new Date(2024, 0, 15, 14, 30, 5), "YYYY年MM月DD日 HH:mm:ss")
     * // => "2024年01月15日 14:30:05"
     *
     * @example
     * // 12小时制格式
     * DateTimeParser.formatDate(new Date(2024, 0, 15, 14, 30, 5), "YYYY-MM-DD hh:mm:ss A")
     * // => "2024-01-15 02:30:05 PM"
     *
     * @example
     * // 简短格式
     * DateTimeParser.formatDate(new Date(2024, 0, 15, 9, 5, 3), "YY/M/D H:m:s")
     * // => "24/1/15 9:5:3"
     *
     * @example
     * // 带英文月份的格式
     * DateTimeParser.formatDate(new Date(2024, 0, 15, 14, 30, 5), "Mon DD, YYYY HH:mm")
     * // => "Jan 15, 2024 14:30"
     */
    static formatDate(date, pattern) {
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
