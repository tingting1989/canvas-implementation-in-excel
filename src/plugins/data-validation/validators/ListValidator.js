import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";
import { ListSourceResolver } from "../ListSourceResolver.js";
import {errorHandler} from "../../../core/ErrorHandler.js";
import {ERROR_CODE} from "../../../constants/errorCodes.js";

/**
 * 下拉列表验证器
 *
 * 用于验证值是否在预定义的选项列表中。
 * 支持两种 source 模式：
 * 1. 静态数组：['选项1', '选项2', '选项3']
 * 2. 动态区域引用：'=Sheet1!$A$1:$A$10'（Phase 2 实现）
 *
 * @extends BaseValidator
 *
 * @example
 * const validator = new ListValidator();
 * const result = await validator.validate('男', {
 *     type: 'list',
 *     source: ['男', '女', '其他']
 * });
 */
export class ListValidator extends BaseValidator {
    static get TYPE() {
        return "list";
    }

    /** @type {ListSourceResolver|null} 动态数据源解析器 */
    #sourceResolver = null;

    /**
     * 验证列表选项
     * @param {*} value - 待验证的值
     * @param {import('../ValidationRule.js').ValidationRule} rule - 验证规则
     * @param {Object} [context={}] - 验证上下文
     * @returns {Promise<ValidationResult>}
     */
    async validate(value, rule, context = {}) {
        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank) {
            return allowed
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || "请选择一个选项", rule.errorStyle, { ruleId: rule.id });
        }

        let options;

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

    /**
     * 同步验证（降级版 - 动态源无法同步解析）
     * 用于 BEFORE_SET_VALUE_AT 同步拦截场景
     */
    validateSync(value, rule, context = {}) {
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

    /**
     * 解析动态数据源
     *
     * 委托给 ListSourceResolver 进行解析。
     * 若未设置 resolver，则返回空数组并输出警告。
     *
     * @private
     * @param {string} sourceRef - 区域引用（如 '=Sheet1!$A$1:$A$10'）
     * @param {Object} context - 上下文
     * @returns {Promise<string[]>}
     */
    async resolveDynamicSource(sourceRef, context) {
        if (!this.#sourceResolver) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ListValidator] ListSourceResolver 未设置，动态区域引用不可用，返回空数组");
            return [];
        }

        try {
            return await this.#sourceResolver.resolve(sourceRef, {
                currentSheet: context.sheet || undefined,
            });
        } catch (error) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[ListValidator] 动态数据源解析失败:", error);
            return [];
        }
    }

    /**
     * 设置动态数据源解析器
     *
     * @param {ListSourceResolver} resolver - 解析器实例
     */
    setSourceResolver(resolver) {
        this.#sourceResolver = resolver;
    }

    /**
     * 获取当前数据源解析器
     *
     * @returns {ListSourceResolver|null}
     */
    get sourceResolver() {
        return this.#sourceResolver;
    }

    /**
     * 获取下拉选项列表
     * @param {import('../ValidationRule.js').ValidationRule} rule - 规则
     * @param {Object} [context={}] - 上下文
     * @returns {Promise<string[]>}
     */
    async getOptions(rule, context = {}) {
        if (Array.isArray(rule.source)) {
            return rule.source;
        }

        if (typeof rule.source === "string") {
            return await this.resolveDynamicSource(rule.source, context);
        }

        return [];
    }
}
