/**
 * @fileoverview 图表数据提取器
 * @description 从工作表单元格区域提取图表数据，根据数据量级自动选择
 *              同步提取、异步分块提取或 Web Worker 提取三种策略，
 *              支持隐藏行/列过滤。
 * @module render/chart/DataExtractor
 */

import { errorHandler } from "../../core/ErrorHandler";
import { ERROR_CODE } from "../../constants/errorCodes";
import type { ExtractResult } from "./types";

/**
 * 数据范围接口
 *
 * 描述图表关联的单元格区域边界（行号和列号）。
 */
interface DataRange {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
}

/**
 * 图表对象接口
 *
 * 描述 DataExtractor 所需的最小图表契约，
 * 包含数据范围和可选的样式配置。
 */
interface ChartLike {
    dataRange: DataRange | null;
    style?: {
        ignoreHiddenData?: boolean;
    };
}

/**
 * 单元格数据访问器接口
 *
 * 提供按范围获取值矩阵的能力。
 */
interface CellDataAccessorLike {
    getValueMatrix(startRow: number, startCol: number, endRow: number, endCol: number): unknown[][];
}

/**
 * 行列管理器接口
 *
 * 提供行/列隐藏状态查询能力。
 */
interface RowColManagerLike {
    isRowHidden(row: number): boolean;
    isColumnHidden(col: number): boolean;
}

/**
 * 工作表接口
 *
 * 描述 DataExtractor 所需的最小工作表契约，
 * 包含单元格数据访问器和可选的行列管理器。
 */
interface SheetLike {
    cellDataAccessor: CellDataAccessorLike;
    rowColManager?: RowColManagerLike;
}

/**
 * 图表数据提取器
 *
 * 根据数据量级自动选择提取策略：
 * - < 500 单元格：同步提取（#extractSync）
 * - 500 ~ 5000 单元格：异步分块提取（#extractAsyncChunked）
 * - > 5000 单元格：Web Worker 提取（#extractInWorker）
 *
 * 支持 ignoreHiddenData 选项，过滤隐藏行/列的数据。
 * Web Worker 使用内联 Blob 创建，无需额外文件。
 *
 * @class DataExtractor
 */
export class DataExtractor {
    /**
     * @private 私有字段 - Web Worker 实例
     *
     * 内联 Blob 创建的 Worker，用于大数据量的异步提取。
     */
    #worker: Worker | null = null;

    /**
     * @private 私有字段 - Worker 是否就绪
     */
    #workerReady: boolean = false;

    /**
     * @private 私有字段 - 待处理的异步任务映射
     *
     * taskId → { resolve, reject }，用于匹配 Worker 返回结果与调用方 Promise。
     */
    #pendingTasks: Map<number, { resolve: (value: ExtractResult) => void; reject: (reason: unknown) => void }> = new Map();

    /**
     * @private 私有字段 - 任务 ID 自增计数器
     */
    #taskIdCounter: number = 0;

    /**
     * 构造数据提取器
     *
     * 初始化 Web Worker（内联 Blob 方式）。
     */
    constructor() {
        this.#initWorker();
    }

    /**
     * 提取图表数据
     *
     * 根据单元格数量自动选择提取策略：
     * - < 500：同步提取，无异步开销
     * - 500 ~ 5000 或 Worker 未就绪：异步分块提取，每 50 个单元格让出一帧
     * - > 5000 且 Worker 就绪：Web Worker 提取，不阻塞主线程
     *
     * @param chart - 图表对象，包含数据范围和样式配置
     * @param sheet - 工作表对象，提供单元格数据访问器
     * @returns 提取结果，包含 headers、data 和 source 标识
     */
    async extract(chart: ChartLike, sheet: SheetLike): Promise<ExtractResult> {
        if (!chart.dataRange) {
            return { headers: [], data: [], source: "none" };
        }

        const cellCount = this.#calculateCellCount(chart.dataRange);

        if (cellCount < 500) {
            return this.#extractSync(chart, sheet);
        }

        if (cellCount <= 5000 || !this.#workerReady) {
            return this.#extractAsyncChunked(chart, sheet);
        }

        return this.#extractInWorker(chart, sheet);
    }

