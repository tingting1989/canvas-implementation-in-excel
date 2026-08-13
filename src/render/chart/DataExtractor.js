/**
 * 图表数据提取器
 * 负责从工作表中提取图表所需的数据，支持多种提取策略以优化性能
 *
 * 提取策略（根据数据量自动选择）：
 * - 同步提取（< 500单元格）：适用于小数据量，直接在主线程执行
 * - 异步分块提取（500-5000单元格）：使用 requestAnimationFrame 分片处理，避免UI卡顿
 * - Web Worker 提取（> 5000单元格且 Worker 可用）：在后台线程中处理大数据集
 *
 * @example
 * const extractor = new DataExtractor();
 * const result = await extractor.extract(chart, sheet);
 * console.log(result.headers, result.data);
 */
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

export class DataExtractor {
    /** @private Web Worker 实例，用于后台数据提取 */
    #worker = null;

    /** @private 标记 Worker 是否已成功初始化并可用 */
    #workerReady = false;

    /** @private 存储进行中的异步任务，key 为 taskId */
    #pendingTasks = new Map();

    /** @private 任务ID计数器，确保每个任务有唯一标识 */
    #taskIdCounter = 0;

    constructor() {
        this.#initWorker();
    }

    /**
     * 从工作表提取图表数据
     * 根据数据范围大小自动选择最优的提取策略
     *
     * @param {Object} chart - 图表配置对象
     * @param {Object} chart.dataRange - 数据范围 { startRow, endRow, startCol, endCol }
     * @param {Object} [chart.style] - 图表样式配置
     * @param {boolean} [chart.style.ignoreHiddenData] - 是否忽略隐藏行列的数据
     * @param {Object} sheet - 工作表对象
     * @param {Object} sheet.cellDataAccessor - 单元格数据访问器
     * @param {Object} [sheet.rowColManager] - 行列管理器（用于查询隐藏状态）
     * @returns {Promise<{headers: Array, data: Array, source: string}>} 提取结果
     *   - headers: 表头数据数组（第一行）
     *   - data: 数据内容数组（第二行起）
     *   - source: 数据来源标识 ("sync" | "async-chunked" | "worker" | "none")
     */
    async extract(chart, sheet) {
        if (!chart.dataRange) return { headers: [], data: [], source: "none" };

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
     * 计算数据范围内的单元格总数
     *
     * @private
     * @param {Object} range - 数据范围
     * @param {number} range.startRow - 起始行号
     * @param {number} range.endRow - 结束行号
     * @param {number} range.startCol - 起始列号
     * @param {number} range.endCol - 结束列号
     * @returns {number} 单元格总数
     */
    #calculateCellCount(range) {
        if (!range) return 0;
        const rows = range.endRow - range.startRow + 1;
        const cols = range.endCol - range.startCol + 1;
        return rows * cols;
    }

    /**
     * 同步提取数据（主线程直接执行）
     * 适用于小数据量场景（< 500个单元格），无性能开销
     *
     * 实现策略：
     * - 使用 CellDataAccessor.getValueMatrix() 批量提取值矩阵（高效）
     * - 如果需要过滤隐藏行列，对矩阵进行二次过滤
     *
     * @private
     * @param {Object} chart - 图表配置对象
     * @param {Object} sheet - 工作表对象
     * @returns {{headers: Array, data: Array, source: string}} 提取结果
     */
    #extractSync(chart, sheet) {
        const { startRow, endRow, startCol, endCol } = chart.dataRange;
        const shouldIgnoreHidden = chart.style?.ignoreHiddenData ?? false;
        const accessor = sheet.cellDataAccessor;

        let matrix = accessor.getValueMatrix(startRow, startCol, endRow, endCol);

        if (shouldIgnoreHidden) {
            matrix = this.#filterHiddenRowsAndCols(matrix, startRow, endRow, startCol, endCol, sheet);
        }

