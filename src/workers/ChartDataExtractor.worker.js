/**
 * ChartDataExtractor Worker
 *
 * 职责：在后台线程中处理图表数据提取和计算
 * 优势：完全不会阻塞主线程 UI 渲染
 *
 * 通信协议：
 * - 主线程 → Worker: { type: 'extract', dataRange, cellData, ignoreHidden }
 * - Worker → 主线程: { type: 'extract-complete', data, success } | { type: 'extract-error', error }
 */

// 监听主线程消息
self.onmessage = function (e) {
    const { type, dataRange, cellData, ignoreHidden, taskId } = e.data;

    try {
        if (type === "ping") {
            self.postMessage({ type: "pong", success: true });
            return;
        }

        if (type === "extract") {
            const startTime = performance.now();

            // 在 Worker 中执行数据提取
            const result = extractData(dataRange, cellData, ignoreHidden);

            const endTime = performance.now();
            const duration = Math.round((endTime - startTime) * 100) / 100;

            self.postMessage({
                type: "extract-complete",
                data: result,
                success: true,
                taskId,
                duration,
                timestamp: Date.now(),
            });
            return;
        }

        self.postMessage({
            type: "error",
            error: `Unknown message type: ${type}`,
            success: false,
        });
    } catch (error) {
        self.postMessage({
            type: "extract-error",
            error: error.message,
            stack: error.stack,
            success: false,
            taskId,
        });
    }
};

/**
 * 从扁平化的单元格数组中提取结构化数据
 * @param {object} dataRange - 数据范围 { startRow, endRow, startCol, endCol }
 * @param {Array} cellData - 扁平化的单元格值数组
 * @param {boolean} ignoreHidden - 是否忽略隐藏行列
 * @returns {object} 提取结果 { headers, data, source, rowCount, colCount }
 */
function extractData(dataRange, cellData, ignoreHidden) {
    if (!dataRange || !cellData || !Array.isArray(cellData)) {
        return {
            headers: [],
            data: [],
            source: "worker-empty",
            rowCount: 0,
            colCount: 0,
        };
    }

    const { startRow = 0, endRow = 0, startCol = 0, endCol = 0 } = dataRange;

    // 计算总列数（用于索引计算）
    const totalCols = Math.max(endCol - startCol + 1, 1);
    const totalRows = endRow - startRow + 1;

    const rowData = [];
    let actualRowCount = 0;

    // 按行遍历提取数据
    for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
        const absoluteRow = startRow + rowIdx;

        // 如果需要忽略隐藏行，这里可以添加过滤逻辑
        // 注意：Worker 中无法访问 Sheet 对象的 rowColManager
        // 隐藏信息需要在主线程预处理时传递过来

        const colData = [];
        let hasData = false;

        for (let colIdx = 0; colIdx < totalCols; colIdx++) {
            const absoluteCol = startCol + colIdx;

            // 计算在扁平数组中的索引
            const flatIndex = rowIdx * totalCols + colIdx;

            // 安全获取值
            const value = flatIndex < cellData.length ? cellData[flatIndex] : null;

            colData.push(value);

            if (value !== null && value !== undefined && value !== "") {
                hasData = true;
            }
        }

        rowData.push(colData);

        if (hasData || rowIdx === 0) {
            // 始终保留第一行作为表头
            actualRowCount++;
        }
    }

    // 分离表头和数据行
    const headers = rowData.length > 0 ? rowData[0] : [];
    const data = rowData.length > 1 ? rowData.slice(1) : [];

    return {
        headers,
        data,
        source: "worker",
        rowCount: actualRowCount,
        colCount: totalCols,
        extractedAt: Date.now(),
    };
}

// 标记 Worker 就绪
self.postMessage({ type: "ready", success: true });
