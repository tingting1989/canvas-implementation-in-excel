import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

const BATCH_EVENTS = {
    BATCH_START: "validation:batch:start",
    BATCH_PROGRESS: "validation:batch:progress",
    BATCH_COMPLETE: "validation:batch:complete",
    BATCH_ERROR: "validation:batch:error",
};

export class BatchValidationCoordinator {
    #isBatchMode: boolean = false;
    #pendingValidations: Array<{ row: number; col: number; newValue: any; oldValue: any; timestamp: number }> = [];
    #currentOperation: string | null = null;
    #estimatedCount: number = 0;
    BATCH_SIZE: number = 100;
    #engine: any;
    #eventBus: any;

    constructor(engine: any, eventBus: any = null) {
        this.#engine = engine;
        this.#eventBus = eventBus;
    }

    get isBatchMode(): boolean {
        return this.#isBatchMode;
    }

    get pendingCount(): number {
        return this.#pendingValidations.length;
    }

    enterBatchMode(operation: string, estimatedCount: number): void {
        if (this.#isBatchMode) {
            throw new Error(`已经在批量模式中，当前操作: ${this.#currentOperation}`);
        }

        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[BatchValidation] 进入 ${operation} 模式，预估 ${estimatedCount} 行`);
        this.#isBatchMode = true;
        this.#currentOperation = operation;
        this.#estimatedCount = estimatedCount;
        this.#pendingValidations = [];

        this.#emit(BATCH_EVENTS.BATCH_START, {
            operation,
            estimatedCount,
        });
    }

    async exitBatchMode(
        options: Record<string, any> = {},
    ): Promise<{ totalChecked: number; invalidCount: number; violations: any[]; duration: number }> {
        if (!this.#isBatchMode) {
            return { totalChecked: 0, invalidCount: 0, violations: [], duration: 0 };
        }

        const startTime = performance.now();

        let report: any;
        try {
            report = await this.#processBatch();
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[BatchValidation] 批量验证失败:", error);
            this.#emit(BATCH_EVENTS.BATCH_ERROR, { error, operation: this.#currentOperation });

            const duration = performance.now() - startTime;
            this.#resetState();

            throw error;
        }

        const duration = performance.now() - startTime;

        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[BatchValidation] 批量验证完成，耗时 ${duration.toFixed(2)}ms`);
        errorHandler.debug(
            ERROR_CODE.VALIDATION_DEBUG_LOG,
            `[BatchValidation] 总计: ${report.totalChecked}, 有效: ${report.validCount}, 无效: ${report.invalidCount}`,
        );

        this.#emit(BATCH_EVENTS.BATCH_COMPLETE, {
            ...report,
            duration,
            operation: this.#currentOperation,
        });

        this.#resetState();

        return {
            totalChecked: report.totalChecked,
            invalidCount: report.invalidCount,
            violations: report.violations,
            duration,
        };
    }

    onCellChange(row: number, col: number, newValue: any, oldValue: any = undefined): void {
        if (!this.#isBatchMode) {
            throw new Error("不在批量模式中，请先调用 enterBatchMode()");
        }

        this.#pendingValidations.push({
            row,
            col,
            newValue,
            oldValue,
            timestamp: Date.now(),
        });
    }

    cancel(): void {
        if (!this.#isBatchMode) return;

        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[BatchValidation] 取消批量操作: ${this.#currentOperation}`);
        this.#emit(BATCH_EVENTS.BATCH_COMPLETE, {
            totalChecked: 0,
            invalidCount: 0,
            violations: [],
            cancelled: true,
            operation: this.#currentOperation,
        });

        this.#resetState();
    }

    async #processBatch(): Promise<any> {
        const results: any[] = [];
        const total = this.#pendingValidations.length;

        for (let i = 0; i < total; i += this.BATCH_SIZE) {
            const batch = this.#pendingValidations.slice(i, i + this.BATCH_SIZE);

            const batchResults = await this.#processSingleBatch(batch);
            results.push(...batchResults);

            const processed = Math.min(i + this.BATCH_SIZE, total);

            this.#emit(BATCH_EVENTS.BATCH_PROGRESS, {
                processed,
                total,
                percentage: ((processed / total) * 100).toFixed(1),
            });

            if (i + this.BATCH_SIZE < total) {
                await this.#yieldToMainThread();
            }
        }

        return this.#generateReport(results);
    }

    async #processSingleBatch(batch: any[]): Promise<any[]> {
        const results: any[] = [];

        for (const item of batch) {
            try {
                const result = await this.#engine.validateCell(item.row, item.col, item.newValue);

                results.push({
                    row: item.row,
                    col: item.col,
                    value: item.newValue,
                    ...result.toJSON(),
                });
            } catch (error: any) {
                errorHandler.error(ERROR_CODE.VALIDATION_ERROR, `[BatchValidation] 单元格 (${item.row},${item.col}) 验证失败:`, error);
                results.push({
                    row: item.row,
                    col: item.col,
                    value: item.newValue,
                    valid: false,
                    message: `验证异常: ${error.message}`,
                    errorStyle: "warning",
                });
            }
        }

        return results;
    }

    #yieldToMainThread(): Promise<void> {
        return new Promise((resolve) => {
            if (typeof requestIdleCallback !== "undefined") {
                requestIdleCallback(() => resolve(), { timeout: 50 });
            } else {
                setTimeout(() => resolve(), 0);
            }
        });
    }

    #generateReport(results: any[]): { totalChecked: number; validCount: number; invalidCount: number; violations: any[] } {
        const violations = results.filter((r) => !r.valid);
        const validCount = results.filter((r) => r.valid).length;

        return {
            totalChecked: results.length,
            validCount,
            invalidCount: violations.length,
            violations: violations.map((v) => ({
                cell: `(${v.row},${v.col})`,
                row: v.row,
                col: v.col,
                value: v.value,
                message: v.message,
                errorStyle: v.errorStyle,
            })),
        };
    }

    #resetState(): void {
        this.#isBatchMode = false;
        this.#currentOperation = null;
        this.#estimatedCount = 0;
        this.#pendingValidations = [];
    }

    #emit(event: string, data: any): void {
        if (this.#eventBus && typeof this.#eventBus.emit === "function") {
            this.#eventBus.emit(event, data);
        }
    }

    destroy(): void {
        this.cancel();
        this.#engine = null;
        this.#eventBus = null;
    }
}

export { BATCH_EVENTS };
