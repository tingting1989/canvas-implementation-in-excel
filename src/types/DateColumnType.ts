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
 * @module types/DateColumnType
 * @see BaseColumnType 列类型基类，定义 name、editorType、format、parse 等接口
 * @see SORT_ORDER 排序顺序枚举
 */

import { BaseColumnType } from "./BaseColumnType.js";
import { isString } from "../utils/helper.js";
import { DateTimeParser } from "../utils/DateTimeParser.js";
import { SORT_ORDER } from "../constants/enums/SortOrder.js";

export class DateColumnType extends BaseColumnType {
    get name(): string {
        return "date";
    }

    get editorType(): string {
        return "date";
    }

    format(value: any): string {
        if (value === undefined || value === null) return "";

        const date = this.#toDate(value);
        if (!date || isNaN(date.getTime())) return String(value);

        const pattern = this.options?.dateFormat?.pattern || "YYYY-MM-DD";

        return this.#formatDate(date, pattern);
    }

    validate(value: any): true | string | false {
        if (value === "" || value === undefined || value === null) return true;

        const pattern = this.options?.dateFormat?.pattern || "YYYY-MM-DD";
        const isTimeOnly = /^[Hhms: ]+$/.test(pattern);
        const hasTimePart = /[Hhms]/.test(pattern);
        const min = this.options?.min;
        const max = this.options?.max;

        if (typeof value === "string" && value.trim()) {
            const trimmed = value.trim();

            if (!isTimeOnly && !hasTimePart) {
                const isCompleteDate = /^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(trimmed);
                if (!isCompleteDate) {
                    return this.options?.allowInvalid ? "invalid" : false;
                }
            }

            if (isTimeOnly) {
                const isCompleteTime = /^\d{2}:\d{2}:\d{2}$/.test(trimmed);
                if (!isCompleteTime) {
                    return this.options?.allowInvalid ? "invalid" : false;
                }
            }

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

    parse(input: any): string {
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

        if (isTimeOnly) {
            const tResult = this.#parseTimeString(trimmed);
            if (tResult instanceof Date && !isNaN(tResult.getTime())) return trimmed;
            return input;
        }

        if (hasTimePart) {
            const dtResult = this.#parseDateTimeString(trimmed);
            if (dtResult instanceof Date && !isNaN(dtResult.getTime())) return trimmed;
            const date = new Date(trimmed);
            if (!isNaN(date.getTime())) return trimmed;
            return input;
        }

        const dResult = this.#parseDateString(trimmed);
        if (dResult instanceof Date && !isNaN(dResult.getTime())) {
            return this.#formatDate(dResult, "YYYY-MM-DD");
        }
        return input;
    }

    compare(a: any, b: any, order: string = "asc"): number {
        const da = this.#toDate(a);
        const db = this.#toDate(b);
        const ta = da && !isNaN(da.getTime()) ? da.getTime() : -Infinity;
        const tb = db && !isNaN(db.getTime()) ? db.getTime() : -Infinity;
        return order === SORT_ORDER.ASC ? ta - tb : tb - ta;
    }

    #toDate(value: any): Date | null {
        return DateTimeParser.parseAny(value);
    }

    #parseToDate(value: any): Date | null {
        if (value instanceof Date) return value;
        if (isString(value)) {
            const pattern = this.options?.dateFormat?.pattern || "YYYY-MM-DD";
            const isTimeOnly = /^[Hhms: ]+$/.test(pattern);
            const hasTimePart = /[Hhms]/.test(pattern);

            if (isTimeOnly) {
                return DateTimeParser.parseByMode(value, "time");
            } else if (hasTimePart) {
                return DateTimeParser.parseByMode(value, "datetime");
            } else {
                return DateTimeParser.parseByMode(value, "date");
            }
        }
        return null;
    }

    #getTimeOfDay(date: Date): number {
        return DateTimeParser.getTimeOfDay(date);
    }

    #parseDateString(str: string): Date | null {
        return DateTimeParser.parseDateString(str);
    }

    #parseTimeString(str: string): Date | null {
        return DateTimeParser.parseTimeString(str);
    }

    #parseDateTimeString(str: string): Date | null {
        return DateTimeParser.parseDateTimeString(str);
    }

    #formatDate(date: Date, pattern: string): string {
        return DateTimeParser.formatDate(date, pattern);
    }
}
