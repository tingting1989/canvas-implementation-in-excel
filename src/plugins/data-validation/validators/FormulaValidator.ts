import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";
import type { ValidationRule } from "../ValidationRule.js";
import { ShadowEvaluator } from "../ShadowEvaluator.js";
import { ComplexityAnalyzer } from "../ComplexityAnalyzer.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

interface FormulaValidatorConfig {
    maxComplexity?: number;
    timeout?: number;
    enableShadowEval?: boolean;
}

interface FormulaContext {
    row?: number;
    col?: number;
    sheet?: string;
    [key: string]: any;
}

/**
 * 公式验证器
 *
 * 支持自定义公式验证逻辑，通过公式引擎执行公式并
 * 根据返回值（true/false）判断验证结果。
 *
 * 安全策略：
 * - 低复杂度公式：直接通过公式引擎求值
 * - 高复杂度公式：通过 ShadowEvaluator 在隔离沙箱中求值
 * - 超复杂度公式：直接拒绝并返回失败结果
 */
export class FormulaValidator extends BaseValidator {
    static get TYPE(): string {
        return "formula";
    }

    #formulaEngine: any;
    #shadowEvaluator: ShadowEvaluator | null;
    #complexityAnalyzer: ComplexityAnalyzer;
    #maxComplexity: number;
    #timeout: number;
    #enableShadowEval: boolean;

    constructor(formulaEngine: any = null, config: FormulaValidatorConfig = {}) {
        super();
        this.#formulaEngine = formulaEngine;
        this.#shadowEvaluator = config.enableShadowEval !== false ? new ShadowEvaluator() : null;
        this.#complexityAnalyzer = new ComplexityAnalyzer();
        this.#maxComplexity = config.maxComplexity ?? 100;
        this.#timeout = config.timeout ?? 5000;
        this.#enableShadowEval = config.enableShadowEval !== false;
    }

    async validate(value: any, rule: ValidationRule, context: FormulaContext = {}): Promise<ValidationResult> {
        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank) {
            return allowed
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id });
        }

        if (!rule.formula) {
            return ValidationResult.failure("公式验证需要指定 formula", "warning", { ruleId: rule.id });
        }

        try {
            const complexity = this.#complexityAnalyzer.analyze(rule.formula);

            if (complexity.score > this.#maxComplexity) {
                errorHandler.warn(
                    ERROR_CODE.VALIDATION_ERROR,
                    `[FormulaValidator] 公式复杂度(${complexity.score})超过阈值(${this.#maxComplexity})，拒绝执行`,
                );
                return ValidationResult.failure(rule.errorMessage || "公式过于复杂，无法安全执行", "warning", {
                    ruleId: rule.id,
                    metadata: { complexity: complexity.score, maxComplexity: this.#maxComplexity },
                });
            }

            let result: boolean;

            if (complexity.score > 50 && this.#shadowEvaluator) {
                result = await this.#shadowEvaluator.evaluate(rule.formula, {
                    value,
                    row: context.row,
                    col: context.col,
                    sheet: context.sheet,
                });
            } else if (this.#formulaEngine) {
                result = await this.evaluateWithEngine(rule.formula, value, context);
            } else {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] 无公式引擎可用，尝试简单求值");
                result = this.simpleEvaluate(rule.formula, value);
            }

            return result
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || "公式验证失败", rule.errorStyle, {
                      value,
                      ruleId: rule.id,
                      metadata: { formula: rule.formula, complexity: complexity.score },
                  });
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] 公式执行失败:", error);
            return ValidationResult.failure(`公式执行错误: ${error.message}`, "warning", {
                value,
                ruleId: rule.id,
                metadata: { formula: rule.formula, error: error.message },
            });
        }
    }

    async evaluateWithEngine(formula: string, value: any, context: FormulaContext): Promise<boolean> {
        if (!this.#formulaEngine) {
            throw new Error("公式引擎未初始化");
        }

        const wrappedFormula = formula.startsWith("=") ? formula : `=${formula}`;

        const result = await this.#formulaEngine.evaluate(wrappedFormula, {
            currentValue: value,
            row: context.row,
            col: context.col,
        });

        return this.coerceToBoolean(result);
    }

    simpleEvaluate(formula: string, value: any): boolean {
        try {
            const cleanedFormula = formula.replace(/^=/, "").replace(/\bvalue\b/g, "_value");
            const fn = new Function("_value", `"use strict"; return (${cleanedFormula});`);
            const result = fn(value);
            return this.coerceToBoolean(result);
        } catch (e: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] 简单求值失败:", e);
            return false;
        }
    }

    coerceToBoolean(result: any): boolean {
        if (typeof result === "boolean") return result;
        if (typeof result === "number") return result !== 0;
        if (typeof result === "string") {
            const lower = result.toLowerCase().trim();
            return lower === "true" || lower === "1" || lower === "yes";
        }
        return !!result;
    }

    get formulaEngine(): any {
        return this.#formulaEngine;
    }

    set formulaEngine(engine: any) {
        this.#formulaEngine = engine;
    }

    get maxComplexity(): number {
        return this.#maxComplexity;
    }
}
