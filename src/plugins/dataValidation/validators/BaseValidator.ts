import { ValidationResult } from "../ValidationResult.js";
import type { ValidationRule } from "../ValidationRule.js";

/**
 * 验证器基类
 *
 * 所有具体验证器（NumberValidator、TextLengthValidator 等）必须继承此类，
 * 并实现 validate() 方法。
 */
export class BaseValidator {
    static get TYPE(): string {
        throw new Error("子类必须实现 TYPE 静态属性");
    }

    async validate(value: any, rule: ValidationRule, context: Record<string, any> = {}): Promise<ValidationResult> {
        throw new Error("子类必须实现 validate() 方法");
    }

    checkBlank(value: any, rule: ValidationRule): { isBlank: boolean; allowed: boolean } {
        const isBlank = value === null || value === undefined || value === "";
        return {
            isBlank,
            allowed: isBlank && rule.allowBlank,
        };
    }

    compare(a: any, b: any, operator: string): boolean {
        switch (operator) {
            case "equalTo":
                return a === b;
            case "notEqualTo":
                return a !== b;
            case "greaterThan":
                return a > b;
            case "lessThan":
                return a < b;
            case "greaterThanOrEqual":
                return a >= b;
            case "lessThanOrEqual":
                return a <= b;
            case "between":
                return Array.isArray(b) && a >= b[0] && a <= b[1];
            case "notBetween":
                return Array.isArray(b) && (a < b[0] || a > b[1]);
            default:
                throw new Error(`不支持的运算符: ${operator}`);
        }
    }
}
