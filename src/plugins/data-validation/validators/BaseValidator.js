/**
 * 验证器基类
 *
 * 所有具体验证器（NumberValidator、TextLengthValidator 等）必须继承此类，
 * 并实现 validate() 方法。
 *
 * @abstract
 */
export class BaseValidator {
    /** @type {string} 验证器类型标识 */
    static get TYPE() {
        throw new Error("子类必须实现 TYPE 静态属性");
    }

    /**
     * 验证值是否符合规则
     * @param {*} value - 待验证的值
     * @param {import('../ValidationRule.js').ValidationRule} rule - 验证规则
     * @param {Object} [context={}] - 验证上下文（如 row, col, sheet 等）
     * @returns {Promise<import('../ValidationResult.js').ValidationResult>}
     * @abstract
     */
    async validate(value, rule, context = {}) {
        throw new Error("子类必须实现 validate() 方法");
    }

    /**
     * 检查值是否为空（根据 allowBlank 配置）
     * @param {*} value - 待检查的值
     * @param {import('../ValidationRule.js').ValidationRule} rule - 验证规则
     * @returns {{ isBlank: boolean, allowed: boolean }}
     */
    checkBlank(value, rule) {
        const isBlank = value === null || value === undefined || value === "";
        return {
            isBlank,
            allowed: isBlank && rule.allowBlank,
        };
    }

    /**
     * 比较两个值（支持数值和日期）
     * @param {*} a - 第一个值
     * @param {*} b - 第二个值
     * @param {string} operator - 运算符
     * @returns {boolean}
     */
    compare(a, b, operator) {
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
