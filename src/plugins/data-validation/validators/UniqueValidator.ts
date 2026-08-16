import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";
import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";
import type { ValidationRule } from "../ValidationRule.js";

interface UniqueValidateReport {
    isUnique: boolean;
    duplicateCount: number;
    dataSource: string;
    scannedCount: number;
    timestamp: number;
}

interface ParsedRange {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}

/**
 * 唯一性校验器 (v3.0 - CellStore 单一数据源版本)
 *
 * 核心原则：
 * - CellStore 是唯一的"事实来源"（Source of Truth）
 * - #auxiliaryIndex 仅是"辅助索引"（用于快速预检）
 */
export class UniqueValidator extends BaseValidator {
    static get TYPE(): string {
        return "unique";
    }

    #cellStore: any;
    #auxiliaryIndex: Map<string, Set<any>> = new Map();
    #indexTrusted: boolean = false;

    constructor(cellStore: any) {
        super();
        this.#cellStore = cellStore;
    }

    async validate(value: any, rule: ValidationRule, context: Record<string, any> = {}): Promise<ValidationResult> {
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
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[UniqueValidator] 验证失败:", error);
            return ValidationResult.failure(`唯一性校验失败: ${error.message}`, "warning", { value, ruleId: rule.id });
        }
    }

    validateSync(value: any, rule: ValidationRule, context: Record<string, any> = {}): ValidationResult {
        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank && !allowed) {
            return ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id });
        }

        try {
            const range = this.parseRange(context.range || rule.range);
            const actualValues: { row: number; col: number; value: any }[] = [];

            const maxRow = range.endRow === Infinity ? this.#cellStore.getRowCount?.() || 10000 : range.endRow;
            const maxCol = range.endCol === Infinity ? this.#cellStore.getColumnCount?.() || 100 : range.endCol;

            for (let row = range.startRow; row <= maxRow; row++) {
                for (let col = range.startCol; col <= maxCol; col++) {
                    if (row === context.row) continue;
                    const cell = this.#cellStore.getCell ? this.#cellStore.getCell(row, col) : this.#cellStore.get(row, col);
                    if (cell?.value !== undefined && cell.value !== null && cell.value !== "") {
                        actualValues.push({ row, col, value: cell.value });
                    }
                }
            }

            const duplicates = actualValues.filter((item) => String(item.value) === String(value));

            if (duplicates.length > 0) {
                return ValidationResult.failure(rule.errorMessage || `"${value}" 已存在重复值`, rule.errorStyle, {
                    value,
                    ruleId: rule.id,
                    metadata: { duplicateCount: duplicates.length },
                });
            }

            return ValidationResult.success();
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[UniqueValidator] 同步验证失败:", error);
            return ValidationResult.success();
        }
    }

    async fullValidate(value: any, context: { range?: string; excludeRow?: number }): Promise<UniqueValidateReport> {
        const range = this.parseRange(context.range || "");
        const actualValues: any[] = [];

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

    quickCheck(value: any, columnKey: string): { valid: boolean | undefined; confidence: "high" | "low" | "stale" } {
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

    markIndexStale(reason: string): void {
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[UniqueValidator] 索引标记为不可信 (原因: ${reason})`);
        this.#indexTrusted = false;
        this.scheduleIndexRebuild();
    }

    parseRange(rangeStr: string): ParsedRange {
        const colToNum = (col: string): number => {
            let num = 0;
            for (let i = 0; i < col.length; i++) {
                num = num * 26 + (col.charCodeAt(i) - 64);
            }
            return num - 1;
        };

        const fullColMatch = rangeStr.match(/^([A-Z]+):([A-Z]+)$/);
        if (fullColMatch) {
            const startCol = colToNum(fullColMatch[1]);
            const endCol = colToNum(fullColMatch[2]);
            return { startRow: 0, startCol, endRow: Infinity, endCol };
        }

        const fullRowMatch = rangeStr.match(/^(\d+):(\d+)$/);
        if (fullRowMatch) {
            const startRow = parseInt(fullRowMatch[1]) - 1;
            const endRow = parseInt(fullRowMatch[2]) - 1;
            return { startRow, startCol: 0, endRow, endCol: Infinity };
        }

        const rangeMatch = rangeStr.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
        if (rangeMatch) {
            return {
                startRow: parseInt(rangeMatch[2]) - 1,
                startCol: colToNum(rangeMatch[1]),
                endRow: parseInt(rangeMatch[4]) - 1,
                endCol: colToNum(rangeMatch[3]),
            };
        }

        throw new Error(`无效的范围格式: ${rangeStr}`);
    }

    syncAuxiliaryIndex(cellStoreSnapshot: any[]): void {
        this.#auxiliaryIndex.clear();

        cellStoreSnapshot.forEach((value, idx) => {
            const columnKey = `col_${idx % 10}`;
            if (!this.#auxiliaryIndex.has(columnKey)) {
                this.#auxiliaryIndex.set(columnKey, new Set());
            }
            this.#auxiliaryIndex.get(columnKey)!.add(value);
        });

        this.#indexTrusted = true;
    }

    scheduleIndexRebuild(): void {
        if (typeof requestIdleCallback !== "undefined") {
            requestIdleCallback(
                () => {
                    errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[UniqueValidator] 开始后台重建索引...");
                    errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[UniqueValidator] 索引重建完成");
                },
                { timeout: 2000 },
            );
        } else {
            setTimeout(() => {
                errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[UniqueValidator] 开始后台重建索引...");
                errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[UniqueValidator] 索引重建完成");
            }, 100);
        }
    }
}
