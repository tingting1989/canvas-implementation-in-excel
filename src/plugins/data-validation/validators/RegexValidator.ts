import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";
import type { ValidationRule } from "../ValidationRule.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

/**
 * 正则表达式验证器
 *
 * 用于根据正则表达式模式验证文本数据。
 * 支持常见场景：邮箱格式验证、手机号验证、身份证号验证、自定义复杂模式。
 */
export class RegexValidator extends BaseValidator {
    static get TYPE(): string {
        return "regex";
    }

    #patternCache: Map<string, RegExp> = new Map();

    static PRESETS: Record<string, string> = {
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

    validate(value: any, rule: ValidationRule, context: Record<string, any> = {}): Promise<ValidationResult> {
        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank) {
            return Promise.resolve(
                allowed
                    ? ValidationResult.success()
                    : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id }),
            );
        }

        if (typeof value !== "string") {
            return Promise.resolve(
                ValidationResult.failure(rule.errorMessage || "正则表达式验证只能用于文本类型", "warning", { value, ruleId: rule.id }),
            );
        }

        try {
            const regex = this.getCompiledPattern(rule.pattern!);

            if (!regex) {
                return Promise.resolve(ValidationResult.failure(`无效的正则表达式: ${rule.pattern}`, "warning", { value, ruleId: rule.id }));
            }

            const isValid = regex.test(value);

            return Promise.resolve(
                isValid
                    ? ValidationResult.success()
                    : ValidationResult.failure(rule.errorMessage || `"${value}" 不符合要求的格式`, rule.errorStyle, {
                          value,
                          ruleId: rule.id,
                          metadata: { pattern: rule.pattern },
                      }),
            );
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[RegexValidator] 正则表达式执行失败:", error);
            return Promise.resolve(
                ValidationResult.failure(`正则表达式错误: ${error.message}`, "warning", {
                    value,
                    ruleId: rule.id,
                    metadata: { error: error.message },
                }),
            );
        }
    }

    getCompiledPattern(pattern: string): RegExp | null {
        if (!pattern) return null;

        if (this.#patternCache.has(pattern)) {
            return this.#patternCache.get(pattern)!;
        }

        let actualPattern = pattern;

        if (RegexValidator.PRESETS[pattern]) {
            actualPattern = RegexValidator.PRESETS[pattern];
        }

        try {
            const regex = new RegExp(actualPattern);
            this.#patternCache.set(pattern, regex);
            return regex;
        } catch (e: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[RegexValidator] 编译正则表达式失败:", e);
            return null;
        }
    }

    clearCache(): void {
        this.#patternCache.clear();
    }
}
