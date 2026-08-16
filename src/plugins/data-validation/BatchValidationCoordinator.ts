import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { ValidationResult } from "./ValidationResult.js";
import type { ValidationRule } from "./ValidationRule.js";

interface BatchTask {
    row: number;
    col: number;
    value: any;
    rules: ValidationRule[];
}

interface BatchResult {
    row: number;
    col: number;
    result: ValidationResult;
}

interface BatchConfig {
    maxConcurrency?: number;
    chunkSize?: number;
    onProgress?: (completed: number, total: number) => void;
    onCellResult?: (row: number, col: number, result: ValidationResult) => void;
    abortSignal?: AbortSignal;
}

/**
 * 批量验证协调器
 *
 * 处理排序、粘贴等批量操作的验证，支持：
 * - 并发控制：限制同时执行的验证任务数
 * - 分块处理：将大批量任务拆分为小块逐步执行
 * - 进度回调：实时报告验证进度
 * - 中止支持：通过 AbortSignal 中止批量验证
 */
export class BatchValidationCoordinator {
    #engine: any;

    constructor(engine: any) {
        this.#engine = engine;
    }

    async validateBatch(tasks: BatchTask[], config: BatchConfig = {}): Promise<BatchResult[]> {
        const { maxConcurrency = 10, chunkSize = 100, onProgress, onCellResult, abortSignal } = config;

        const results: BatchResult[] = [];
        const total = tasks.length;
        let completed = 0;

        const chunks = this.chunkArray(tasks, chunkSize);

        for (const chunk of chunks) {
            if (abortSignal?.aborted) {
                errorHandler.info(ERROR_CODE.VALIDATION_INFO, "[BatchValidationCoordinator] 批量验证已中止");
                break;
            }

            const chunkResults = await this.processChunk(chunk, maxConcurrency, onCellResult, abortSignal);

            for (const result of chunkResults) {
                results.push(result);
                completed++;

                if (onProgress) {
                    onProgress(completed, total);
                }
            }
        }

        return results;
    }

    async processChunk(
        chunk: BatchTask[],
        maxConcurrency: number,
        onCellResult?: (row: number, col: number, result: ValidationResult) => void,
        abortSignal?: AbortSignal,
    ): Promise<BatchResult[]> {
        const results: BatchResult[] = [];
        const executing: Promise<void>[] = [];

        for (const task of chunk) {
            if (abortSignal?.aborted) break;

            const promise = this.#engine
                .validateCell(task.row, task.col, task.value, task.rules)
                .then((result: ValidationResult) => {
                    results.push({ row: task.row, col: task.col, result });
                    if (onCellResult) {
                        onCellResult(task.row, task.col, result);
                    }
                })
                .catch((error: any) => {
                    errorHandler.error(ERROR_CODE.VALIDATION_ERROR, `[BatchValidationCoordinator] 验证失败 (${task.row},${task.col}):`, error);
                    results.push({
                        row: task.row,
                        col: task.col,
                        result: ValidationResult.failure(`验证异常: ${error.message}`, "warning"),
                    });
                });

            executing.push(promise);

            if (executing.length >= maxConcurrency) {
                await Promise.race(executing);
                const settled = executing.filter((p) => {
                    return (
                        Promise.race([
                            p.then(
                                () => true,
                                () => true,
                            ),
                            Promise.resolve(false),
                        ]) !== Promise.resolve(false)
                    );
                });
            }
        }

        await Promise.all(executing);
        return results;
    }

    async validateRange(startRow: number, startCol: number, endRow: number, endCol: number, config: BatchConfig = {}): Promise<BatchResult[]> {
        const tasks: BatchTask[] = [];

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const value = this.#engine?.cellStore?.get(row, col)?.value;
                const rules = this.#engine?.getRulesForCell(row, col) || [];
                if (rules.length > 0) {
                    tasks.push({ row, col, value, rules });
                }
            }
        }

        return this.validateBatch(tasks, config);
    }

    chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}