        return { headers: matrix[0] || [], data: matrix.slice(1), source: "sync" };
    }

    /**
     * 异步分块提取数据（使用 requestAnimationFrame 时间切片）
     * 适用于中等数据量（500-5000个单元格），避免长时间阻塞主线程导致UI卡顿
     *
     * 实现策略：
     * - 使用 CellDataAccessor.getValueMatrix() 批量提取值矩阵（高效）
     * - 如果需要过滤隐藏行列，对矩阵进行二次过滤
     * - 在过滤过程中每处理50个单元格让出主线程控制权
     *
     * @private
     * @async
     * @param {Object} chart - 图表配置对象
     * @param {Object} sheet - 工作表对象
     * @returns {Promise<{headers: Array, data: Array, source: string}>} 提取结果
     */
    async #extractAsyncChunked(chart, sheet) {
        const { startRow, endRow, startCol, endCol } = chart.dataRange;
        const shouldIgnoreHidden = chart.style?.ignoreHiddenData ?? false;
        const accessor = sheet.cellDataAccessor;

        let matrix = accessor.getValueMatrix(startRow, startCol, endRow, endCol);

        if (shouldIgnoreHidden) {
            matrix = await this.#filterHiddenRowsAndColsAsync(matrix, startRow, endRow, startCol, endCol, sheet);
        }

        return { headers: matrix[0] || [], data: matrix.slice(1), source: "async-chunked" };
    }

    /**
     * 在 Web Worker 中提取数据（后台线程执行）
     * 适用于大数据量（> 5000个单元格），完全不阻塞主线程
     *
     * 实现细节：
     * 1. 先将单元格数据序列化为主线程可传输的格式
     * 2. 通过 postMessage 发送给 Worker 处理
     * 3. 使用 Promise + 事件监听模式实现异步等待
     * 4. 设置10秒超时防止 Worker 无响应
     *
     * 注意：当前 Worker 实现中 ignoreHidden 参数未实际使用，
     * 如需在 Worker 中支持隐藏行列过滤，需要在 Worker 内部实现相应逻辑
     *
     * @private
     * @async
     * @param {Object} chart - 图表配置对象
     * @param {Object} sheet - 工作表对象
     * @returns {Promise<{headers: Array, data: Array, source: string}>} 提取结果
     */
    async #extractInWorker(chart, sheet) {
        if (!this.#workerReady) {
            return this.#extractAsyncChunked(chart, sheet);
        }

        const taskId = ++this.#taskIdCounter;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.#pendingTasks.delete(taskId);
                this.#worker.removeEventListener("message", handler);
                this.#worker.removeEventListener("error", errorHandler);
                reject(new Error("[DataExtractor] Worker timeout"));
            }, 10000);

            const handler = (e) => {
                if (e.data.taskId !== taskId) return;

                clearTimeout(timeout);
                this.#pendingTasks.delete(taskId);
                this.#worker.removeEventListener("message", handler);
                this.#worker.removeEventListener("error", errorHandler);

                resolve(e.data.result);
            };

            const errorHandler = (err) => {
                clearTimeout(timeout);
                this.#pendingTasks.delete(taskId);
                this.#worker.removeEventListener("message", handler);
                this.#worker.removeEventListener("error", errorHandler);
                reject(err);
            };

            this.#worker.addEventListener("message", handler);
            this.#worker.addEventListener("error", errorHandler);
            this.#pendingTasks.set(taskId, { resolve, reject });

            const cellData = this.#serializeCellData(chart, sheet);
            this.#worker.postMessage({
                taskId,
                type: "extract",
                cellData,
                ignoreHidden: chart.style?.ignoreHiddenData ?? false,
            });
        });
    }

    /**
     * 序列化单元格数据为纯值数组
     * 使用 CellDataAccessor.getValueMatrix() 批量提取值矩阵（高效）
     * 用于传递给 Web Worker（Worker 无法访问主线程的对象引用）
     *
     * 注意：此方法不处理隐藏行列过滤，
     * 因为序列化后的数据将在 Worker 中进一步处理
     *
     * @private
     * @param {Object} chart - 图表配置对象
     * @param {Object} sheet - 工作表对象
     * @returns {Array<Array<any>>} 二维数组，每个元素为单元格值或 null
     */
    #serializeCellData(chart, sheet) {
        const { startRow, endRow, startCol, endCol } = chart.dataRange;
        const accessor = sheet.cellDataAccessor;

        return accessor.getValueMatrix(startRow, startCol, endRow, endCol);
    }

    /**
     * 过滤隐藏的行和列（同步版本）
     * 从值矩阵中移除隐藏行和隐藏列对应的数据
     *
     * @private
     * @param {Array<Array<any>>} matrix - 原始值矩阵
     * @param {number} startRow - 起始行号
     * @param {number} endRow - 结束行号
     * @param {number} startCol - 起始列号
     * @param {number} endCol - 结束列号
     * @param {Object} sheet - 工作表对象
     * @returns {Array<Array<any>>} 过滤后的值矩阵
     */
    #filterHiddenRowsAndCols(matrix, startRow, endRow, startCol, endCol, sheet) {
        const rowColManager = sheet.rowColManager;

        if (!rowColManager) return matrix;

        const filteredMatrix = [];

        for (let row = 0; row < matrix.length; row++) {
            const actualRow = startRow + row;

            if (rowColManager.isRowHidden(actualRow)) continue;

            const filteredRow = [];
            for (let col = 0; col < matrix[row].length; col++) {
                const actualCol = startCol + col;

                if (rowColManager.isColumnHidden(actualCol)) continue;

                filteredRow.push(matrix[row][col]);
            }

            filteredMatrix.push(filteredRow);
        }

        return filteredMatrix;
    }

    /**
     * 过滤隐藏的行和列（异步版本，支持时间切片）
     * 从值矩阵中移除隐藏行和隐藏列对应的数据
     * 每处理50个单元格让出主线程控制权，避免UI卡顿
     *
     * @private
     * @async
     * @param {Array<Array<any>>} matrix - 原始值矩阵
     * @param {number} startRow - 起始行号
     * @param {number} endRow - 结束行号
     * @param {number} startCol - 起始列号
     * @param {number} endCol - 结束列号
     * @param {Object} sheet - 工作表对象
     * @returns {Promise<Array<Array<any>>>} 过滤后的值矩阵
     */
    async #filterHiddenRowsAndColsAsync(matrix, startRow, endRow, startCol, endCol, sheet) {
        const rowColManager = sheet.rowColManager;
        const CHUNK_SIZE = 50;

        if (!rowColManager) return matrix;

        const filteredMatrix = [];
        let count = 0;

        for (let row = 0; row < matrix.length; row++) {
            const actualRow = startRow + row;

            if (rowColManager.isRowHidden(actualRow)) continue;

            const filteredRow = [];
            for (let col = 0; col < matrix[row].length; col++) {
                const actualCol = startCol + col;

                if (rowColManager.isColumnHidden(actualCol)) continue;

                filteredRow.push(matrix[row][col]);
                count++;

                if (count % CHUNK_SIZE === 0) {
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                }
            }

            filteredMatrix.push(filteredRow);
        }

        return filteredMatrix;
    }

    /**
     * 初始化 Web Worker
     * 使用 Blob URL 创建内联 Worker，避免额外的文件依赖
     *
     * Worker 职责：
     * 接收序列化后的单元格数据和任务参数
     * 执行数据提取逻辑（当前仅做简单的数据分割）
     * 返回结构化的结果数据
     *
     * 如果初始化失败（如浏览器不支持 Worker），
     * 会将 #workerReady 设为 false，后续任务会降级为分块提取模式
     *
     * @private
     */
    #initWorker() {
        try {
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
        } catch (e) {
            errorHandler.warn(ERROR_CODE.CHART_DATA_EXTRACTOR_INIT_FAILED, "Failed to initialize worker", { error: e });
            this.#workerReady = false;
        }
    }

    /**
     * 销毁实例并释放资源
     * 终止 Worker 线程，清除所有待处理任务
     * 应在组件卸载时调用以避免内存泄漏
     */
    destroy() {
        if (this.#worker) {
            this.#worker.terminate();
            this.#worker = null;
        }
        this.#pendingTasks.clear();
        this.#workerReady = false;
    }
}
