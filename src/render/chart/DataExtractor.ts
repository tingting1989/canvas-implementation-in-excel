import { errorHandler } from "../../core/ErrorHandler";
import { ERROR_CODE } from "../../constants/errorCodes";
import type { ExtractResult } from "./types";

interface DataRange {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
}

interface ChartLike {
    dataRange: DataRange | null;
    style?: {
        ignoreHiddenData?: boolean;
    };
}

interface CellDataAccessorLike {
    getValueMatrix(startRow: number, startCol: number, endRow: number, endCol: number): unknown[][];
}

interface RowColManagerLike {
    isRowHidden(row: number): boolean;
    isColumnHidden(col: number): boolean;
}

interface SheetLike {
    cellDataAccessor: CellDataAccessorLike;
    rowColManager?: RowColManagerLike;
}

export class DataExtractor {
    #worker: Worker | null = null;
    #workerReady: boolean = false;
    #pendingTasks: Map<number, { resolve: (value: ExtractResult) => void; reject: (reason: unknown) => void }> = new Map();
    #taskIdCounter: number = 0;

    constructor() {
        this.#initWorker();
    }

    async extract(chart: ChartLike, sheet: SheetLike): Promise<ExtractResult> {
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

    #calculateCellCount(range: DataRange): number {
        if (!range) return 0;
        const rows = range.endRow - range.startRow + 1;
        const cols = range.endCol - range.startCol + 1;
        return rows * cols;
    }

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

    async #extractInWorker(chart: ChartLike, sheet: SheetLike): Promise<ExtractResult> {
        if (!this.#workerReady) {
            return this.#extractAsyncChunked(chart, sheet);
        }

        const taskId = ++this.#taskIdCounter;

        return new Promise<ExtractResult>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.#pendingTasks.delete(taskId);
                this.#worker!.removeEventListener("message", handler);
                this.#worker!.removeEventListener("error", errorListener);
                reject(new Error("[DataExtractor] Worker timeout"));
            }, 10000);

            const handler = (e: MessageEvent) => {
                if (e.data.taskId !== taskId) return;

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

            const cellData = this.#serializeCellData(chart, sheet);
            this.#worker!.postMessage({
                taskId,
                type: "extract",
                cellData,
                ignoreHidden: chart.style?.ignoreHiddenData ?? false,
            });
        });
    }

    #serializeCellData(chart: ChartLike, sheet: SheetLike): unknown[][] {
        const { startRow, endRow, startCol, endCol } = chart.dataRange!;
        const accessor = sheet.cellDataAccessor;

        return accessor.getValueMatrix(startRow, startCol, endRow, endCol);
    }

    #filterHiddenRowsAndCols(matrix: unknown[][], startRow: number, endRow: number, startCol: number, endCol: number, sheet: SheetLike): unknown[][] {
        const rowColManager = sheet.rowColManager;

        if (!rowColManager) return matrix;

        const filteredMatrix: unknown[][] = [];

        for (let row = 0; row < matrix.length; row++) {
            const actualRow = startRow + row;

            if (rowColManager.isRowHidden(actualRow)) continue;

            const filteredRow: unknown[] = [];
            for (let col = 0; col < matrix[row].length; col++) {
                const actualCol = startCol + col;

                if (rowColManager.isColumnHidden(actualCol)) continue;

                filteredRow.push(matrix[row][col]);
            }

            filteredMatrix.push(filteredRow);
        }

        return filteredMatrix;
    }

    async #filterHiddenRowsAndColsAsync(
        matrix: unknown[][],
        startRow: number,
        endRow: number,
        startCol: number,
        endCol: number,
        sheet: SheetLike,
    ): Promise<unknown[][]> {
        const rowColManager = sheet.rowColManager;
        const CHUNK_SIZE = 50;

        if (!rowColManager) return matrix;

        const filteredMatrix: unknown[][] = [];
        let count = 0;

        for (let row = 0; row < matrix.length; row++) {
            const actualRow = startRow + row;

            if (rowColManager.isRowHidden(actualRow)) continue;

            const filteredRow: unknown[] = [];
            for (let col = 0; col < matrix[row].length; col++) {
                const actualCol = startCol + col;

                if (rowColManager.isColumnHidden(actualCol)) continue;

                filteredRow.push(matrix[row][col]);
                count++;

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

    #initWorker(): void {
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
        } catch (e: unknown) {
            errorHandler.warn(ERROR_CODE.CHART_DATA_EXTRACTOR_INIT_FAILED, "Failed to initialize worker", { error: e });
            this.#workerReady = false;
        }
    }

    destroy(): void {
        if (this.#worker) {
            this.#worker.terminate();
            this.#worker = null;
        }
        this.#pendingTasks.clear();
        this.#workerReady = false;
    }
}
