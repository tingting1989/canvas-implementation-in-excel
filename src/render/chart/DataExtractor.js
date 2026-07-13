export class DataExtractor {
    #worker = null;
    #workerReady = false;
    #pendingTasks = new Map();
    #taskIdCounter = 0;

    constructor() {
        this.#initWorker();
    }

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

    #calculateCellCount(range) {
        if (!range) return 0;
        const rows = range.endRow - range.startRow + 1;
        const cols = range.endCol - range.startCol + 1;
        return rows * cols;
    }

    #extractSync(chart, sheet) {
        const { startRow, endRow, startCol, endCol } = chart.dataRange;
        const shouldIgnoreHidden = chart.style?.ignoreHiddenData ?? false;
        const rowData = [];
        const accessor = sheet.cellDataAccessor;
        for (let row = startRow; row <= endRow; row++) {
            if (shouldIgnoreHidden && sheet.rowColManager?.isHiddenRow?.(row)) continue;
            const colData = [];
            for (let col = startCol; col <= endCol; col++) {
                if (shouldIgnoreHidden && sheet.rowColManager?.isHiddenCol?.(col)) continue;
                const cell = accessor.get(row, col);
                colData.push(cell?.value ?? null);
            }
            rowData.push(colData);
        }
        
        return { headers: rowData[0] || [], data: rowData.slice(1), source: "sync" };
    }

    async #extractAsyncChunked(chart, sheet) {
        const { startRow, endRow, startCol, endCol } = chart.dataRange;
        const shouldIgnoreHidden = chart.style?.ignoreHiddenData ?? false;
        const CHUNK_SIZE = 50;
        const rowData = [];
        let count = 0;
        const accessor = sheet.cellDataAccessor;
        for (let row = startRow; row <= endRow; row++) {
            if (shouldIgnoreHidden && sheet.rowColManager?.isHiddenRow?.(row)) continue;
            const colData = [];
            for (let col = startCol; col <= endCol; col++) {
                if (shouldIgnoreHidden && sheet.rowColManager?.isHiddenCol?.(col)) continue;
                const cell = accessor.get(row, col);
                colData.push(cell?.value ?? null);
                count++;
                if (count % CHUNK_SIZE === 0) {
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                }
            }
            rowData.push(colData);
        }
        
        return { headers: rowData[0] || [], data: rowData.slice(1), source: "async-chunked" };
    }

    async #extractInWorker(chart, sheet) {
        if (!this.#workerReady) {
            return this.#extractAsyncChunked(chart, sheet);
        }

        const taskId = ++this.#taskIdCounter;
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.#pendingTasks.delete(taskId);
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

    #serializeCellData(chart, sheet) {
        const { startRow, endRow, startCol, endCol } = chart.dataRange;
        const result = [];
        const accessor = sheet.cellDataAccessor;
        for (let row = startRow; row <= endRow; row++) {
            const rowData = [];
            for (let col = startCol; col <= endCol; col++) {
                const cell =  accessor.get(row, col);
                rowData.push(cell?.value ?? null);
            }
            result.push(rowData);
        }
        
        return result;
    }

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
            console.warn("[DataExtractor] Failed to initialize worker:", e);
            this.#workerReady = false;
        }
    }

    destroy() {
        if (this.#worker) {
            this.#worker.terminate();
            this.#worker = null;
        }
        this.#pendingTasks.clear();
        this.#workerReady = false;
    }
}