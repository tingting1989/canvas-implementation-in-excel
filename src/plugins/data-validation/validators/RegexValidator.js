import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "@/core/ErrorHandler.js";
import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";

/**
 * 正则表达式验证器
 *
 * 用于根据正则表达式模式验证文本数据。
 * 支持常见场景：
 * - 邮箱格式验证
 * - 手机号验证
 * - 身份证号验证
 * - 自定义复杂模式
 *
 * @extends BaseValidator
 *
 * @example
 * const validator = new RegexValidator();
 * const result = await validator.validate('user@example.com', {
 *     type: 'regex',
 *     pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
 * });
 */
export class RegexValidator extends BaseValidator {
    static get TYPE() {
        return "regex";
    }

    /**
     * 预编译的正则表达式缓存
     * @type {Map<string, RegExp>}
     * @private
     */
    #patternCache = new Map();

    /**
     * 常用正则表达式预设
     * @type {Object<string, string>}
     * @static
     */
    static PRESETS = {
        email: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
        phoneCN: "^1[3-9]\\d{9}$",
        idCardCN: "^[1-9]\\d{5}(18|19|20)\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])\\d{3}[0-9Xx]$",
        url: "^https?:\\/\\/[^\\s/$.?#].[^\\s]*$",
        ipV4: "^((25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(25[0-5]|2[0-4]\\d|[01]?\\d\\d?)$",
        username: "^[a-zA-Z0-9_]{3,20}$",
        passwordStrong: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$",
        zipCodeUS: "^\\d{5}(-\\d{4})?$",
        numeric: "^-?\\d+(\\.\\d+)?$",
        alpha: "^[a-zA-Z]+$",
        alphanumeric: "^[a-zA-Z0-9]+$",
    };

    /**
     * 验证正则表达式匹配
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

        if (typeof value !== "string") {
            return ValidationResult.failure(rule.errorMessage || "正则表达式验证只能用于文本类型", "warning", { value, ruleId: rule.id });
        }

        try {
            const regex = this.getCompiledPattern(rule.pattern);

            if (!regex) {
                return ValidationResult.failure(`无效的正则表达式: ${rule.pattern}`, "warning", { value, ruleId: rule.id });
            }

            const isValid = regex.test(value);

            return isValid
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || `"${value}" 不符合要求的格式`, rule.errorStyle, {
                      value,
                      ruleId: rule.id,
                      metadata: { pattern: rule.pattern },
                  });
        } catch (error) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[RegexValidator] 正则表达式执行失败:", error);
            return ValidationResult.failure(`正则表达式错误: ${error.message}`, "warning", {
                value,
                ruleId: rule.id,
                metadata: { error: error.message },
            });
        }
    }

    /**
     * 获取编译后的正则表达式（带缓存）
     * @private
     * @param {string} pattern - 正则表达式字符串或预设名称
     * @returns {RegExp|null}
     */
    getCompiledPattern(pattern) {
        if (!pattern) return null;

        if (this.#patternCache.has(pattern)) {
            return this.#patternCache.get(pattern);
        }

        let actualPattern = pattern;

        if (RegexValidator.PRESETS[pattern]) {
            actualPattern = RegexValidator.PRESETS[pattern];
        }

        try {
            const regex = new RegExp(actualPattern);
            this.#patternCache.set(pattern, regex);
            return regex;
        } catch (e) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[RegexValidator] 编译正则表达式失败:", e);
            return null;
        }
    }

    /**
     * 清除正则表达式缓存
     */
    clearCache() {
        this.#patternCache.clear();
    }
}