    /**
     * @private 私有方法 - 计算数据范围的单元格总数
     *
     * @param range - 数据范围
     * @returns 单元格数量
     */
    #calculateCellCount(range: DataRange): number {
        if (!range) {
            return 0;
        }
        const rows = range.endRow - range.startRow + 1;
        const cols = range.endCol - range.startCol + 1;
        return rows * cols;
    }

    /**
     * @private 私有方法 - 同步提取数据
     *
     * 直接调用 cellDataAccessor.getValueMatrix 获取值矩阵，
     * 首行为 headers，其余为 data。若启用 ignoreHiddenData，
     * 调用 #filterHiddenRowsAndCols 过滤隐藏行/列。
     *
     * @param chart - 图表对象
     * @param sheet - 工作表对象
     * @returns 提取结果，source 为 "sync"
     */
    #extractSync(chart: ChartLike, sheet: SheetLike): ExtractResult {
        const { startRow, endRow, startCol, endCol } = chart.dataRange!;
        const shouldIgnoreHidden = chart.style?.ignoreHiddenData ?? false;
        const accessor = sheet.cellDataAccessor;

        let matrix = accessor.getValueMatrix(startRow, startCol, endRow, endCol);

        if (shouldIgnoreHidden) {
            matrix = this.#filterHiddenRowsAndCols(matrix, startRow, endRow, startCol, endCol, sheet);
        }

        return { headers: matrix[0] || [], data: matrix.slice(1), source: "sync" };
    }

    /**
     * @private 私有方法 - 异步分块提取数据
     *
     * 与同步提取逻辑相同，但隐藏行/列过滤使用异步版本，
     * 每 50 个单元格通过 requestAnimationFrame 让出一帧，避免阻塞 UI。
     *
     * @param chart - 图表对象
     * @param sheet - 工作表对象
     * @returns 提取结果，source 为 "async-chunked"
     */
    async #extractAsyncChunked(chart: ChartLike, sheet: SheetLike): Promise<ExtractResult> {
        const { startRow, endRow, startCol, endCol } = chart.dataRange!;
        const shouldIgnoreHidden = chart.style?.ignoreHiddenData ?? false;
        const accessor = sheet.cellDataAccessor;

        let matrix = accessor.getValueMatrix(startRow, startCol, endRow, endCol);

        if (shouldIgnoreHidden) {
            matrix = await this.#filterHiddenRowsAndColsAsync(matrix, startRow, endRow, startCol, endCol, sheet);
        }

        return { headers: matrix[0] || [], data: matrix.slice(1), source: "async-chunked" };
    }

    /**
     * @private 私有方法 - Web Worker 提取数据
     *
     * 将序列化后的单元格数据发送给 Worker，
     * Worker 在后台线程执行 headers/data 分割后返回结果。
     * 设置 10 秒超时，超时后 reject 并清理监听器。
     * 若 Worker 未就绪，降级为异步分块提取。
     *
     * @param chart - 图表对象
     * @param sheet - 工作表对象
     * @returns 提取结果，source 为 "worker"
     */
    async #extractInWorker(chart: ChartLike, sheet: SheetLike): Promise<ExtractResult> {
        if (!this.#workerReady) {
            return this.#extractAsyncChunked(chart, sheet);
        }

        const taskId = ++this.#taskIdCounter;

        return new Promise<ExtractResult>((resolve, reject) => {
            // 10 秒超时保护
            const timeout = setTimeout(() => {
                this.#pendingTasks.delete(taskId);
                this.#worker!.removeEventListener("message", handler);
                this.#worker!.removeEventListener("error", errorListener);
                reject(new Error("[DataExtractor] Worker timeout"));
            }, 10000);

            const handler = (e: MessageEvent) => {
                if (e.data.taskId !== taskId) {
                    return;
                }

                clearTimeout(timeout);
                this.#pendingTasks.delete(taskId);
                this.#worker!.removeEventListener("message", handler);
                this.#worker!.removeEventListener("error", errorListener);

                resolve(e.data.result as ExtractResult);
            };

            const errorListener = (err: ErrorEvent) => {
                clearTimeout(timeout);
                this.#pendingTasks.delete(taskId);
                this.#worker!.removeEventListener("message", handler);
                this.#worker!.removeEventListener("error", errorListener);
                reject(err);
            };

            this.#worker!.addEventListener("message", handler);
            this.#worker!.addEventListener("error", errorListener);
            this.#pendingTasks.set(taskId, { resolve, reject });

            // 序列化单元格数据并发送给 Worker
            const cellData = this.#serializeCellData(chart, sheet);
            this.#worker!.postMessage({
                taskId,
                type: "extract",
                cellData,
                ignoreHidden: chart.style?.ignoreHiddenData ?? false,
            });
        });
    }

    /**
     * @private 私有方法 - 序列化单元格数据
     *
     * 从工作表获取值矩阵，用于发送给 Web Worker。
     * Worker 端无法访问 sheet 对象，需提前序列化。
     *
     * @param chart - 图表对象
     * @param sheet - 工作表对象
     * @returns 值矩阵（二维数组）
     */
    #serializeCellData(chart: ChartLike, sheet: SheetLike): unknown[][] {
        const { startRow, endRow, startCol, endCol } = chart.dataRange!;
        const accessor = sheet.cellDataAccessor;

        return accessor.getValueMatrix(startRow, startCol, endRow, endCol);
    }

    /**
     * @private 私有方法 - 同步过滤隐藏行/列
     *
     * 遍历值矩阵，跳过隐藏行和隐藏列，返回过滤后的矩阵。
     * 若 rowColManager 不可用，直接返回原矩阵。
     *
     * @param matrix - 原始值矩阵
     * @param startRow - 起始行号
     * @param endRow - 结束行号
     * @param startCol - 起始列号
     * @param endCol - 结束列号
     * @param sheet - 工作表对象
     * @returns 过滤后的值矩阵
     */
    #filterHiddenRowsAndCols(matrix: unknown[][], startRow: number, endRow: number, startCol: number, endCol: number, sheet: SheetLike): unknown[][] {
        const rowColManager = sheet.rowColManager;

        if (!rowColManager) {
            return matrix;
        }

        const filteredMatrix: unknown[][] = [];

        for (let row = 0; row < matrix.length; row++) {
            const actualRow = startRow + row;

            // 跳过隐藏行
            if (rowColManager.isRowHidden(actualRow)) {
                continue;
            }

            const filteredRow: unknown[] = [];
            for (let col = 0; col < matrix[row].length; col++) {
                const actualCol = startCol + col;

                // 跳过隐藏列
                if (rowColManager.isColumnHidden(actualCol)) {
                    continue;
                }

                filteredRow.push(matrix[row][col]);
            }

            filteredMatrix.push(filteredRow);
        }

        return filteredMatrix;
    }

    /**
     * @private 私有方法 - 异步过滤隐藏行/列
     *
     * 与同步版本逻辑相同，但每处理 CHUNK_SIZE（50）个单元格后
     * 通过 requestAnimationFrame 让出一帧，避免长时间阻塞 UI。
     *
     * @param matrix - 原始值矩阵
     * @param startRow - 起始行号
     * @param endRow - 结束行号
     * @param startCol - 起始列号
     * @param endCol - 结束列号
     * @param sheet - 工作表对象
     * @returns 过滤后的值矩阵
     */
    async #filterHiddenRowsAndColsAsync(
        matrix: unknown[][],
        startRow: number,
        endRow: number,
        startCol: number,
        endCol: number,
        sheet: SheetLike,
    ): Promise<unknown[][]> {
        const rowColManager = sheet.rowColManager;
        // 每处理 50 个单元格让出一帧
        const CHUNK_SIZE = 50;

        if (!rowColManager) {
            return matrix;
        }

        const filteredMatrix: unknown[][] = [];
        let count = 0;

        for (let row = 0; row < matrix.length; row++) {
            const actualRow = startRow + row;

            if (rowColManager.isRowHidden(actualRow)) {
                continue;
            }

            const filteredRow: unknown[] = [];
            for (let col = 0; col < matrix[row].length; col++) {
                const actualCol = startCol + col;

                if (rowColManager.isColumnHidden(actualCol)) {
                    continue;
                }

                filteredRow.push(matrix[row][col]);
                count++;

                // 每处理 CHUNK_SIZE 个单元格让出一帧
                if (count % CHUNK_SIZE === 0) {
                    await new Promise<void>((resolve) => {
                        requestAnimationFrame(() => resolve());
                    });
                }
            }

            filteredMatrix.push(filteredRow);
        }

        return filteredMatrix;
    }

    /**
     * @private 私有方法 - 初始化 Web Worker
     *
     * 使用内联 Blob 创建 Worker，Worker 端逻辑：
     * 接收 { taskId, type, cellData, ignoreHidden } 消息，
     * 分割 headers 和 data 后返回 { taskId, result } 消息。
     * 初始化失败时记录警告日志，降级为异步分块提取。
     */
    #initWorker(): void {
        try {
            // Worker 内联代码：接收数据，分割 headers/data，返回结果
            const workerCode = `
                self.onmessage = function(e) {
                    const { taskId, type, cellData, ignoreHidden } = e.data;
                    if (type === 'extract') {
                        const headers = cellData[0] || [];
                        const data = cellData.slice(1) || [];
                        self.postMessage({
                            taskId,
                            result: { headers, data, source: 'worker' }
                        });
                    }
                };
            `;
            const blob = new Blob([workerCode], { type: "application/javascript" });
            this.#worker = new Worker(URL.createObjectURL(blob));
            this.#workerReady = true;
        } catch (e: unknown) {
            errorHandler.warn(ERROR_CODE.CHART_DATA_EXTRACTOR_INIT_FAILED, "Failed to initialize worker", { error: e });
            this.#workerReady = false;
        }
    }

    /**
     * 销毁数据提取器
     *
     * 终止 Web Worker，清空待处理任务，释放资源。
     */
    destroy(): void {
        if (this.#worker) {
            this.#worker.terminate();
            this.#worker = null;
        }
        this.#pendingTasks.clear();
        this.#workerReady = false;
    }
}
