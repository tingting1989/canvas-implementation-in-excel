import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";

/**
 * 文本长度验证器
 *
 * 用于验证文本数据的长度，支持以下运算符：
 * - between / notBetween：长度范围判断
 * - greaterThan / lessThan：长度大小比较
 * - equalTo / notEqualTo：长度相等性判断
 *
 * @extends BaseValidator
 *
 * @example
 * const validator = new TextLengthValidator();
 * const result = await validator.validate('hello', {
 *     type: 'text',
 *     operator: 'lengthBetween',
 *     value: [3, 10]
 * });
 */
export class TextLengthValidator extends BaseValidator {
    static get TYPE() {
        return "text";
    }

    /**
     * 验证文本长度
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

        const textValue = String(value);
        const length = textValue.length;

        try {
            let operator = rule.operator;

            if (operator.startsWith("length")) {
                operator = operator.replace("length", "");
                operator = operator.charAt(0).toLowerCase() + operator.slice(1);
            }

            const isValid = this.compare(length, rule.value, operator);

            return isValid
                ? ValidationResult.success()
                : ValidationResult.failure(this.buildErrorMessage(length, rule), rule.errorStyle, { value, ruleId: rule.id });
        } catch (error) {
            return ValidationResult.failure(`文本长度验证失败: ${error.message}`, "warning", {
                value,
                ruleId: rule.id,
                metadata: { error: error.message },
            });
        }
    }

    /**
     * 构建错误消息
     * @private
     * @param {number} length - 实际长度
     * @param {import('../ValidationRule.js').ValidationRule} rule - 规则
     * @returns {string}
     */
    buildErrorMessage(length, rule) {
        if (rule.errorMessage) {
            return rule.errorMessage;
        }

        const [min, max] = Array.isArray(rule.value) ? rule.value : [rule.value];
        const operator = rule.operator.replace("length", "");

        switch (operator) {
            case "between":
                return `长度必须在 ${min} 和 ${max} 个字符之间（当前: ${length}）`;
            case "notBetween":
                return `长度不能在 ${min} 和 ${max} 个字符之间（当前: ${length}）`;
            case "greaterThan":
                return `长度必须大于 ${min} 个字符（当前: ${length}）`;
            case "lessThan":
                return `长度必须小于 ${min} 个字符（当前: ${length}）`;
            case "greaterThanOrEqual":
                return `长度必须大于或等于 ${min} 个字符（当前: ${length}）`;
            case "lessThanOrEqual":
                return `长度必须小于或等于 ${min} 个字符（当前: ${length}）`;
            case "equalTo":
                return `长度必须等于 ${min} 个字符（当前: ${length}）`;
            case "notEqualTo":
                return `长度不能等于 ${min} 个字符（当前: ${length}）`;
            default:
                return `文本长度验证失败（当前: ${length}）`;
        }
    }
}
