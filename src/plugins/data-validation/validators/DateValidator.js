import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";

/**
 * 日期范围验证器
 *
 * 用于验证日期类型的数据，支持以下运算符：
 * - before / after：前后判断
 * - between / notBetween：范围判断
 * - equalTo / notEqualTo：相等性判断
 *
 * @extends BaseValidator
 *
 * @example
 * const validator = new DateValidator();
 * const result = await validator.validate(new Date('2024-06-25'), {
 *     type: 'date',
 *     operator: 'between',
 *     value: ['2024-01-01', '2024-12-31']
 * });
 */
export class DateValidator extends BaseValidator {
    static get TYPE() {
        return "date";
    }

    /**
     * 验证日期
     * @param {*} value - 待验证的值
     * @param {import('../ValidationRule.js').ValidationRule} rule - 规则
     * @param {Object} [context={}] - 上下文
     * @returns {Promise<ValidationResult>}
     */
    validate(value, rule, context = {}) {
        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank) {
            return allowed
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id });
        }

        const dateValue = this.parseDate(value);

        if (!dateValue) {
            return ValidationResult.failure(rule.errorMessage || `"${value}" 不是有效的日期格式`, rule.errorStyle, { value, ruleId: rule.id });
        }

        try {
            const [minDate, maxDate] = this.parseDateRange(rule.value);
            let isValid;

            switch (rule.operator) {
                case "before":
                    isValid = dateValue < minDate;
                    break;
                case "after":
                    isValid = dateValue > maxDate;
                    break;
                case "between":
                    isValid = dateValue >= minDate && dateValue <= maxDate;
                    break;
                case "notBetween":
                    isValid = dateValue < minDate || dateValue > maxDate;
                    break;
                case "equalTo":
                    isValid = dateValue.getTime() === minDate.getTime();
                    break;
                case "notEqualTo":
                    isValid = dateValue.getTime() !== minDate.getTime();
                    break;
                default:
                    throw new Error(`不支持的运算符: ${rule.operator}`);
            }

            return isValid
                ? ValidationResult.success()
                : ValidationResult.failure(this.buildErrorMessage(dateValue, rule), rule.errorStyle, { value, ruleId: rule.id });
        } catch (error) {
            return ValidationResult.failure(`日期验证失败: ${error.message}`, "warning", { value, ruleId: rule.id });
        }
    }

    /**
     * 解析日期值
     * @private
     * @param {*} value - 输入值
     * @returns {Date|null}
     */
    parseDate(value) {
        if (value instanceof Date && !isNaN(value)) {
            return value;
        }

        if (typeof value === "string") {
            const parsed = new Date(value);
            if (!isNaN(parsed)) {
                return parsed;
            }
        }

        if (typeof value === "number") {
            const parsed = new Date(value);
            if (!isNaN(parsed)) {
                return parsed;
            }
        }

        return null;
    }

    /**
     * 解析规则中的日期范围
     * @private
     * @param {*|*[]} value - 规则值
     * @returns {[Date, Date?]}
     */
    parseDateRange(value) {
        if (Array.isArray(value)) {
            return [this.parseDate(value[0]) || new Date(0), this.parseDate(value[1])];
        }

        const date = this.parseDate(value) || new Date(0);
        return [date, undefined];
    }

    /**
     * 构建错误消息
     * @private
     * @param {Date} dateValue - 实际日期
     * @param {import('../ValidationRule.js').ValidationRule} rule - 规则
     * @returns {string}
     */
    buildErrorMessage(dateValue, rule) {
        if (rule.errorMessage) return rule.errorMessage;

        const formatDate = (d) => d.toISOString().split("T")[0];
        const [min, max] = this.parseDateRange(rule.value);

        switch (rule.operator) {
            case "before":
                return `日期必须在 ${formatDate(min)} 之前`;
            case "after":
                return `日期必须在 ${formatDate(max)} 之后`;
            case "between":
                return `日期必须在 ${formatDate(min)} 和 ${formatDate(max)} 之间`;
            case "notBetween":
                return `日期不能在 ${formatDate(min)} 和 ${formatDate(max)} 之间`;
            case "equalTo":
                return `日期必须等于 ${formatDate(min)}`;
            case "notEqualTo":
                return `日期不能等于 ${formatDate(min)}`;
            default:
                return "日期验证失败";
        }
    }
}
