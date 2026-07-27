import { isNumber, isString } from "./helper.js";

export class DateTimeParser {
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

    static getTimeOfDay(date) {
        return date.getHours() * 3600000 + date.getMinutes() * 60000 + date.getSeconds() * 1000;
    }

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
