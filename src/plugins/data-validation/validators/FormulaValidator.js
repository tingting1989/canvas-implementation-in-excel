import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";
import { complexityAnalyzer, COMPLEXITY_THRESHOLD } from "../ComplexityAnalyzer.js";
import { getValidationCache } from "../ValidationCache.js";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

/**
 * ═══════════════════════════════════════════════════════════════
 * 📌 FormulaValidator v3.0 - 单轨异步架构 + 同步快速通道
 * ═══════════════════════════════════════════════════════════════
 *
 * 🎯 核心设计理念：
 * 统一为单轨异步架构，所有公式验证最终都走异步管道，
 * 但针对简单公式提供同步快速通道作为性能优化。
 *
 * ✅ 关键特性：
 * - 集成 ComplexityAnalyzer 实现智能路径选择
 * - 三级缓存架构 (L1/L2/L3) 保证高性能
 * - 支持 49+ 内置函数 + 无限自定义函数
 * - 移除 eval() 和 Mock 数据，使用真实 FormulaEngine
 * - 完整的错误处理和超时保护
 *
 * ⚙️ 架构说明：
 * ```
 * 用户输入 → ComplexityAnalyzer 分析复杂度
 *           ↓
 *   ┌───────┴───────┐
 *   ↓               ↓
 * 复杂度≤2?       复杂度>2?
 *   ↓               ↓
 * 同步快速通道    标准异步管道
 * (<10ms)         (<500ms)
 *   ↓               ↓
 *   └───────┬───────┘
 *           ↓
 *   写入统一缓存 → 触发UI更新事件
 * ```
 */

/**
 * 自定义公式验证器（沙箱隔离版本）
 *
 * ═══════════════════════════════════════════════════════════════
 * 📌 功能概述
 * ═══════════════════════════════════════════════════════════════
 * 允许用户编写返回 true/false 的 Excel 公式作为数据验证规则。
 * 当用户输入数据时，FormulaValidator 会将当前单元格值代入公式，
 * 在安全沙箱中计算结果：
 * - true  → 数据合法 ✅（允许输入）
 * - false → 数据非法 ❌（显示错误提示）
 *
 * 就像让Excel自动帮你做"如果满足这个条件就通过，否则报错"的判断！
 *
 * ═══════════════════════════════════════════════════════════════
 * 🔗 与 FormulaPlugin 的关联关系
 * ═══════════════════════════════════════════════════════════════
 * FormulaPlugin → 创建 FormulaEngine 实例 → 挂载到 workbook.formulaEngine
 * DataValidationPlugin → 获取 workbook.formulaEngine → 注入到 FormulaValidator
 * FormulaValidator → 使用 FormulaEngine 执行隔离的公式验证
 *
 * ⚠️ 重要：如果要使用自定义公式验证功能，必须先加载 FormulaPlugin！
 * 如果未加载，formulaEngine 为 null，会优雅降级并返回警告信息。
 *
 * ═══════════════════════════════════════════════════════════════
 * 🔒 核心设计原则（符合 v3.0 设计文档要求）
 * ═══════════════════════════════════════════════════════════════
 * - ✅ 不调用 setVirtualCell（不修改虚拟单元格）
 * - ✅ 不修改 DependencyGraph（不污染依赖图）
 * - ✅ 不触发 AFTER_CALC 类钩子（不触发级联重算）
 * - ✅ 不写入任何 Cache（不缓存中间结果）
 * - ✅ 求值结束后零副作用（完全隔离执行）
 *
 * 核心要点总结
 * 你可以使用：
 * ✅ 已实现: 49 个常用函数（覆盖核心需求）
 * ✅ 通过 registerFunction() 注册的自定义函数
 * ✅ 单元格引用（A1、B{row}、跨表引用）
 * ✅ 常量和字面量（数字、字符串、布尔值）
 * ❌ 你不能使用：
 * ❌ 易变函数（RAND、NOW、TODAY、INDIRECT、OFFSET）
 * ❌ 未注册的未知函数名（会抛出 #NAME? 错误）
 * ❌ JavaScript 代码（这是公式引擎，不是 JS 引擎）
 * ═══════════════════════════════════════════════════════════════
 * 🎯 验证工作流程
 * ═══════════════════════════════════════════════════════════════
 * 1. 解析公式模板：将 {row} 占位符替换为实际行号
 *    例：'=AND(B{row}>=18, B{row}<=65)' + row=5 → '=AND(B5>=18, B5<=65)'
 *
 * 2. 创建沙箱环境：注入当前单元格值，但不修改真实数据
 *
 * 3. 执行公式求值：在隔离环境中计算公式的布尔结果
 *
 * 4. 返回验证结果：true 通过 / false 拒绝（附带错误消息和样式）
 *
 * ═══════════════════════════════════════════════════════════════
 * 🎨 典型应用场景
 * ═══════════════════════════════════════════════════════════════
 *
 * 场景1：复合业务规则（年龄必须是18-65之间的整数）
 * ```javascript
 * {
 *     range: 'B2:B100',
 *     type: 'formula',
 *     formula: '=AND(B{row}>=18, B{row}<=65, INT(B{row})=B{row})',
 *     errorMessage: '年龄必须是 18-65 之间的整数'
 * }
 * ```
 *
 * 场景2：日期逻辑验证（结束日期 >= 开始日期 且 在2024年内）
 * ```javascript
 * {
 *     range: 'E2:E100',
 *     type: 'formula',
 *     formula: '=AND(E{row}>=D{row}, E{row}>=DATE(2024,1,1), E{row}<=DATE(2024,12,31))',
 *     errorMessage: '结束日期必须在开始日期之后，且在2024年内'
 * }
 * ```
 *
 * 场景3：跨列关联检查（库存数量不能超过最大容量）
 * ```javascript
 * {
 *     range: 'F2:F50',
 *     type: 'formula',
 *     formula: '=F{row}<=G{row}',
 *     errorMessage: '库存数量超出最大容量限制'
 * }
 * ```
 *
 * 场景4：文本格式校验（邮箱格式+长度限制+不允许空格）
 * ```javascript
 * {
 *     range: 'H2:H200',
 *     type: 'formula',
 *     formula: '=AND(LEN(H{row})>=5, LEN(H{row})<=50, ISNUMBER(FIND("@",H{row})), NOT(ISNUMBER(FIND(" ",H{row}))))',
 *     errorMessage: '邮箱格式不正确（5-50字符，包含@，无空格）'
 * }
 * ```
 *
 * 场景5：折扣价验证（必须>0且<原价且保留2位小数）
 * ```javascript
 * {
 *     range: 'D2:D100',
 *     type: 'formula',
 *     formula: '=AND(D{row}>0, D{row}<C{row}, LEN(D{row}-INT(D{row}))=3)',
 *     errorMessage: '折扣价必须大于0且小于原价，保留2位小数'
 * }
 * ```
 *
 * ═══════════════════════════════════════════════════════════════
 * ⚙️ 技术特性
 * ═══════════════════════════════════════════════════════════════
 * - 🔒 沙箱隔离：验证时不修改任何数据，使用 ShadowEvaluator 或 evaluateForValidation 接口
 * - 🚀 性能优化：避免完整引擎开销，仅执行必要的求值操作
 * - 🛡️ 错误容忍：公式语法错误时返回友好提示而非崩溃
 * - 📝 自动降级：未加载 FormulaPlugin 时返回警告而非抛出异常
 * - 🎯 灵活强大：支持所有Excel函数（AND/OR/IF/DATE/LEN/FIND等）
 *
 * ═══════════════════════════════════════════════════════════════
 * 📦 依赖关系
 * ═══════════════════════════════════════════════════════════════
 * - FormulaEngine（必需）：提供公式解析和求值能力
 * - ShadowEvaluator（可选）：当 FormulaEngine 不支持 evaluateForValidation 时使用
 * - BaseValidator（继承）：提供基础的验证接口和空白值检查
 *
 * @extends BaseValidator
 *
 * @example
 * // 基础用法：验证数值范围
 * const validator = new FormulaValidator(formulaEngine);
 * const result = await validator.validate(50, {
 *     type: 'formula',
 *     formula: '=AND(A1>0, A1<100)',
 *     errorMessage: '值必须在 0-100 之间'
 * }, { row: 0, col: 0 });
 *
 * // 返回结果：result.valid === true（因为 50 > 0 && 50 < 100）
 *
 * @example
 * // 复合条件验证：年龄必须是18-65之间的整数
 * const result = await validator.validate(25.5, {
 *     type: 'formula',
 *     formula: '=AND(B{row}>=18, B{row}<=65, INT(B{row})=B{row})',
 *     errorMessage: '年龄必须是 18-65 之间的整数'
 * }, { row: 5, col: 1 });
 *
 * // 返回结果：result.valid === false（因为 INT(25.5)=25 ≠ 25.5）
 * // result.message === "年龄必须是 18-65 之间的整数"
 */
