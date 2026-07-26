import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "@/core/ErrorHandler.js";
import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";
import { ShadowEvaluator } from "../ShadowEvaluator.js";

/**
 * 自定义公式验证器（沙箱隔离版本）
 *
 * 核心设计原则（符合 v3.0 设计文档要求）：
 * - ✅ 不调用 setVirtualCell
 * - ✅ 不修改 DependencyGraph
 * - ✅ 不触发 AFTER_CALC 类钩子
 * - ✅ 不写入任何 Cache
 * - ✅ 求值结束后零副作用
 *
 * @extends BaseValidator
 *
 * @example
 * const validator = new FormulaValidator(formulaEngine);
 * const result = await validator.validate(50, {
 *     type: 'custom',
 *     formula: '=AND(A1>0, A1<100)'
 * }, { row: 0, col: 0 });
 */
export class FormulaValidator extends BaseValidator {
    static get TYPE() {
        return "custom";
    }

    /** @type {Object|null} FormulaEngine 实例 */
    #formulaEngine;

    /**
     * 构造公式验证器
     * @param {Object} formulaEngine - FormulaEngine 实例
     */
    constructor(formulaEngine) {
        super();
        this.#formulaEngine = formulaEngine;
    }

    /**
     * 验证公式结果
     * @param {*} value - 当前单元格值
     * @param {import('../ValidationRule.js').ValidationRule} rule - 规则
     * @param {Object} [context={}] - 上下文（必须包含 row, col）
     * @returns {Promise<ValidationResult>}
     */
    async validate(value, rule, context = {}) {
        if (!this.#formulaEngine) {
            return ValidationResult.failure("FormulaEngine 未初始化", "warning", { ruleId: rule.id });
        }

        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank) {
            return allowed
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id });
        }

        try {
            const result = await this.evaluateInSandbox(value, rule, context);

            return result
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || `公式 "${rule.formula}" 返回 FALSE`, rule.errorStyle, {
                      value,
                      ruleId: rule.id,
                      metadata: { formula: rule.formula },
                  });
        } catch (error) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] 公式求值失败:", error);
            return ValidationResult.failure(`公式验证错误: ${error.message}`, "warning", {
                value,
                ruleId: rule.id,
                metadata: { error: error.message },
            });
        }
    }

    /**
     * 同步验证（降级版 - 公式验证无法同步执行，默认通过）
     * 用于 BEFORE_SET_VALUE_AT 同步拦截场景
     */
    validateSync(value, rule, context = {}) {
        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank && !allowed) {
            return ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id });
        }
        return ValidationResult.success();
    }

    /**
     * 在隔离沙箱中执行公式求值（零副作用）
     *
     * 优先使用 FormulaEngine.evaluateForValidation 接口；
     * 若不可用，则创建 ShadowEvaluator 实例进行隔离求值；
     * 两者均不可用时抛出明确错误（不再使用有副作用的降级方案）。
     *
     * @private
     * @param {*} value - 当前值
     * @param {import('../ValidationRule.js').ValidationRule} rule - 规则
     * @param {Object} context - 上下文
     * @returns {Promise<boolean>}
     */
    async evaluateInSandbox(value, rule, context) {
        const validationContext = {
            row: context.row ?? 0,
            col: context.col ?? 0,
            value,
            sheet: context.sheet || "Sheet1",
        };

        if (this.#formulaEngine?.evaluateForValidation) {
            const result = await this.#formulaEngine.evaluateForValidation(rule.formula, validationContext);
            return !!result;
        }

        if (this.#formulaEngine) {
            const shadow = new ShadowEvaluator(this.#formulaEngine, validationContext);
            try {
                const result = await shadow.evaluate(rule.formula);
                return !!result;
            } finally {
                shadow.destroy();
            }
        }

        throw new Error("[FormulaValidator] FormulaEngine 未初始化，无法执行沙箱求值。请确保 FormulaEngine 实例已正确传入。");
    }
}
