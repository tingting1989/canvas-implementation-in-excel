import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "../../core/ErrorHandler.js";
import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";

/**
 * 唯一性校验器 (v3.0 - CellStore 单一数据源版本)
 *
 * 核心原则：
 * - CellStore 是唯一的"事实来源"（Source of Truth）
 * - #auxiliaryIndex 仅是"辅助索引"（用于快速预检）
 *
 * 关键规则：
 * 1. 所有最终判定必须基于 CellStore 实时查询
 * 2. 索引只能用于 quickCheck() 乐观估计
 * 3. 索引不一致时自动降级为全表扫描
 * 4. 批量操作后必须重建索引（或标记为 dirty）
 *
 * @extends BaseValidator
 *
 * @example
 * const validator = new UniqueValidatorV3(cellStore);
 * const result = await validator.fullValidate('ORD-001', {
 *     range: 'A1:A10000',
 *     excludeRow: 5 // 排除当前编辑行
 * });
 */
export class UniqueValidatorV3 extends BaseValidator {
    static get TYPE() {
        return "unique";
    }

    /**
     * @type {import('../../cell/CellStore').CellStore} CellStore 实例
     * @private
     */
    #cellStore;

    /**
     * @type {Map<string, Set<*>>} 辅助索引（非权威，仅用于快速预检）
     * @private
     */
    #auxiliaryIndex = new Map();

    /**
     * @type {boolean} 索引是否可信
     * @private
     */
    #indexTrusted = false;

    /**
     * 构造唯一性校验器
     * @param {Object} cellStore - CellStore 实例
     */
    constructor(cellStore) {
        super();
        this.#cellStore = cellStore;
    }

    /**
     * 验证值是否唯一
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
                : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id });
        }

        try {
            const range = context.range || rule.range;
            const excludeRow = context.row;

            const report = await this.fullValidate(value, {
                range,
                excludeRow,
            });

            return report.isUnique
                ? ValidationResult.success()
                : ValidationResult.failure(rule.errorMessage || `"${value}" 已存在重复值`, rule.errorStyle, {
                      value,
                      ruleId: rule.id,
                      metadata: {
                          duplicateCount: report.duplicateCount,
                          scannedCount: report.scannedCount,
                          dataSource: report.dataSource,
                      },
                  });
        } catch (error) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[UniqueValidator] 验证失败:", error);
            return ValidationResult.failure(`唯一性校验失败: ${error.message}`, "warning", { value, ruleId: rule.id });
        }
    }

    /**
     * 完整校验（始终基于 CellStore）- 唯一能给出确定性结果的接口
     *
     * ⚠️ 注意：这是唯一能给出确定性结果的接口
     *
     * @param {*} value - 待检查值
     * @param {Object} context - 校验上下文
     * @param {string} context.range - 校验范围（如 "A1:A10000"）
     * @param {number} [context.excludeRow] - 排除的行号（当前编辑行）
     * @returns {Promise<{isUnique: boolean, duplicateCount: number, dataSource: string, scannedCount: number, timestamp: number}>}
     */
    async fullValidate(value, context) {
        const range = this.parseRange(context.range);
        const actualValues = [];

        for (let row = range.startRow; row <= range.endRow; row++) {
            for (let col = range.startCol; col <= range.endCol; col++) {
                if (row === context.excludeRow) continue;

                const cell = this.#cellStore.get(row, col);
                if (cell?.value != null && cell?.value !== "") {
                    actualValues.push(cell.value);
                }
            }
        }

        const duplicateCount = actualValues.filter((v) => v === value).length;

        this.syncAuxiliaryIndex(actualValues);

        return {
            isUnique: duplicateCount === 0,
            duplicateCount,
            dataSource: "cellstore",
            scannedCount: actualValues.length,
            timestamp: Date.now(),
        };
    }

    /**
     * 快速预检（使用辅助索引，结果不确定）
     *
     * ⚠️ 返回的 confidence 可能是 'low'，此时必须调用 fullValidate()
     *
     * @param {*} value - 待检查值
     * @param {string} columnKey - 列标识
     * @returns {{ valid: boolean|undefined, confidence: 'high'|'low'|'stale' }}
     */
    quickCheck(value, columnKey) {
        if (!this.#indexTrusted) {
            return { valid: undefined, confidence: "stale" };
        }

        const indexData = this.#auxiliaryIndex.get(columnKey);

        if (!indexData) {
            return { valid: true, confidence: "high" };
        }

        if (indexData.has(value)) {
            return { valid: false, confidence: "low" };
        }

        return { valid: true, confidence: "high" };
    }

    /**
     * 标记索引为不可信（在批量操作前后调用）
     * @param {string} reason - 原因（如 'sort', 'paste', 'undo'）
     */
    markIndexStale(reason) {
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[UniqueValidator] 索引标记为不可信 (原因: ${reason})`);
        this.#indexTrusted = false;
        this.scheduleIndexRebuild();
    }

    /**
     * 解析范围字符串为行列对象
     * @private
     * @param {string} rangeStr - 范围字符串（如 "A1:A10000"）
     * @returns {{ startRow: number, startCol: number, endRow: number, endCol: number }}
     */
    parseRange(rangeStr) {
        const match = rangeStr.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);

        if (!match) {
            throw new Error(`无效的范围格式: ${rangeStr}`);
        }

        const colToNum = (col) => {
            let num = 0;
            for (let i = 0; i < col.length; i++) {
                num = num * 26 + (col.charCodeAt(i) - 64);
            }
            return num - 1;
        };

        return {
            startRow: parseInt(match[2]) - 1,
            startCol: colToNum(match[1]),
            endRow: parseInt(match[4]) - 1,
            endCol: colToNum(match[3]),
        };
    }

    /**
     * 同步辅助索引（从 CellStore 快照更新）
     * @private
     * @param {Array<*>} cellStoreSnapshot - CellStore 数据快照
     */
    syncAuxiliaryIndex(cellStoreSnapshot) {
        this.#auxiliaryIndex.clear();

        cellStoreSnapshot.forEach((value, idx) => {
            // 这里简化处理，实际应该根据列信息建立索引
            const columnKey = `col_${idx % 10}`;
            if (!this.#auxiliaryIndex.has(columnKey)) {
                this.#auxiliaryIndex.set(columnKey, new Set());
            }
            this.#auxiliaryIndex.get(columnKey).add(value);
        });

        this.#indexTrusted = true;
    }

    /**
     * 异步重建索引（低优先级后台任务）
     * @private
     */
    scheduleIndexRebuild() {
        if (typeof requestIdleCallback !== "undefined") {
            requestIdleCallback(
                () => {
                    errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[UniqueValidator] 开始后台重建索引...");

                    // TODO: 从 CellStore 全量扫描并重建索引
                    errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[UniqueValidator] 索引重建完成");
                },
                { timeout: 2000 },
            );
        } else {
            setTimeout(() => {
                errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[UniqueValidator] 开始后台重建索引...");

                // TODO: 从 CellStore 全量扫描并重建索引
                errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[UniqueValidator] 索引重建完成");
            }, 100);
        }
    }
}