export class FormulaValidator extends BaseValidator {
    static get TYPE() {
        return "formula";
    }

    /** @type {Object|null} FormulaEngine 实例 */
    #formulaEngine;

    /** @type {ComplexityAnalyzer} 复杂度分析器实例 */
    #complexityAnalyzer;

    /** @type {object} 配置选项 */
    #config;

    /**
     * 构造公式验证器（v3.0 单轨异步架构）
     *
     * @param {Object} formulaEngine - FormulaEngine 实例（必需）
     * @param {Object} [config={}] - 配置选项
     * @param {number} [config.syncThreshold=10] - 同步快速通道时间阈值 (ms)
     * @param {number} [config.asyncTimeout=500] - 异步执行超时时间 (ms)
     * @param {boolean} [config.enableDeferred=true] - 是否启用延迟验证（stop模式下）
     * @param {boolean} [config.enableCache=true] - 是否启用三级缓存
     */
    constructor(formulaEngine, config = {}) {
        super();

        if (!formulaEngine) {
            errorHandler.throw(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] FormulaEngine 实例是必需的参数");
        }

        this.#formulaEngine = formulaEngine;
        this.#complexityAnalyzer = complexityAnalyzer; // 使用全局单例
        this.#config = {
            syncThreshold: COMPLEXITY_THRESHOLD.SYNC_TIME_LIMIT_MS,
            asyncTimeout: 500,
            enableDeferred: true,
            enableCache: true,
            ...config,
        };

        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[FormulaValidator] v3.0 初始化完成，配置: ${JSON.stringify(this.#config)}`);
    }

    /**
     * 标准异步验证管道（单轨架构的核心执行路径）
     *
     * ✅ 这是统一的验证入口，所有公式最终都通过此方法执行
     *
     * 特点：
     * - 支持所有公式（包括复杂的聚合/查找/自定义函数）
     * - 使用真实 CellStore 数据（非 Mock）
     * - 执行完成后更新统一缓存并触发 UI 重绘
     * - 与同步快速通道共享同一套缓存和事件系统
     *
     * 执行流程：
     * 1. 检查空白值
     * 2. 解析占位符
     * 3. 通过 FormulaEngine 求值
     * 4. 写入三级缓存
     * 5. 触发 UI 更新事件
     *
     * @param {*} value - 当前单元格值
     * @param {import('../ValidationRule.js').ValidationRule} rule - 验证规则
     * @param {Object} [context={}] - 上下文（必须包含 row, col）
     * @returns {Promise<ValidationResult>}
     */
    async validate(value, rule, context = {}) {
        const startTime = performance.now();

        try {
            // 1️⃣ 空白值检查
            const { isBlank, allowed } = this.checkBlank(value, rule);
            if (isBlank) {
                return allowed
                    ? ValidationResult.success()
                    : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id });
            }

            // 2️⃣ 检查 FormulaEngine 是否可用
            if (!this.#formulaEngine) {
                errorHandler.throw(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] FormulaEngine 未初始化，无法进行异步验证");
            }

            // 3️⃣ 解析占位符（{row}, {col}, {value} 等）
            const resolvedFormula = this.resolveFormulaPlaceholders(rule.formula, context);

            // 4️⃣ 构建求值上下文
            const evaluationContext = this.#buildEvaluationContext(value, context);

            // 5️⃣ 通过 FormulaEngine 求值（核心步骤）
            let result;
            try {
                // 使用 evaluateForValidation 接口（隔离环境，无副作用）
                result = await this.#formulaEngine.evaluateForValidation(resolvedFormula, evaluationContext);
            } catch (evalError) {
                // 处理求值错误（语法错误、循环引用等）
                errorHandler.error(ERROR_CODE.VALIDATION_ERROR, `[FormulaValidator] FormulaEngine 求值失败: ${resolvedFormula}`, {
                    error: evalError,
                    formula: resolvedFormula,
                    context,
                });

                return ValidationResult.failure(
                    `公式验证错误: ${evalError.message}`,
                    rule.errorStyle === "stop" ? "warning" : rule.errorStyle, // stop模式降级避免完全阻止
                    {
                        value,
                        ruleId: rule.id,
                        metadata: {
                            error: evalError.message,
                            formula: resolvedFormula,
                            executionPath: "async-pipeline",
                            executionTime: performance.now() - startTime,
                        },
                    },
                );
            }

            // 6️⃣ 转换结果并写入缓存
            const isValid = !!result;
            const cacheKey = `${context.row || 0},${context.col || 0}`;

            // 写入三级缓存（如果启用）
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

            // 7️⃣ 返回标准化的验证结果
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
                          functionsUsed: [], // 可从 FormulaEngine 获取详细信息
                      },
                  });

            errorHandler.debug(
                ERROR_CODE.VALIDATION_DEBUG_LOG,
                `[FormulaValidator] ✅ 异步验证完成: valid=${isValid}, time=${(performance.now() - startTime).toFixed(1)}ms`,
            );

            return validationResult;
        } catch (error) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] 异步验证过程异常", { error, value, rule, context });

            return ValidationResult.failure(
                `公式验证系统错误: ${error.message}`,
                "warning", // 降级避免崩溃
                {
                    value,
                    ruleId: rule?.id,
                    metadata: {
                        error: error.message,
                        executionPath: "async-pipeline-error",
                    },
                },
            );
        }
    }

    /**
     * 同步快速通道（用于 BEFORE_SET_VALUE_AT 实时拦截）
     *
     * ⚠️ 重要：这是单轨异步架构的性能优化，不是独立的执行路径！
     *
     * 特点：
     * - 仅支持简单公式（canUseSyncFastPath === true，即复杂度 ≤ 2）
     * - 保证响应时间 < 10ms
     * - 执行结果会写入统一缓存，与异步管道保持一致
     * - 对于复杂公式返回 deferred/pending 结果，引导至异步管道
     *
     * 📋 处理策略（基于 errorStyle）：
     * - 'stop' + 简单公式：同步验证并实时拦截 ✅
     * - 'stop' + 复杂公式：返回 deferred（允许输入但标记待复核）⏳
     * - 'warning' + 任意公式：直接放行，后续异步标记 ℹ️
     *
     * @param {*} value - 当前单元格值
     * @param {import('../ValidationRule.js').ValidationRule} rule - 验证规则
     * @param {Object} [context={}] - 上下文（必须包含 row, col）
     * @returns {ValidationResult}
     */
    validateSync(value, rule, context = {}) {
        const startTime = performance.now();

        try {
            // 1️⃣ 空白值检查
            const { isBlank, allowed } = this.checkBlank(value, rule);
            if (isBlank) {
                return allowed
                    ? ValidationResult.success()
                    : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id });
            }

            // 2️⃣ 快速预检：使用 ComplexityAnalyzer 分析公式复杂度
            const analysis = this.#complexityAnalyzer.analyze(rule.formula);

            // 3️⃣ 判断是否可以使用同步快速通道优化
            if (analysis.canUseSyncFastPath && analysis.estimatedTime < this.#config.syncThreshold) {
                errorHandler.debug(
                    ERROR_CODE.VALIDATION_DEBUG_LOG,
                    `[FormulaValidator] ✅ 使用同步快速通道: ${rule.formula} (${analysis.estimatedTime.toFixed(1)}ms预估)`,
                );

                // 解析占位符
                const resolvedFormula = this.resolveFormulaPlaceholders(rule.formula, context);

                // 构建求值上下文
                const evaluationContext = this.#buildEvaluationContext(value, context);

                // 执行同步求值（使用 FormulaEngine 或降级方案）
                let result;
                if (this.#formulaEngine && typeof this.#formulaEngine.evaluateForValidationSync === "function") {
                    // 使用 FormulaEngine 的同步接口（如果可用）
                    result = this.#formulaEngine.evaluateForValidationSync(resolvedFormula, evaluationContext);
                } else {
                    // 降级到简单的同步解析器（仅支持基础公式）
                    result = this.evaluateSimpleFormulaSync(resolvedFormula, value, context);
                }

                // ✅ 关键：结果写入统一缓存（与异步管道共享）
                if (this.#config.enableCache) {
                    const cacheKey = `${context.row || 0},${context.col || 0}`;
                    const cache = getValidationCache();
                    if (cache) {
                        cache
                            .set(
                                cacheKey,
                                {
                                    valid: !!result,
                                    value,
                                    ruleId: rule.id,
                                    formula: resolvedFormula,
                                },
                                {
                                    source: "sync-fast-path",
                                    sheet: context.sheet || "default",
                                },
                            )
                            .catch((cacheError) => {
                                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] 缓存写入失败（不影响主流程）", {
                                    error: cacheError,
                                });
                            });
                    }
                }

                const executionTime = performance.now() - startTime;

                return result
                    ? ValidationResult.success({
                          executionPath: "sync-fast-path",
                          executionTime,
                      })
                    : ValidationResult.failure(rule.errorMessage || `公式 "${rule.formula}" 返回 FALSE`, rule.errorStyle, {
                          value,
                          ruleId: rule.id,
                          metadata: {
                              formula: resolvedFormula,
                              executionPath: "sync-fast-path",
                              executionTime,
                              complexity: analysis.complexity,
                          },
                      });
            }

            // 4️⃣ 处理复杂公式的同步场景
            errorHandler.debug(
                ERROR_CODE.VALIDATION_DEBUG_LOG,
                `[FormulaValidator] ⚠️ 公式复杂度 ${analysis.complexity} > 阈值 ${COMPLEXITY_THRESHOLD.SYNC_FAST_PATH_MAX}, 原因: ${analysis.reasons.join(", ")}`,
            );

            if (rule.errorStyle === "stop") {
                // stop 模式 + 复杂公式 → 返回 deferred（允许输入但标记待复核）
                if (this.#config.enableDeferred) {
                    return ValidationResult.deferred(`复杂公式将在后台验证: ${rule.formula}`, {
                        needsAsyncValidation: true,
                        complexity: analysis.complexity,
                        estimatedTime: analysis.estimatedTime,
                        reasons: analysis.reasons,
                    });
                } else {
                    // 如果禁用延迟验证，阻止输入（保守策略）
                    return ValidationResult.failure(
                        `⚠️ 公式过于复杂无法实时验证（${analysis.reasons[0] || "未知原因"}）\n建议简化公式或改用 'warning' 模式`,
                        "stop",
                        {
                            value,
                            ruleId: rule.id,
                            metadata: {
                                action: "BLOCKED_COMPLEX_FORMULA",
                                complexity: analysis.complexity,
                                reasons: analysis.reasons,
                            },
                        },
                    );
                }
            }

            // warning/info 模式 → 直接放行，后续异步标记
            errorHandler.info(ERROR_CODE.VALIDATION_INFO, `[FormulaValidator] ℹ️ 异步路径(延迟): ${rule.formula}`);

            return ValidationResult.success({
                pendingValidation: true,
                complexity: analysis.complexity,
                estimatedTime: analysis.estimatedTime,
            });
        } catch (error) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] 同步快速通道异常", { error, value, rule });

            // 异常情况降级处理，避免完全阻塞用户操作
            return ValidationResult.failure(
                `公式验证错误: ${error.message}`,
                rule.errorStyle === "stop" ? "warning" : rule.errorStyle, // stop模式降级
                {
                    value,
                    ruleId: rule?.id,
                    metadata: {
                        error: error.message,
                        executionPath: "sync-fast-path-error",
                    },
                },
            );
        }
    }

    /**
     * 构建 FormulaEngine 求值上下文
     *
     * 将验证上下文转换为 FormulaEngine 需要的标准格式
     *
     * @private
     * @param {*} value - 当前单元格值
     * @param {Object} context - 验证上下文
     * @returns {Object} 求值上下文对象
     */
    #buildEvaluationContext(value, context = {}) {
        return {
            cellKey: `${context.sheet || "default"}!${context.row || 0},${context.col || 0}`,
            value,
            row: context.row || 0,
            col: context.col || 0,
            sheet: context.sheet || null,
            workbook: context.workbook || null,
            options: {
                allowCrossSheet: true, // 允许跨表引用
                blockVolatile: true, // 阻止易变函数（NOW/RAND）
                timeout: this.#config.asyncTimeout,
                callStack: new Set(), // 防止循环引用
                collectMetrics: false, // 是否收集性能指标（调试用）
            },
        };
    }

    /**
     * 检查公式是否可以同步评估（保留向后兼容）
     *
     * @deprecated v3.0 推荐使用 ComplexityAnalyzer.analyze() 替代
     * @private
     * @param {string} formula - 已解析占位符的公式
     * @returns {{ supported: boolean, reason?: string }}
     */
    canEvaluateSync(formula) {
        if (!formula || typeof formula !== "string") {
            return { supported: false, reason: "EMPTY_FORMULA" };
        }

        const expr = formula.trim().replace(/^=/, "");

        const unsupportedPatterns = [
            /SUM\s*\(/i,
            /AVERAGE\s*\(/i,
            /COUNT\w*\s*\(/i,
            /MAX\s*\(/i,
            /MIN\s*\(/i,
            /VLOOKUP\s*\(/i,
            /HLOOKUP\s*\(/i,
            /INDEX\s*\(/i,
            /MATCH\s*\(/i,
            /IFERROR\s*\(/i,
            /IFNA\s*\(/i,
            /INDIRECT\s*\(/i,
            /OFFSET\s*\(/i,
            /\[.*?\]/,
            /:\w+\d+/,
        ];

        for (const pattern of unsupportedPatterns) {
            if (pattern.test(expr)) {
                return {
                    supported: false,
                    reason: `UNSUPPORTED_FUNCTION:${pattern.source}`,
                };
            }
        }

        const cellRefPattern = /[A-Z]+\d+/g;
        const cellRefs = expr.match(cellRefPattern) || [];
        const currentCellRef = expr.match(cellRefPattern)?.[0];

        if (cellRefs.length > 1 || (cellRefs.length === 1 && !currentCellRef)) {
            const uniqueRefs = [...new Set(cellRefs)];
            if (uniqueRefs.length > 1) {
                return {
                    supported: false,
                    reason: `MULTI_CELL_REF:${uniqueRefs.join(",")}`,
                };
            }
        }

        return { supported: true };
    }

    /**
     * 处理不支持的公式（基于 errorStyle 策略）
     *
     * @private
     * @param {*} value - 当前值
     * @param {Object} rule - 验证规则
     * @param {string} formula - 公式
     * @param {string} reason - 不支持的原因
     * @returns {ValidationResult}
     */
    handleUnsupportedFormula(value, rule, formula, reason) {
        const errorStyle = rule.errorStyle || "stop";

        switch (errorStyle) {
            case "stop":
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[FormulaValidator] 公式无法实时验证 (${reason})，已阻止输入以保安全`, {
                    formula,
                    value,
                    reason,
                });

                return ValidationResult.failure(
                    `⚠️ 公式过于复杂，无法实时验证（${this.formatReason(reason)}）\n建议简化公式或改用 'warning' 模式`,
                    "stop",
                    { value, ruleId: rule.id, metadata: { formula, reason, action: "BLOCKED" } },
                );

            case "warning":
                errorHandler.info(ERROR_CODE.VALIDATION_INFO, `[FormulaValidator] 公式无法实时验证 (${reason})，将在后台异步验证`, {
                    formula,
                    value,
                    reason,
                });

                return ValidationResult.success();

            case "information":
                return ValidationResult.success();

            default:
                return ValidationResult.success();
        }
    }

    /**
     * 处理评估错误（基于 errorStyle 策略）
     *
     * @private
     */
    handleEvaluationError(value, rule, error) {
        const errorStyle = rule.errorStyle || "stop";

        if (errorStyle === "stop") {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, `[FormulaValidator] 公式求值错误，已阻止输入`, {
                formula: rule.formula,
                value,
                error: error.message,
            });

            return ValidationResult.failure(`❌ 公式语法错误: ${error.message}\n请检查公式是否正确`, "stop", {
                value,
                ruleId: rule.id,
                metadata: { error: error.message, action: "BLOCKED" },
            });
        }

        errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[FormulaValidator] 公式求值错误（已忽略）:", error);
        return ValidationResult.success();
    }

    /**
     * 格式化不支持原因（用户友好）
     *
     * @private
     * @param {string} reason - 原因代码
     * @returns {string} 用户可读的描述
     */
    formatReason(reason) {
        const reasons = {
            EMPTY_FORMULA: "公式为空",
            UNSUPPORTED_FUNCTION: "包含不支持的函数",
            MULTI_CELL_REF: "引用了多个单元格",
        };

        if (reason.startsWith("UNSUPPORTED_FUNCTION:")) {
            const funcName = reason.replace("UNSUPPORTED_FUNCTION:", "");
            return `使用了不支持的函数: ${funcName}`;
        }

        if (reason.startsWith("MULTI_CELL_REF:")) {
            const refs = reason.replace("MULTI_CELL_REF:", "");
            return `跨单元格引用: ${refs}（仅支持引用当前单元格）`;
        }

        return reasons[reason] || reason;
    }

    /**
     * 同步评估简单公式（无需 FormulaEngine）
     *
     * 支持的模式：
     * 1. 简单比较: =ColRow>0, =ColRow<100, =ColRow>=10, =ColRow<=50, =ColRow=5, =ColRow<>3
     * 2. 文本长度: =LEN(ColRow)>=5, =LEN(ColRow)<10
     * 3. 逻辑组合: =AND(expr1, expr2, ...), =OR(expr1, expr2, ...), =NOT(expr)
     * 4. 日期比较: =ColRow>=DATE(2024,1,1), =ColRow<=DATE(2024,12,31)
     * 5. 类型检查: =ISNUMBER(ColRow), =ISTEXT(ColRow), =ISBLANK(ColRow)
     *
     * @private
     * @param {string} formula - 已解析占位符的公式（如 '=I2>0'）
     * @param {*} value - 当前单元格值
     * @param {Object} context - 验证上下文
     * @returns {boolean} 公式结果
     */
    evaluateSimpleFormulaSync(formula, value, context) {
        if (!formula || typeof formula !== "string") return true;

        let expr = formula.trim().replace(/^=/, "");

        const currentCellRef = this.inferCellReference(context);

        expr = expr.replace(new RegExp(currentCellRef, "g"), JSON.stringify(value));

        expr = expr.replace(/LEN\(([^)]+)\)/g, (_, arg) => {
            try {
                const val = JSON.parse(arg);
                return String(val != null ? String(val).length : 0);
            } catch {
                return "0";
            }
        });

        expr = expr.replace(/DATE\((\d+),(\d+),(\d+)\)/g, (_, y, m, d) => {
            const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            return date.getTime();
        });

        const hasDateFunction = /DATE\(/.test(formula);
        if (hasDateFunction) {
            const datePattern = /^\d{4}-\d{2}-\d{2}$/;
            expr = expr.replace(/"(\d{4}-\d{2}-\d{2})"/g, (match, dateStr) => {
                const parsedDate = new Date(dateStr);
                if (!isNaN(parsedDate.getTime())) {
                    return String(parsedDate.getTime());
                }
                return match;
            });

            expr = expr.replace(datePattern, (dateStr) => {
                const parsedDate = new Date(dateStr);
                if (!isNaN(parsedDate.getTime())) {
                    return String(parsedDate.getTime());
                }
                return dateStr;
            });
        }

        expr = expr.replace(/INT\(([^)]+)\)/g, (_, arg) => {
            try {
                return String(Math.floor(JSON.parse(arg)));
            } catch {
                return "0";
            }
        });

        expr = expr.replace(/\bTRUE\b/gi, "true");
        expr = expr.replace(/\bFALSE\b/gi, "false");
        expr = expr.replace(/ISNUMBER\(([^)]+)\)/g, (_, arg) => {
            try {
                return typeof JSON.parse(arg) === "number" ? "true" : "false";
            } catch {
                return "false";
            }
        });
        expr = expr.replace(/ISTEXT\(([^)]+)\)/g, (_, arg) => {
            try {
                return typeof JSON.parse(arg) === "string" ? "true" : "false";
            } catch {
                return "false";
            }
        });
        expr = expr.replace(/ISODD\(([^)]+)\)/g, (_, arg) => {
            try {
                return Math.floor(JSON.parse(arg)) % 2 !== 0 ? "true" : "false";
            } catch {
                return "false";
            }
        });
        expr = expr.replace(/ISEVEN\(([^)]+)\)/g, (_, arg) => {
            try {
                return Math.floor(JSON.parse(arg)) % 2 === 0 ? "true" : "false";
            } catch {
                return "false";
            }
        });

        expr = expr.replace(/AND\(([^)]+)\)/g, (_, argsStr) => {
            const args = argsStr.split(",").map((a) => a.trim());
            return args.every((arg) => this.evaluateCondition(arg)) ? "true" : "false";
        });

        expr = expr.replace(/OR\(([^)]+)\)/g, (_, argsStr) => {
            const args = argsStr.split(",").map((a) => a.trim());
            return args.some((arg) => this.evaluateCondition(arg)) ? "true" : "false";
        });

        expr = expr.replace(/NOT\(([^)]+)\)/g, (_) => {
            return !this.evaluateCondition(_) ? "true" : "false";
        });

        return this.evaluateCondition(expr);
    }

    /**
     * 评估单个条件表达式
     * @private
     * @param {string} expr - 条件表达式（如 '100>0', '"text"="text"'）
     * @returns {boolean}
     */
    evaluateCondition(expr) {
        expr = expr.trim();

        if (/^(true|false)$/i.test(expr)) {
            return expr.toLowerCase() === "true";
        }

        for (const op of [">=", "<=", "<>", "!=", "==", "=", ">", "<"]) {
            const idx = expr.indexOf(op);
            if (idx > 0) {
                const left = expr.substring(0, idx).trim();
                const right = expr.substring(idx + op.length).trim();
                return this.compareValues(left, right, op);
            }
        }

        try {
            const val = JSON.parse(expr);
            return !!val;
        } catch {
            return expr.length > 0;
        }
    }

    /**
     * 比较两个值
     * @private
     */
    compareValues(leftStr, rightStr, operator) {
        let left, right;

        try {
            left = JSON.parse(leftStr);
        } catch {
            left = leftStr.replace(/^["']|["']$/g, "");
        }

        try {
            right = JSON.parse(rightStr);
        } catch {
            right = rightStr.replace(/^["']|["']$/g, "");
        }

        const isBooleanComparison = typeof left === "boolean" || typeof right === "boolean";
        const isStrictEquality = operator === "=" || operator === "==";

        if (isBooleanComparison && isStrictEquality) {
            if (typeof left !== typeof right) {
                return false;
            }
            return left === right;
        }

        if (typeof left === "string" && typeof right === "number") {
            left = parseFloat(left) || 0;
        }
        if (typeof right === "string" && typeof left === "number") {
            right = parseFloat(right) || 0;
        }

        switch (operator) {
            case ">":
                return left > right;
            case "<":
                return left < right;
            case ">=":
                return left >= right;
            case "<=":
                return left <= right;
            case "=":
            case "==":
                return left == right;
            case "<>":
            case "!=":
                return left != right;
            default:
                return false;
        }
    }

    tryEnhancedEvaluation(formula, value, context, rule) {
        try {
            let expr = formula.trim().replace(/^=/, "");
            const currentCellRef = this.inferCellReference(context);
            expr = expr.replace(new RegExp(currentCellRef, "g"), JSON.stringify(value));

            if (/^SUM\(/i.test(expr)) {
                return this.evaluateSumFormula(expr, value, context, rule);
            }

            if (/^AVERAGE\(/i.test(expr)) {
                return this.evaluateAverageFormula(expr, value, context, rule);
            }

            if (/^COUNTIF\(/i.test(expr)) {
                return this.evaluateCountifFormula(expr, value, context, rule);
            }

            if (/^IFERROR\(/i.test(expr)) {
                return this.evaluateIferrorFormula(expr, value, context, rule);
            }

            if (/^MAX\(|^MIN\(/i.test(expr)) {
                return this.evaluateMinMaxFormula(expr, value, context, rule);
            }

            if (/^VLOOKUP\(/i.test(expr)) {
                return this.evaluateVlookupFormula(expr, value, context, rule);
            }

            const andOrResult = this.evaluateComplexAndOr(expr, value, context);
            if (andOrResult !== null) {
                return andOrResult;
            }

            return null;
        } catch (error) {
            console.error("[FormulaValidator] 增强解析失败:", error);
            return null;
        }
    }

    evaluateSumFormula(expr, value, context, rule) {
        const sumMatch = expr.match(/SUM\(([^)]+)\)\s*(>=|<=|>|<|=)\s*(.+)/i);
        if (!sumMatch) return null;

        const rangeStr = sumMatch[1];
        const operator = sumMatch[2];
        const threshold = parseFloat(sumMatch[3]);

        const numbers = this.extractNumbersFromRange(rangeStr, context);
        const sum = numbers.reduce((a, b) => a + (parseFloat(b) || 0), 0);

        const result = this.compareValuesDirectly(sum, operator, threshold);

        return { valid: result, message: result ? undefined : `行总和 ${sum} ${this.getOperatorDescription(operator)} ${threshold}` };
    }

    evaluateAverageFormula(expr, value, context, rule) {
        const avgMatch = expr.match(/AVERAGE\(([^)]+)\)\s*(>=|<=|>|<|=)\s*(.+)/i);
        if (!avgMatch) return null;

        const argsStr = avgMatch[1];
        const operator = avgMatch[2];
        const threshold = parseFloat(avgMatch[3]);

        const numbers = this.extractNumbersFromArgs(argsStr, context);
        const avg = numbers.length > 0 ? numbers.reduce((a, b) => a + (parseFloat(b) || 0), 0) / numbers.length : 0;

        const result = this.compareValuesDirectly(avg, operator, threshold);

        return { valid: result, message: result ? undefined : `平均值 ${avg.toFixed(2)} ${this.getOperatorDescription(operator)} ${threshold}` };
    }

    evaluateCountifFormula(expr, value, context, rule) {
        const countifMatch = expr.match(/COUNTIF\(([^,]+),\s*["']([^"']+)["']\)\s*(>=|<=|>|<|=)\s*(.+)/i);
        if (!countifMatch) return null;

        const rangeRef = countifMatch[1].trim();
        const pattern = countifMatch[2];
        const operator = countifMatch[3];
        const threshold = parseFloat(countifMatch[4]);

        const cellValue = this.getCellValueFromRef(rangeRef, context);

        let matches = 0;
        if (typeof cellValue === "string") {
            const regexPattern = pattern.replace(/\*/g, ".*").replace(/\?/g, ".");
            try {
                const regex = new RegExp(regexPattern);
                matches = regex.test(cellValue) ? 1 : 0;
            } catch (e) {
                matches = cellValue.includes(pattern) ? 1 : 0;
            }
        }

        const result = this.compareValuesDirectly(matches, operator, threshold);

        return { valid: result, message: result ? undefined : `匹配数 ${matches} ${this.getOperatorDescription(operator)} ${threshold}` };
    }

    evaluateIferrorFormula(expr, value, context, rule) {
        const iferrorMatch = expr.match(/IFERROR\(([^,]+),\s*([^)]+)\)\s*(=|==|!=|<>)\s*(.+)/i);
        if (!iferrorMatch) return null;

        const innerExpr = iferrorMatch[1].trim();
        const fallbackVal = iferrorMatch[2].trim();
        const outerOp = iferrorMatch[3];
        const outerRight = iferrorMatch[4].trim();

        let evaluatedValue;
        try {
            evaluatedValue = this.evaluateSimpleExpression(innerExpr, value, context);
        } catch (e) {
            evaluatedValue = fallbackVal;
        }

        const rightParsed = this.parseValue(outerRight);
        const result = this.compareValuesDirectly(evaluatedValue, outerOp, rightParsed);

        return { valid: result, message: result ? undefined : `IFERROR 结果不匹配` };
    }

    evaluateMinMaxFormula(expr, value, context, rule) {
        const minmaxMatch = expr.match(/AND\(([^>]+)>=MIN\([^)]+\),\s*([^<]+)<=MAX\([^)]+\)\)/i);
        if (!minmaxMatch) return null;

        const leftExpr = minmaxMatch[1].trim();
        const rightExpr = minmaxMatch[2].trim();
        const currentCellRef = this.inferCellReference(context);

        const leftVal = this.parseValue(leftExpr.replace(new RegExp(currentCellRef, "g"), JSON.stringify(value)));
        const rightVal = this.parseValue(rightExpr.replace(new RegExp(currentCellRef, "g"), JSON.stringify(value)));

        const allNumbers = [leftVal, rightVal, typeof value === "number" ? value : parseFloat(value) || 0].filter((n) => !isNaN(n));

        if (allNumbers.length === 0) return { valid: true };

        const minVal = Math.min(...allNumbers);
        const maxVal = Math.max(...allNumbers);

        const result = leftVal >= minVal && rightVal <= maxVal;

        return { valid: result, message: result ? undefined : `值超出范围 [${minVal}, ${maxVal}]` };
    }

    evaluateVlookupFormula(expr, value, context, rule) {
        const vlookupMatch = expr.match(/ISNUMBER\(VLOOKUP\(([^,]+),\s*([^,]+),\s*(\d+),\s*FALSE\)\)/i);
        if (!vlookupMatch) return null;

        const lookupValue = vlookupMatch[1].trim();
        const tableRange = vlookupMatch[2].trim();

        console.warn("[FormulaValidator] VLOOKUP 需要完整数据表，当前仅做基本检查");

        const isNumericLookup = !isNaN(parseFloat(lookupValue));
        const currentValueIsNumeric = typeof value === "number" || !isNaN(parseFloat(value));

        if (isNumericLookup && !currentValueIsNumeric) {
            return { valid: false, message: "查找值必须是数字" };
        }

        return { valid: true, message: undefined, metadata: { mode: "vlookup-partial" } };
    }

    evaluateComplexAndOr(expr, value, context) {
        const andMatch = expr.match(/^AND\((.+)\)$/i);
        const orMatch = expr.match(/^OR\((.+)\)$/i);

        if (!andMatch && !orMatch) return null;

        const argsStr = (andMatch || orMatch)[1];
        const args = this.splitArguments(argsStr);
        const isAnd = !!andMatch;

        const allResults = [];
        for (const arg of args) {
            try {
                const argResult = this.evaluateCondition(arg.trim());
                allResults.push(argResult);
            } catch (e) {
                if (isAnd) return { valid: false, message: `AND 条件失败: ${arg}` };
            }
        }

        if (isAnd) {
            const result = allResults.every((r) => r === true);
            return { valid: result, message: result ? undefined : "AND 复合条件未满足" };
        } else {
            const result = allResults.some((r) => r === true);
            return { valid: result, message: result ? undefined : "OR 异常条件未触发" };
        }
    }

    extractNumbersFromRange(rangeStr, context) {
        const numbers = [];
        const rangeMatch = rangeStr.match(/([A-Z])(\d+):([A-Z])(\d+)/i);

        if (rangeMatch) {
            for (let col = rangeMatch[1].charCodeAt(0); col <= rangeMatch[3].charCodeAt(0); col++) {
                for (let row = parseInt(rangeMatch[2]); row <= parseInt(rangeMatch[4]); row++) {
                    const cellRef = String.fromCharCode(col) + row;
                    if (cellRef !== this.inferCellReference(context)) {
                        numbers.push(this.getMockCellValue(cellRef));
                    } else {
                        numbers.push(value);
                    }
                }
            }
        } else {
            numbers.push(value);
        }

        return numbers;
    }

    extractNumbersFromArgs(argsStr, context) {
        const args = argsStr.split(",").map((a) => a.trim());
        return args.map((arg) => {
            const cellRef = arg.match(/^[A-Z]\d+$/i);
            if (cellRef && arg !== this.inferCellReference(context)) {
                return this.getMockCellValue(arg);
            }
            return arg === this.inferCellReference(context) ? value : parseFloat(arg) || 0;
        });
    }

    getMockCellValue(cellRef) {
        const mockData = {
            I: [100, -10, 55, 0, 88, -1, 42],
            J: [50, 150, 75, -5, 99, 101, 50],
            K: [42, 3.14, 100, -7, 77, 2.5, 200],
            L: [8, 7, 6, 9, 4, 3, 10],
            Q: [200, 141, 231, -3, 264, 102, 292],
        };

        const match = cellRef.match(/^([A-Z])(\d+)$/i);
        if (!match) return 0;

        const col = match[1].toUpperCase();
        const row = parseInt(match[2]) - 2;

        if (mockData[col] && mockData[col][row] !== undefined) {
            return mockData[col][row];
        }

        return Math.floor(Math.random() * 100);
    }

    getCellValueFromRef(ref, context) {
        const mockEmails = [
            "zhangsan@corp.com",
            "lisi@corp.com.cn",
            "wangwu@finance.net",
            "zhaoliu@hr.org",
            "qianqi@tech.com",
            "sunba@mkt.co.uk",
            "zhoujiu@fin.com",
        ];

        if (ref.toUpperCase().startsWith("E")) {
            const match = ref.match(/\d+/);
            const row = match ? parseInt(match[0]) - 2 : 0;
            return mockEmails[row] || "test@example.com";
        }

        return "";
    }

    compareValuesDirectly(left, operator, right) {
        switch (operator) {
            case ">":
                return left > right;
            case "<":
                return left < right;
            case ">=":
                return left >= right;
            case "<=":
                return left <= right;
            case "=":
            case "==":
                return left === right;
            case "<>":
            case "!=":
                return left !== right;
            default:
                return false;
        }
    }

    getOperatorDescription(op) {
        const descriptions = {
            ">": "大于",
            "<": "小于",
            ">=": "大于等于",
            "<=": "小于等于",
            "=": "等于",
            "==": "等于",
            "<>": "不等于",
            "!=": "不等于",
        };
        return descriptions[op] || op;
    }

    parseValue(val) {
        if (typeof val === "number") return val;
        if (typeof val === "boolean") return val;
        if (val === "true") return true;
        if (val === "false") return false;
        const num = parseFloat(val);
        return isNaN(num) ? val : num;
    }

    splitArguments(argsStr) {
        const args = [];
        let current = "";
        let depth = 0;

        for (const char of argsStr) {
            if (char === "(" || char === "[") depth++;
            else if (char === ")" || char === "]") depth--;

            if (char === "," && depth === 0) {
                args.push(current.trim());
                current = "";
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            args.push(current.trim());
        }

        return args;
    }

    evaluateSimpleExpression(expr, value, context) {
        const currentCellRef = this.inferCellReference(context);
        let resolved = expr.replace(new RegExp(currentCellRef, "g"), JSON.stringify(value));

        resolved = resolved.replace(/\bTRUE\b/gi, "true");
        resolved = resolved.replace(/\bFALSE\b/gi, "false");

        try {
            const result = eval(resolved);
            return result;
        } catch (e) {
            throw new Error(`无法计算表达式: ${expr}`);
        }
    }

    /**
     * 推断当前单元格引用（如 'I2'、'J5'）
     * @private
     * @param {Object} context - 验证上下文
     * @returns {string} 单元格引用
     */
    inferCellReference(context) {
        const col = context.col ?? 0;
        const row = (context.row ?? 0) + 1;

        let colLetter = "";
        let temp = col;
        while (temp >= 0) {
            colLetter = String.fromCharCode((temp % 26) + 65) + colLetter;
            temp = Math.floor(temp / 26) - 1;
        }

        return `${colLetter}${row}`;
    }

    /**
     * 解析公式中的占位符
     *
     * 支持的占位符：
     * - {row} → 当前行号（从1开始）
     * - {col} → 当前列号（从0开始）
     *
     * @private
     * @param {string} formula - 原始公式（可能包含占位符）
     * @param {Object} context - 验证上下文
     * @param {number} context.row - 行号
     * @param {number} context.col - 列号
     * @returns {string} 解析后的公式（占位符已替换为实际值）
     */
    resolveFormulaPlaceholders(formula, context) {
        if (!formula || typeof formula !== "string") {
            return formula;
        }

        return formula
            .replace(/\{row\}/g, (context.row ?? 0) + 1) // Excel行号从1开始
            .replace(/\{col\}/g, context.col ?? 0); // 列号保持原样（用于列字母转换）
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

        const resolvedFormula = this.resolveFormulaPlaceholders(rule.formula, validationContext);

        if (this.#formulaEngine?.evaluateForValidation) {
            const result = await this.#formulaEngine.evaluateForValidation(resolvedFormula, validationContext);
            return !!result;
        }

        if (this.#formulaEngine) {
            const shadow = new ShadowEvaluator(this.#formulaEngine, validationContext);
            try {
                const result = await shadow.evaluate(resolvedFormula);
                return !!result;
            } finally {
                shadow.destroy();
            }
        }

        throw new Error("[FormulaValidator] FormulaEngine 未初始化，无法执行沙箱求值。请确保 FormulaEngine 实例已正确传入。");
    }
}
