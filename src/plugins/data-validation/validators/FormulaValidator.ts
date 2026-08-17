import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";
import { ValidationRule } from "../ValidationRule.js";
import { ComplexityAnalyzer, complexityAnalyzer, COMPLEXITY_THRESHOLD } from "../ComplexityAnalyzer.js";
import { ShadowEvaluator } from "../ShadowEvaluator.js";
import { getValidationCache } from "../ValidationCache.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

const DEFAULT_CONFIG = Object.freeze({
    enableComplexityAnalysis: true,
    enableShadowEvaluation: true,
    enableCache: true,
    syncThreshold: COMPLEXITY_THRESHOLD.SYNC_TIME_LIMIT_MS,
    syncTimeoutMs: COMPLEXITY_THRESHOLD.SYNC_TIME_LIMIT_MS,
    maxFormulaLength: 1024,
});

export class FormulaValidator extends BaseValidator {
    static get TYPE(): string {
        return "formula";
    }

    #formulaEngine: any = null;
    #complexityAnalyzer: ComplexityAnalyzer;
    #config: Record<string, any>;

    constructor(formulaEngine: any, config: Record<string, any> = {}) {
        super();
        this.#formulaEngine = formulaEngine;
        this.#complexityAnalyzer = complexityAnalyzer;
        this.#config = { ...DEFAULT_CONFIG, ...config };
    }

