import { BaseValidator } from './BaseValidator.js';
import { ValidationResult } from '../ValidationResult.js';

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
        return 'list';
    }

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
                : ValidationResult.failure(
                    rule.errorMessage || '请选择一个选项',
                    rule.errorStyle,
                    { ruleId: rule.id }
                  );
        }

        let options;

        if (Array.isArray(rule.source)) {
            options = rule.source;
        } else if (typeof rule.source === 'string') {
            options = await this.resolveDynamicSource(rule.source, context);
        } else {
            return ValidationResult.failure(
                '无效的下拉列表配置',
                'warning',
                { ruleId: rule.id }
            );
        }

        if (!options || options.length === 0) {
            return ValidationResult.failure(
                '下拉列表为空',
                'warning',
                { ruleId: rule.id }
            );
        }

        const isValid = options.some(option => String(option) === String(value));

        return isValid
            ? ValidationResult.success()
            : ValidationResult.failure(
                rule.errorMessage || `"${value}" 不在允许的选项列表中`,
                rule.errorStyle,
                { value, ruleId: rule.id, metadata: { availableOptions: options } }
              );
    }

    /**
     * 解析动态数据源（Phase 2 实现）
     * @private
     * @param {string} sourceRef - 区域引用（如 '=Sheet1!$A$1:$A$10'）
     * @param {Object} context - 上下文
     * @returns {Promise<string[]>}
     */
    async resolveDynamicSource(sourceRef, context) {
        // TODO Phase 2: 实现动态区域引用解析
        console.warn('[ListValidator] 动态区域引用尚未实现，返回空数组');
        return [];
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

        if (typeof rule.source === 'string') {
            return await this.resolveDynamicSource(rule.source, context);
        }

        return [];
    }
}