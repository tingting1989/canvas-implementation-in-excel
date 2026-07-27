import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";
import { DateTimeParser } from "../../../utils/DateTimeParser.js";

const MODE_LABELS = {
    date: "日期",
    time: "时间",
    datetime: "日期时间",
};

const MODE_FORMATS = {
    date: "YYYY-MM-DD",
    time: "HH:mm",
    datetime: "YYYY-MM-DD HH:mm",
};

export class DateTimeValidator extends BaseValidator {
    static get TYPE() {
        return "datetime";
    }

    validate(value, rule, context = {}) {
        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank) {
            return allowed
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id });
        }

        const mode = rule.type || "date";
        const parsedValue = DateTimeParser.parseByMode(value, mode);

        if (!parsedValue) {
            const label = MODE_LABELS[mode] || "日期时间";
            return ValidationResult.failure(rule.errorMessage || `"${value}" 不是有效的${label}格式`, rule.errorStyle, { value, ruleId: rule.id });
        }

        try {
            const [minVal, maxVal] = this.parseRange(rule.value, mode);
            let isValid;

            if (mode === "time") {
                isValid = this.compareTime(parsedValue, minVal, maxVal, rule.operator);
            } else {
                isValid = this.compareDateTime(parsedValue, minVal, maxVal, rule.operator);
            }

            return isValid
                ? ValidationResult.success()
                : ValidationResult.failure(this.buildErrorMessage(rule, mode), rule.errorStyle, { value, ruleId: rule.id });
        } catch (error) {
            const label = MODE_LABELS[mode] || "日期时间";
            return ValidationResult.failure(`${label}验证失败: ${error.message}`, "warning", { value, ruleId: rule.id });
        }
    }

    parseRange(value, mode) {
        if (Array.isArray(value)) {
            return [DateTimeParser.parseByMode(value[0], mode) || new Date(0), DateTimeParser.parseByMode(value[1], mode)];
        }
        const parsed = DateTimeParser.parseByMode(value, mode) || new Date(0);
        return [parsed, undefined];
    }

    compareTime(value, minVal, maxVal, operator) {
        const v = DateTimeParser.getTimeOfDay(value);
        const min = DateTimeParser.getTimeOfDay(minVal);
        switch (operator) {
            case "before":
                return v < (maxVal !== undefined ? DateTimeParser.getTimeOfDay(maxVal) : min);
            case "after":
                return v > min;
            case "between":
                return maxVal !== undefined && v >= min && v <= DateTimeParser.getTimeOfDay(maxVal);
            case "notBetween":
                return maxVal === undefined || v < min || v > DateTimeParser.getTimeOfDay(maxVal);
            case "equalTo":
                return v === min;
            case "notEqualTo":
                return v !== min;
            default:
                throw new Error(`不支持的运算符: ${operator}`);
        }
    }

    compareDateTime(value, minVal, maxVal, operator) {
        const v = value.getTime();
        const min = minVal.getTime();
        switch (operator) {
            case "before":
                return maxVal !== undefined ? v < maxVal.getTime() : v < min;
            case "after":
                return v > min;
            case "between":
                return maxVal !== undefined && v >= min && v <= maxVal.getTime();
            case "notBetween":
                return maxVal === undefined || v < min || v > maxVal.getTime();
            case "equalTo":
                return v === min;
            case "notEqualTo":
                return v !== min;
            default:
                throw new Error(`不支持的运算符: ${operator}`);
        }
    }

    buildErrorMessage(rule, mode) {
        if (rule.errorMessage) return rule.errorMessage;

        const label = MODE_LABELS[mode] || "日期时间";
        const fmt = MODE_FORMATS[mode] || "YYYY-MM-DD";
        const [min, max] = this.parseRange(rule.value, mode);

        const formatVal = (d) => DateTimeParser.formatDate(d, fmt);

        switch (rule.operator) {
            case "before":
                return `${label}必须在 ${formatVal(max || min)} 之前`;
            case "after":
                return `${label}必须在 ${formatVal(min)} 之后`;
            case "between":
                return `${label}必须在 ${formatVal(min)} 和 ${formatVal(max)} 之间`;
            case "notBetween":
                return `${label}不能在 ${formatVal(min)} 和 ${formatVal(max)} 之间`;
            case "equalTo":
                return `${label}必须等于 ${formatVal(min)}`;
            case "notEqualTo":
                return `${label}不能等于 ${formatVal(min)}`;
            default:
                return `${label}验证失败`;
        }
    }
}
