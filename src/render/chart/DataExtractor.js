export class DataExtractor {
    #worker = null;
    #workerReady = false;

    async extract(chart, sheet) {
        if (!chart.dataRange) return { headers: [], data: [], source: "none" };
        const cellCount = this.#calculateCellCount(chart.dataRange);
        if (cellCount < 500) return this.#extractSync(chart, sheet);
        if (cellCount <= 5000) return this.#extractAsyncChunked(chart, sheet);
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
        const shouldIgnoreHidden = chart.style.ignoreHiddenData;
        const rowData = [];
        for (let row = startRow; row <= endRow; row++) {
            if (shouldIgnoreHidden && sheet.rowColManager.isHiddenRow(row)) continue;
            const colData = [];
            for (let col = startCol; col <= endCol; col++) {
                if (shouldIgnoreHidden && sheet.rowColManager.isHiddenCol(col)) continue;
                const cell = sheet.getCell(row, col);
                colData.push(cell?.value ?? null);
            }
            rowData.push(colData);
        }
        return { headers: rowData[0] || [], data: rowData.slice(1), source: "sync" };
    }

    async #extractAsyncChunked(chart, sheet) {
        const { startRow, endRow, startCol, endCol } = chart.dataRange;
        const shouldIgnoreHidden = chart.style.ignoreHiddenData;
        const CHUNK_SIZE = 100;
        const rowData = [];
        let count = 0;
        for (let row = startRow; row <= endRow; row++) {
            if (shouldIgnoreHidden && sheet.rowColManager.isHiddenRow(row)) continue;
            const colData = [];
            for (let col = startCol; col <= endCol; col++) {
                if (shouldIgnoreHidden && sheet.rowColManager.isHiddenCol(col)) continue;
                const cell = sheet.getCell(row, col);
                colData.push(cell?.value ?? null);
                count++;
                if (count % CHUNK_SIZE === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
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
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("[DataExtractor] Worker timeout"));
            }, 10000);
            this.#worker.onmessage = (e) => {
                clearTimeout(timeout);
                resolve(e.data);
            };
            this.#worker.onerror = (err) => {
                clearTimeout(timeout);
                reject(err);
            };
            this.#worker.postMessage({
                type: "extract",
                dataRange: chart.dataRange,
                ignoreHidden: chart.style.ignoreHiddenData,
            });
        });
    }

    #initWorker() {
        try {
            const workerCode = [
                "self.onmessage = function(e) {",
                "    const { type, dataRange } = e.data;",
                "    if (type === 'extract') {",
                "        self.postMessage({ headers: [], data: [], source: 'worker' });",
                "    }",
                "};",
            ].join("\n");
            const blob = new Blob([workerCode], { type: "application/javascript" });
            this.#worker = new Worker(URL.createObjectURL(blob));
            this.#workerReady = true;
        } catch (e) {
            this.#workerReady = false;
        }
    }

    destroy() {
        if (this.#worker) {
            this.#worker.terminate();
            this.#worker = null;
            this.#workerReady = false;
        }
    }
}
