import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";

/**
 * 时间范围验证器
 *
 * 用于验证时间类型的数据，支持 HH:mm 或 HH:mm:ss 格式。
 *
 * @extends BaseValidator
 *
 * @example
 * const validator = new TimeValidator();
 * const result = await validator.validate('14:30', {
 *     type: 'time',
 *     operator: 'between',
 *     value: ['09:00', '18:00']
 * });
 */
export class TimeValidator extends BaseValidator {
    static get TYPE() {
        return "time";
    }

    /**
     * 验证时间
     * @param {*} value - 待验证的值
     * @param {import('../ValidationRule.js').ValidationRule} rule - 规则
     * @param {Object} [context={}] - 上下文
     * @returns {Promise<ValidationResult>}
     */
    async validate(value, rule, context = {}) {
        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank) {
            return allowed
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id });
        }

        const timeValue = this.parseTime(value);

        if (timeValue === null) {
            return ValidationResult.failure(rule.errorMessage || `"${value}" 不是有效的时间格式（HH:mm 或 HH:mm:ss）`, rule.errorStyle, {
                value,
                ruleId: rule.id,
            });
        }

        try {
            const [minTime, maxTime] = this.parseTimeRange(rule.value);
            let isValid;

            switch (rule.operator) {
                case "before":
                    isValid = timeValue < minTime;
                    break;
                case "after":
                    isValid = timeValue > maxTime;
                    break;
                case "between":
                    isValid = timeValue >= minTime && timeValue <= maxTime;
                    break;
                case "notBetween":
                    isValid = timeValue < minTime || timeValue > maxTime;
                    break;
                case "equalTo":
                    isValid = Math.abs(timeValue - minTime) < 1;
                    break;
                case "notEqualTo":
                    isValid = Math.abs(timeValue - minTime) >= 1;
                    break;
                default:
                    throw new Error(`不支持的运算符: ${rule.operator}`);
            }

            return isValid
                ? ValidationResult.success()
                : ValidationResult.failure(this.buildErrorMessage(timeValue, rule), rule.errorStyle, { value, ruleId: rule.id });
        } catch (error) {
            return ValidationResult.failure(`时间验证失败: ${error.message}`, "warning", { value, ruleId: rule.id });
        }
    }

    /**
     * 解析时间为分钟数（从 00:00 开始计算）
     * @private
     * @param {*} value - 输入值
     * @returns {number|null}
     */
    parseTime(value) {
        if (typeof value !== "string") return null;

        const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return null;

        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);

        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return null;
        }

        return hours * 60 + minutes;
    }

    /**
     * 解析规则中的时间范围
     * @private
     * @param {*|*[]} value - 规则值
     * @returns {[number, number?]}
     */
    parseTimeRange(value) {
        if (Array.isArray(value)) {
            return [this.parseTime(value[0]) || 0, this.parseTime(value[1])];
        }

        const time = this.parseTime(value) || 0;
        return [time, undefined];
    }

    /**
     * 格式化分钟数为 HH:mm
     * @private
     * @param {number} minutes - 分钟数
     * @returns {string}
     */
    formatTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    }

    /**
     * 构建错误消息
     * @private
     * @param {number} timeValue - 实际时间（分钟数）
     * @param {import('../ValidationRule.js').ValidationRule} rule - 规则
     * @returns {string}
     */
    buildErrorMessage(timeValue, rule) {
        if (rule.errorMessage) return rule.errorMessage;

        const [min, max] = this.parseTimeRange(rule.value);

        switch (rule.operator) {
            case "before":
                return `时间必须在 ${this.formatTime(min)} 之前`;
            case "after":
                return `时间必须在 ${this.formatTime(max)} 之后`;
            case "between":
                return `时间必须在 ${this.formatTime(min)} 和 ${this.formatTime(max)} 之间`;
            case "notBetween":
                return `时间不能在 ${this.formatTime(min)} 和 ${this.formatTime(max)} 之间`;
            case "equalTo":
                return `时间必须等于 ${this.formatTime(min)}`;
            case "notEqualTo":
                return `时间不能等于 ${this.formatTime(min)}`;
            default:
                return "时间验证失败";
        }
    }
}