    async validate(value: any, rule: ValidationRule, context: Record<string, any> = {}): Promise<ValidationResult> {
        const startTime = performance.now();
        const formula = rule.formula;

        if (!formula || typeof formula !== "string") {
            return ValidationResult.failure("公式验证规则缺少 formula 字段", "stop", { value });
        }

        if (formula.length > this.#config.maxFormulaLength) {
            return ValidationResult.failure(`公式长度超过限制 (${formula.length} > ${this.#config.maxFormulaLength})`, "stop", { value });
        }

        const blankCheck = this.checkBlank(value, rule);
        if (blankCheck.isBlank) {
            return blankCheck.allowed
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id });
        }

        if (!this.#formulaEngine) {
            errorHandler.throw(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] FormulaEngine 未初始化，无法进行异步验证");
        }

        const resolvedFormula = this.resolveFormulaPlaceholders(formula, context);
        const evaluationContext = this.#buildEvaluationContext(value, context);

        try {
            let result: unknown;
            try {
                if (this.#formulaEngine.evaluateForValidation) {
                    result = await this.#formulaEngine.evaluateForValidation(resolvedFormula, evaluationContext);
                } else if (this.#formulaEngine.evaluateFormula) {
                    result = await this.#formulaEngine.evaluateFormula(resolvedFormula, evaluationContext);
                } else {
                    const shadow = new ShadowEvaluator(this.#formulaEngine, evaluationContext);
                    try {
                        result = await shadow.evaluate(resolvedFormula);
                    } finally {
                        shadow.destroy();
                    }
                }
            } catch (evalError: any) {
                errorHandler.error(ERROR_CODE.VALIDATION_ERROR, `[FormulaValidator] FormulaEngine 求值失败: ${resolvedFormula}`, {
                    error: evalError,
                    formula: resolvedFormula,
                    context,
                });

                return ValidationResult.failure(`公式验证错误: ${evalError.message}`, rule.errorStyle === "stop" ? "warning" : rule.errorStyle, {
                    value,
                    ruleId: rule.id,
                    metadata: {
                        error: evalError.message,
                        formula: resolvedFormula,
                        executionPath: "async-pipeline",
                        executionTime: performance.now() - startTime,
                    },
                });
            }

            const isValid = !!result;
            const cacheKey = `${context.row || 0},${context.col || 0}`;

            if (this.#config.enableCache) {
                const cache = getValidationCache();
                if (cache) {
                    await cache.set(
                        cacheKey,
                        {
                            valid: isValid,
                            value,
                            ruleId: rule.id,
                            formula: resolvedFormula,
                        },
                        {
                            source: "async-pipeline",
                            sheet: context.sheet || "default",
                        },
                    );
                }
            }

            const validationResult = isValid
                ? ValidationResult.success({
                      pendingValidation: false,
                      executionPath: "async-pipeline",
                  })
                : ValidationResult.failure(rule.errorMessage || `公式 "${rule.formula}" 返回 FALSE`, rule.errorStyle, {
                      value,
                      ruleId: rule.id,
                      metadata: {
                          formula: resolvedFormula,
                          executionPath: "async-pipeline",
                          executionTime: performance.now() - startTime,
                      },
                  });

            errorHandler.debug(
                ERROR_CODE.VALIDATION_DEBUG_LOG,
                `[FormulaValidator] ✅ 异步验证完成: valid=${isValid}, time=${(performance.now() - startTime).toFixed(1)}ms`,
            );

            return validationResult;
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] 异步验证过程异常", { error, value, rule, context });

            return ValidationResult.failure(`公式验证系统错误: ${error.message}`, "warning", {
                value,
                ruleId: rule?.id,
                metadata: {
                    error: error.message,
                    executionPath: "async-pipeline",
                    executionTime: performance.now() - startTime,
                },
            });
        }
    }

    validateSync(value: any, rule: ValidationRule, context: Record<string, any> = {}): ValidationResult {
        const startTime = performance.now();
        const formula = rule.formula;

        if (!formula || typeof formula !== "string") {
            return ValidationResult.failure("公式验证规则缺少 formula 字段", "stop", { value });
        }

        const blankCheck = this.checkBlank(value, rule);
        if (blankCheck.isBlank) {
            return blankCheck.allowed
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id });
        }

        const resolvedFormula = this.resolveFormulaPlaceholders(formula, context);

        try {
            const analysis = this.#complexityAnalyzer.analyze(resolvedFormula);

            if (analysis.canUseSyncFastPath && analysis.estimatedTime < this.#config.syncThreshold) {


                const evaluationContext = this.#buildEvaluationContext(value, context);

                let result: unknown;
                if (this.#formulaEngine && typeof this.#formulaEngine.evaluateForValidationSync === "function") {
                    result = this.#formulaEngine.evaluateForValidationSync(resolvedFormula, evaluationContext);
                } else if (this.#formulaEngine && typeof this.#formulaEngine.evaluateFormula === "function") {
                    result = this.#formulaEngine.evaluateFormula(resolvedFormula, evaluationContext);
                } else {
                    result = this.evaluateSimpleFormulaSync(resolvedFormula, value, context);
                }

                const isValid = !!result;

                if (this.#config.enableCache) {
                    const cacheKey = `${context.row || 0},${context.col || 0}`;
                    const cache = getValidationCache();
                    if (cache) {
                        cache
                            .set(
                                cacheKey,
                                {
                                    valid: isValid,
                                    value,
                                    ruleId: rule.id,
                                    formula: resolvedFormula,
                                },
                                {
                                    source: "sync-fast-path",
                                    sheet: context.sheet || "default",
                                },
                            )
                            .catch(() => {});
                    }
                }

                return isValid
                    ? ValidationResult.success({ executionPath: "sync-fast-path" })
                    : ValidationResult.failure(rule.errorMessage || `公式 "${rule.formula}" 返回 FALSE`, rule.errorStyle, {
                          value,
                          ruleId: rule.id,
                          metadata: {
                              formula: resolvedFormula,
                              executionPath: "sync-fast-path",
                              executionTime: performance.now() - startTime,
                          },
                      });
            }

            return ValidationResult.deferred("公式复杂度较高，需要异步验证", {
                needsAsyncValidation: true,
                complexity: analysis.complexity,
                estimatedTime: analysis.estimatedTime,
                reasons: analysis.reasons,
            });
        } catch (error: any) {
            return ValidationResult.failure(`公式求值异常: ${error.message}`, "warning", { value });
        }
    }

    resolveFormulaPlaceholders(formula: string, context: Record<string, any>): string {
        if (!formula || typeof formula !== "string") {
            return formula;
        }

        return formula.replace(/\{row\}/g, String((context.row ?? 0) + 1)).replace(/\{col\}/g, String(context.col ?? 0));
    }

    evaluateSimpleFormulaSync(formula: string, value: any, context: Record<string, any>): boolean {
        const raw = formula.startsWith("=") ? formula.substring(1) : formula;
        const cellRef = `${context.row ?? 0},${context.col ?? 0}`;

        try {
            const comparisonMatch = raw.match(/^([A-Z]+\$?\d+)(>=|<=|<>|>|<|=)(.+)$/i);
            if (comparisonMatch) {
                const [, , operator, rightStr] = comparisonMatch;
                const rightValue = parseFloat(rightStr);
                if (isNaN(rightValue)) return false;

                const leftValue = typeof value === "number" ? value : parseFloat(String(value));
                if (isNaN(leftValue)) return false;

                switch (operator) {
                    case ">":
                        return leftValue > rightValue;
                    case "<":
                        return leftValue < rightValue;
                    case ">=":
                        return leftValue >= rightValue;
                    case "<=":
                        return leftValue <= rightValue;
                    case "=":
                        return leftValue === rightValue;
                    case "<>":
                        return leftValue !== rightValue;
                    default:
                        return false;
                }
            }

            const currentValueMatch = raw.match(/^(>=|<=|<>|>|<|=)(.+)$/);
            if (currentValueMatch) {
                const [, operator, rightStr] = currentValueMatch;
                const rightValue = parseFloat(rightStr);
                if (isNaN(rightValue)) return false;

                const leftValue = typeof value === "number" ? value : parseFloat(String(value));
                if (isNaN(leftValue)) return false;

                switch (operator) {
                    case ">":
                        return leftValue > rightValue;
                    case "<":
                        return leftValue < rightValue;
                    case ">=":
                        return leftValue >= rightValue;
                    case "<=":
                        return leftValue <= rightValue;
                    case "=":
                        return leftValue === rightValue;
                    case "<>":
                        return leftValue !== rightValue;
                    default:
                        return false;
                }
            }

            return false;
        } catch (error: any) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[FormulaValidator] 简单公式解析失败: ${formula}`, { error, cellRef });
            return false;
        }
    }

    #buildEvaluationContext(value: any, context: Record<string, any> = {}): Record<string, any> {
        return {
            cellKey: `${context.sheet || "default"}!${context.row || 0},${context.col || 0}`,
            value,
            row: context.row ?? 0,
            col: context.col ?? 0,
            sheet: context.sheet || null,
            workbook: context.workbook || null,
            options: {
                allowCrossSheet: true,
                blockVolatile: true,
                timeout: this.#config.asyncTimeout || 500,
                callStack: new Set(),
                collectMetrics: false,
            },
        };
    }
}

export { DEFAULT_CONFIG };
