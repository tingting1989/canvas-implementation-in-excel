import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "../../core/ErrorHandler.js";
import { ValidationResult } from "./ValidationResult.js";

const BATCH_EVENTS = {
    BATCH_START: "validation:batch:start",
    BATCH_PROGRESS: "validation:batch:progress",
    BATCH_COMPLETE: "validation:batch:complete",
    BATCH_ERROR: "validation:batch:error",
};

/**
 * 批量验证协调器
 *
 * 职责：
 * 1. 检测批量操作（Sort/Paste/AutoFill）
 * 2. 合并验证请求（避免重复）
 * 3. 分批异步执行（不阻塞 UI）
 * 4. 提供进度反馈
 *
 * @example
 * const coordinator = new BatchValidationCoordinator(validationEngine, eventBus);
 *
 * // 进入批量模式
 * coordinator.enterBatchMode('paste', 1000);
 *
 * // ... 执行批量操作 ...
 *
 * // 退出并执行验证
 * const report = await coordinator.exitBatchMode();
 */
export class BatchValidationCoordinator {
    /**
     * @type {boolean} 是否正在进行批量操作
     * @private
     */
    #isBatchMode = false;

    /**
     * @type {Array} 待处理的验证队列
     * @private
     */
    #pendingValidations = [];

    /**
     * @type {string|null} 当前操作类型
     * @private
     */
    #currentOperation = null;

    /**
     * @type {number} 预估影响行数
     * @private
     */
    #estimatedCount = 0;

    /**
     * @type {number} 批量大小（每批处理的单元格数）
     */
    BATCH_SIZE = 100;

    /**
     * @type {import('./ValidationEngine.js').ValidationEngine} 验证引擎实例
     * @private
     */
    #engine;

    /**
     * @type {Object} 事件总线实例
     * @private
     */
    #eventBus;

    /**
     * 构造批量验证协调器
     * @param {import('./ValidationEngine.js').ValidationEngine} engine - 验证引擎
     * @param {Object} eventBus - 事件总线
     */
    constructor(engine, eventBus = null) {
        this.#engine = engine;
        this.#eventBus = eventBus;
    }

    /**
     * 是否处于批量模式
     * @returns {boolean}
     */
    get isBatchMode() {
        return this.#isBatchMode;
    }

    /**
     * 当前待处理的验证数量
     * @returns {number}
     */
    get pendingCount() {
        return this.#pendingValidations.length;
    }

    /**
     * 进入批量操作模式
     *
     * 由 SortPlugin/PastePlugin/AutoFillPlugin 在操作开始前调用
     *
     * @param {string} operation - 操作类型 ('sort' | 'paste' | 'autofill' | 'undo')
     * @param {number} estimatedCount - 预估影响行数
     * @throws {Error} 如果已在批量模式中
     */
    enterBatchMode(operation, estimatedCount) {
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

    /**
     * 退出批量操作模式并执行验证
     *
     * @param {Object} [options={}] - 选项
     * @param {boolean} [options.showReport=true] - 是否显示违规报告
     * @returns {Promise<{totalChecked: number, invalidCount: number, violations: Array, duration: number}>}
     */
    async exitBatchMode(options = {}) {
        if (!this.#isBatchMode) {
            return { totalChecked: 0, invalidCount: 0, violations: [], duration: 0 };
        }

        const startTime = performance.now();

        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[BatchValidation] 开始批量验证，共 ${this.#pendingValidations.length} 项`);

        let report;
        try {
            report = await this.#processBatch();
        } catch (error) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[BatchValidation] 批量验证失败:", error);
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

    /**
     * 处理单个单元格变更（智能路由）
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {*} newValue - 新值
     * @param {*} [oldValue] - 旧值
     * @throws {Error} 如果不在批量模式中
     */
    onCellChange(row, col, newValue, oldValue = undefined) {
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

    /**
     * 取消当前批量操作（不执行验证）
     */
    cancel() {
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

    /**
     * 分批异步处理队列
     * @private
     * @returns {Promise<Object>}
     */
    async #processBatch() {
        const results = [];
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

    /**
     * 处理单个批次
     * @private
     * @param {Array} batch - 批次数据
     * @returns {Promise<Array>}
     */
    async #processSingleBatch(batch) {
        const results = [];

        for (const item of batch) {
            try {
                const result = await this.#engine.validateCell(item.row, item.col, item.newValue);

                results.push({
                    row: item.row,
                    col: item.col,
                    value: item.newValue,
                    ...result.toJSON(),
                });
            } catch (error) {
                errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, `[BatchValidation] 单元格 (${item.row},${item.col}) 验证失败:`, error);
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

    /**
     * 让出主线程（避免阻塞 UI）
     * @private
     * @returns {Promise<void>}
     */
    #yieldToMainThread() {
        return new Promise((resolve) => {
            if (typeof requestIdleCallback !== "undefined") {
                requestIdleCallback(() => resolve(), { timeout: 50 });
            } else {
                setTimeout(() => resolve(), 0);
            }
        });
    }

    /**
     * 生成验证报告
     * @private
     * @param {Array} results - 所有验证结果
     * @returns {Object}
     */
    #generateReport(results) {
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

    /**
     * 重置状态
     * @private
     */
    #resetState() {
        this.#isBatchMode = false;
        this.#currentOperation = null;
        this.#estimatedCount = 0;
        this.#pendingValidations = [];
    }

    /**
     * 发送事件
     * @private
     * @param {string} event - 事件名称
     * @param {Object} data - 事件数据
     */
    #emit(event, data) {
        if (this.#eventBus && typeof this.#eventBus.emit === "function") {
            this.#eventBus.emit(event, data);
        }
    }

    /**
     * 销毁协调器
     */
    destroy() {
        this.cancel();
        this.#engine = null;
        this.#eventBus = null;
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[BatchValidationCoordinator] 已销毁");
    }
}

export { BATCH_EVENTS };
