import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";
import type { ValidationRule } from "../ValidationRule.js";

/**
 * 数值范围验证器
 *
 * 用于验证数值类型的数据，支持以下运算符：
 * - between / notBetween：范围判断
 * - greaterThan / lessThan：大小比较
 * - equalTo / notEqualTo：相等性判断
 * - greaterThanOrEqual / lessThanOrEqual：含等号的大小比较
 */
export class NumberValidator extends BaseValidator {
    static get TYPE(): string {
        return "number";
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

        let numValue = value;
        if (typeof value === "string") {
            numValue = Number(value);
        }

        if (typeof numValue !== "number" || isNaN(numValue)) {
            return Promise.resolve(ValidationResult.failure(rule.errorMessage || `必须是数值类型`, rule.errorStyle, { value, ruleId: rule.id }));
        }

        try {
            const isValid = this.compare(numValue, rule.value, rule.operator!);

            return Promise.resolve(
                isValid
                    ? ValidationResult.success()
                    : ValidationResult.failure(this.buildErrorMessage(numValue, rule), rule.errorStyle, { value, ruleId: rule.id }),
            );
        } catch (error: any) {
            return Promise.resolve(
                ValidationResult.failure(`验证失败: ${error.message}`, "warning", { value, ruleId: rule.id, metadata: { error: error.message } }),
            );
        }
    }

    buildErrorMessage(value: number, rule: ValidationRule): string {
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