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
        const formula = rule.formula;

        if (!formula || typeof formula !== "string") {
            return ValidationResult.failure("公式验证规则缺少 formula 字段", "stop", { value });
        }

        if (formula.length > this.#config.maxFormulaLength) {
            return ValidationResult.failure(`公式长度超过限制 (${formula.length} > ${this.#config.maxFormulaLength})`, "stop", { value });
        }

        const blankCheck = this.checkBlank(value, rule);
        if (blankCheck.isBlank && blankCheck.allowed) {
            return ValidationResult.success();
        }

        try {
            if (this.#config.enableComplexityAnalysis) {
                const analysis = this.#complexityAnalyzer.analyze(formula);

                if (analysis.canUseSyncFastPath) {
                    const result = this.#evaluateSync(formula, value, rule, context);
                    if (result) return result;
                }

                if (this.#config.enableShadowEvaluation) {
                    return await this.#evaluateInShadow(formula, value, rule, context);
                }

                return await this.#evaluateDirect(formula, value, rule, context);
            }

            return await this.#evaluateDirect(formula, value, rule, context);
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, `[FormulaValidator] 公式求值失败: "${formula}"`, error);
            return ValidationResult.failure(`公式求值异常: ${error.message}`, "warning", { value });
        }
    }

    validateSync(value: any, rule: ValidationRule, context: Record<string, any> = {}): ValidationResult {
        const formula = rule.formula;

        if (!formula || typeof formula !== "string") {
            return ValidationResult.failure("公式验证规则缺少 formula 字段", "stop", { value });
        }

        const blankCheck = this.checkBlank(value, rule);
        if (blankCheck.isBlank && blankCheck.allowed) {
            return ValidationResult.success();
        }

        try {
            if (this.#config.enableComplexityAnalysis) {
                const analysis = this.#complexityAnalyzer.analyze(formula);
                if (!analysis.canUseSyncFastPath) {
                    return ValidationResult.deferred("公式复杂度较高，需要异步验证", {
                        needsAsyncValidation: true,
                        complexity: analysis.complexity,
                        estimatedTime: analysis.estimatedTime,
                        reasons: analysis.reasons,
                    });
                }
            }

            const result = this.#evaluateSync(formula, value, rule, context);
            if (result) return result;

            return ValidationResult.deferred("同步求值未完成，需要异步验证", {
                needsAsyncValidation: true,
            });
        } catch (error: any) {
            return ValidationResult.failure(`公式求值异常: ${error.message}`, "warning", { value });
        }
    }

    #evaluateSync(formula: string, value: any, rule: ValidationRule, context: Record<string, any>): ValidationResult | null {
        if (!this.#formulaEngine || typeof this.#formulaEngine.evaluateFormula !== "function") {
            return null;
        }

        try {
            const evalContext = {
                currentValue: value,
                row: context.row ?? 0,
                col: context.col ?? 0,
                sheet: context.sheet || "Sheet1",
            };

            const result = this.#formulaEngine.evaluateFormula(formula, evalContext);
            const isValid = result === true;

            if (this.#config.enableCache) {
                const cache = getValidationCache();
                if (cache) {
                    const cacheKey = `${context.row || 0},${context.col || 0}`;
                    cache
                        .set(
                            cacheKey,
                            {
                                valid: isValid,
                                value,
                                ruleId: rule.id,
                                formula,
                            },
                            {
                                source: "sync-fast-path",
                                sheet: context.sheet || "default",
                            },
                        )
                        .catch(() => {});
                }
            }

            if (isValid) {
                return ValidationResult.success();
            }

            if (result === false) {
                return ValidationResult.failure(rule.errorMessage || `公式验证失败: ${formula}`, rule.errorStyle || "stop", { value });
            }

            return null;
        } catch (error: any) {
            return null;
        }
    }

    async #evaluateInShadow(formula: string, value: any, rule: ValidationRule, context: Record<string, any>): Promise<ValidationResult> {
        const shadowContext = {
            row: context.row ?? 0,
            col: context.col ?? 0,
            value,
            sheet: context.sheet || "Sheet1",
        };

        const evaluator = new ShadowEvaluator(this.#formulaEngine, shadowContext);

        try {
            const passed = await evaluator.evaluate(formula);

            if (passed) {
                return ValidationResult.success();
            }

            return ValidationResult.failure(rule.errorMessage || `公式验证失败: ${formula}`, rule.errorStyle || "stop", { value });
        } finally {
            evaluator.destroy();
        }
    }

    async #evaluateDirect(formula: string, value: any, rule: ValidationRule, context: Record<string, any>): Promise<ValidationResult> {
        if (!this.#formulaEngine || typeof this.#formulaEngine.evaluateFormula !== "function") {
            return ValidationResult.failure("公式引擎未初始化", "stop", { value });
        }

        const evalContext = {
            currentValue: value,
            row: context.row ?? 0,
            col: context.col ?? 0,
            sheet: context.sheet || "Sheet1",
        };

        const result = await this.#formulaEngine.evaluateFormula(formula, evalContext);
        const isValid = result === true;

        if (this.#config.enableCache) {
            const cache = getValidationCache();
            if (cache) {
                const cacheKey = `${context.row || 0},${context.col || 0}`;
                await cache.set(
                    cacheKey,
                    {
                        valid: isValid,
                        value,
                        ruleId: rule.id,
                        formula,
                    },
                    {
                        source: "async-pipeline",
                        sheet: context.sheet || "default",
                    },
                );
            }
        }

        if (isValid) {
            return ValidationResult.success();
        }

        if (result === false) {
            return ValidationResult.failure(rule.errorMessage || `公式验证失败: ${formula}`, rule.errorStyle || "stop", { value });
        }

        return ValidationResult.failure(`公式返回了非布尔值: ${JSON.stringify(result)}`, "warning", { value });
    }
}

export { DEFAULT_CONFIG };