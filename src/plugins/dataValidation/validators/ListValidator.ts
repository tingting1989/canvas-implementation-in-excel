import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";
import type { ValidationRule } from "../ValidationRule.js";
import { ListSourceResolver } from "../ListSourceResolver.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

/**
 * 下拉列表验证器
 *
 * 用于验证值是否在预定义的选项列表中。
 * 支持两种 source 模式：
 * 1. 静态数组：['选项1', '选项2', '选项3']
 * 2. 动态区域引用：'=Sheet1!$A$1:$A$10'
 */
export class ListValidator extends BaseValidator {
    static get TYPE(): string {
        return "list";
    }

    #sourceResolver: ListSourceResolver | null = null;

    async validate(value: any, rule: ValidationRule, context: Record<string, any> = {}): Promise<ValidationResult> {
        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank) {
            return allowed
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || "请选择一个选项", rule.errorStyle, { ruleId: rule.id });
        }

        let options: string[];

        if (Array.isArray(rule.source)) {
            options = rule.source;
        } else if (typeof rule.source === "string") {
            options = await this.resolveDynamicSource(rule.source, context);
        } else {
            return ValidationResult.failure("无效的下拉列表配置", "warning", { ruleId: rule.id });
        }

        if (!options || options.length === 0) {
            return ValidationResult.failure("下拉列表为空", "warning", { ruleId: rule.id });
        }

        const isValid = options.some((option) => String(option) === String(value));

        return isValid
            ? ValidationResult.success()
            : ValidationResult.failure(rule.errorMessage || `"${value}" 不在允许的选项列表中`, rule.errorStyle, {
                  value,
                  ruleId: rule.id,
                  metadata: { availableOptions: options },
              });
    }

    validateSync(value: any, rule: ValidationRule, context: Record<string, any> = {}): ValidationResult {
        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank && !allowed) {
            return ValidationResult.failure(rule.errorMessage || "请选择一个选项", rule.errorStyle, { ruleId: rule.id });
        }

        if (!Array.isArray(rule.source)) {
            return ValidationResult.success();
        }

        const options = rule.source;
        const isValid = options.some((option) => String(option) === String(value));

        return isValid
            ? ValidationResult.success()
            : ValidationResult.failure(rule.errorMessage || `"${value}" 不在允许的选项列表中`, rule.errorStyle, {
                  value,
                  ruleId: rule.id,
              });
    }

    async resolveDynamicSource(sourceRef: string, context: Record<string, any>): Promise<string[]> {
        if (!this.#sourceResolver) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ListValidator] ListSourceResolver 未设置，动态区域引用不可用，返回空数组");
            return [];
        }

        try {
            return await this.#sourceResolver.resolve(sourceRef, {
                currentSheet: context.sheet || undefined,
            });
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[ListValidator] 动态数据源解析失败:", error);
            return [];
        }
    }

    setSourceResolver(resolver: ListSourceResolver): void {
        this.#sourceResolver = resolver;
    }

    get sourceResolver(): ListSourceResolver | null {
        return this.#sourceResolver;
    }

    async getOptions(rule: ValidationRule, context: Record<string, any> = {}): Promise<string[]> {
        if (Array.isArray(rule.source)) {
            return rule.source;
        }

        if (typeof rule.source === "string") {
            return await this.resolveDynamicSource(rule.source, context);
        }

        return [];
    }
}
