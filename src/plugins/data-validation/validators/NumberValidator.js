import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";

/**
 * 数值范围验证器
 *
 * 用于验证数值类型的数据，支持以下运算符：
 * - between / notBetween：范围判断
 * - greaterThan / lessThan：大小比较
 * - equalTo / notEqualTo：相等性判断
 * - greaterThanOrEqual / lessThanOrEqual：含等号的大小比较
 *
 * @extends BaseValidator
 *
 * @example
 * const validator = new NumberValidator();
 * const result = await validator.validate(50, {
 *     type: 'number',
 *     operator: 'between',
 *     value: [0, 100]
 * });
 */
export class NumberValidator extends BaseValidator {
    static get TYPE() {
        return "number";
    }

    /**
     * 验证数值
     * @param {*} value - 待验证的值
     * @param {import('../ValidationRule.js').ValidationRule} rule - 验证规则
     * @param {Object} [context={}] - 验证上下文
     * @returns {Promise<ValidationResult>}
     */
    validate(value, rule, context = {}) {
        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank) {
            return allowed
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id });
        }

        if (typeof value !== "number" || isNaN(value)) {
            return ValidationResult.failure(rule.errorMessage || `必须是数值类型`, rule.errorStyle, { value, ruleId: rule.id });
        }

        try {
            const isValid = this.compare(value, rule.value, rule.operator);

            return isValid
                ? ValidationResult.success()
                : ValidationResult.failure(this.buildErrorMessage(value, rule), rule.errorStyle, { value, ruleId: rule.id });
        } catch (error) {
            return ValidationResult.failure(`验证失败: ${error.message}`, "warning", { value, ruleId: rule.id, metadata: { error: error.message } });
        }
    }

    /**
     * 构建错误消息
     * @private
     * @param {number} value - 实际值
     * @param {import('../ValidationRule.js').ValidationRule} rule - 规则
     * @returns {string}
     */
    buildErrorMessage(value, rule) {
        if (rule.errorMessage) {
            return rule.errorMessage;
        }

        const [min, max] = Array.isArray(rule.value) ? rule.value : [rule.value];

        switch (rule.operator) {
            case "between":
                return `必须在 ${min} 和 ${max} 之间`;
            case "notBetween":
                return `不能在 ${min} 和 ${max} 之间`;
            case "greaterThan":
                return `必须大于 ${min}`;
            case "lessThan":
                return `必须小于 ${min}`;
            case "greaterThanOrEqual":
                return `必须大于或等于 ${min}`;
            case "lessThanOrEqual":
                return `必须小于或等于 ${min}`;
            case "equalTo":
                return `必须等于 ${min}`;
            case "notEqualTo":
                return `不能等于 ${min}`;
            default:
                return `数值验证失败`;
        }
    }
}
