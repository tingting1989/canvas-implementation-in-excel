import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "@/core/ErrorHandler.js";
import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";

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
     * 实现设计文档中的 evaluateForValidation 接口：
     * - 创建临时 AST（不进入主缓存）
     * - 创建"影子 Evaluator"（与主 Evaluator 完全隔离）
     * - 设置只读上下文（不修改任何全局状态）
     * - 执行求值（保证零副作用）
     * - 销毁影子实例（释放内存，防止泄漏）
     *
     * @private
     * @param {*} value - 当前值
     * @param {import('../ValidationRule.js').ValidationRule} rule - 规则
     * @param {Object} context - 上下文
     * @returns {Promise<boolean>}
     */
    async evaluateInSandbox(value, rule, context) {
        if (!this.#formulaEngine?.evaluateForValidation) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] FormulaEngine 未实现 evaluateForValidation 接口，使用降级方案");
            return this.fallbackEvaluation(value, rule, context);
        }

        const validationContext = {
            row: context.row ?? 0,
            col: context.col ?? 0,
            value,
            sheet: context.sheet || "Sheet1",
        };

        const result = await this.#formulaEngine.evaluateForValidation(rule.formula, validationContext);

        return !!result;
    }

    /**
     * 降级求值方案（当 FormulaEngine 不支持沙箱时使用）
     * ⚠️ 注意：此方法可能产生副作用，仅作为兼容性降级
     *
     * @private
     * @param {*} value - 当前值
     * @param {import('../ValidationRule.js').ValidationRule} rule - 规则
     * @param {Object} context - 上下文
     * @returns {boolean}
     */
    fallbackEvaluation(value, rule, context) {
        try {
            if (!this.#formulaEngine?.evaluateFormula) {
                throw new Error("FormulaEngine 缺少必要的求值方法");
            }

            const row = context.row ?? 0;
            const col = context.col ?? 0;

            const result = this.#formulaEngine.evaluateFormula(rule.formula, {
                currentCell: { row, col, value },
                sheet: context.sheet || "Sheet1",
                mode: "validation",
            });

            return !!result;
        } catch (error) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] 降级求值失败:", error);
            throw error;
        }
    }
}
