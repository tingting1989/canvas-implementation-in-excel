import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";
import type { ValidationRule } from "../ValidationRule.js";

/**
 * 文本长度验证器
 *
 * 用于验证文本数据的长度，支持以下运算符：
 * - between / notBetween：长度范围判断
 * - greaterThan / lessThan：长度大小比较
 * - equalTo / notEqualTo：长度相等性判断
 */
export class TextLengthValidator extends BaseValidator {
    static get TYPE(): string {
        return "text";
    }

    validate(value: any, rule: ValidationRule, context: Record<string, any> = {}): Promise<ValidationResult> {
        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank) {
            return Promise.resolve(
                allowed
                    ? ValidationResult.success()
                    : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id }),
            );
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

            return Promise.resolve(
                isValid
                    ? ValidationResult.success()
                    : ValidationResult.failure(this.buildErrorMessage(length, rule), rule.errorStyle, { value, ruleId: rule.id }),
            );
        } catch (error: any) {
            return Promise.resolve(
                ValidationResult.failure(`文本长度验证失败: ${error.message}`, "warning", {
                    value,
                    ruleId: rule.id,
                    metadata: { error: error.message },
                }),
            );
        }
    }

    buildErrorMessage(length: number, rule: ValidationRule): string {
        if (rule.errorMessage) {
            return rule.errorMessage;
        }

        const [min, max] = Array.isArray(rule.value) ? rule.value : [rule.value];
        const operator = (rule.operator as string).replace("length", "");

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
