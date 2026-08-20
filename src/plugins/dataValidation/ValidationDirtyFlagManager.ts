import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

const DIRTY_FLAGS = Object.freeze({
    RULES_CHANGED: 1 << 0,
    VALUES_CHANGED: 1 << 1,
    STRUCTURE_CHANGED: 1 << 2,
    FORMULA_CHANGED: 1 << 3,
    FORMAT_CHANGED: 1 << 4,
    ALL: (1 << 5) - 1,
});

interface DirtyCell {
    row: number;
    col: number;
    flags: number;
    timestamp: number;
    source?: string;
}

export class ValidationDirtyFlagManager {
    #dirtyCells: Map<string, DirtyCell> = new Map();
    #changeListeners: Map<string, Set<(cells: DirtyCell[]) => void>> = new Map();
    #batchMode: boolean = false;
    #batchBuffer: DirtyCell[] = [];
    #maxDirtyCells: number = 10000;

    constructor(config: Record<string, any> = {}) {
        this.#maxDirtyCells = config.maxDirtyCells || 10000;
    }

    markDirty(row: number, col: number, flag: number = DIRTY_FLAGS.VALUES_CHANGED, source?: string): void {
        const key = `${row},${col}`;

        const existing = this.#dirtyCells.get(key);
        if (existing) {
            existing.flags |= flag;
            existing.timestamp = Date.now();
            if (source) existing.source = source;
        } else {
            const cell: DirtyCell = {
                row,
                col,
                flags: flag,
                timestamp: Date.now(),
                source,
            };

            if (this.#batchMode) {
                this.#batchBuffer.push(cell);
            } else {
                if (this.#dirtyCells.size >= this.#maxDirtyCells) {
                    this.#evictOldest();
                }
                this.#dirtyCells.set(key, cell);
            }
        }
    }

    markRangeDirty(
        startRow: number,
        startCol: number,
        endRow: number,
        endCol: number,
        flag: number = DIRTY_FLAGS.VALUES_CHANGED,
        source?: string,
    ): void {
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                this.markDirty(row, col, flag, source);
            }
        }
    }

    isDirty(row: number, col: number, flag?: number): boolean {
        const key = `${row},${col}`;
        const cell = this.#dirtyCells.get(key);

        if (!cell) return false;

        if (flag !== undefined) {
            return (cell.flags & flag) !== 0;
        }

        return true;
    }

    getDirtyCells(flag?: number): DirtyCell[] {
        const cells: DirtyCell[] = [];

        for (const cell of this.#dirtyCells.values()) {
            if (flag !== undefined) {
                if ((cell.flags & flag) !== 0) {
                    cells.push(cell);
                }
            } else {
                cells.push(cell);
            }
        }

        return cells.sort((a, b) => a.timestamp - b.timestamp);
    }

    clearDirtyCells(row?: number, col?: number): void {
        if (row !== undefined && col !== undefined) {
            this.#dirtyCells.delete(`${row},${col}`);
        } else {
            this.#dirtyCells.clear();
        }
    }

    enterBatchMode(): void {
        if (this.#batchMode) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[DirtyFlagManager] 已经在批量模式中");
            return;
        }
        this.#batchMode = true;
        this.#batchBuffer = [];
    }

    exitBatchMode(): DirtyCell[] {
        if (!this.#batchMode) {
            return [];
        }

        this.#batchMode = false;

        for (const cell of this.#batchBuffer) {
            const key = `${cell.row},${cell.col}`;
            const existing = this.#dirtyCells.get(key);

            if (existing) {
                existing.flags |= cell.flags;
                existing.timestamp = cell.timestamp;
                if (cell.source) existing.source = cell.source;
            } else {
                if (this.#dirtyCells.size >= this.#maxDirtyCells) {
                    this.#evictOldest();
                }
                this.#dirtyCells.set(key, cell);
            }
        }

        const flushed = [...this.#batchBuffer];
        this.#batchBuffer = [];

        this.#notifyListeners(flushed);

        return flushed;
    }

    addChangeListener(flag: number, listener: (cells: DirtyCell[]) => void): () => void {
        const key = String(flag);

        if (!this.#changeListeners.has(key)) {
            this.#changeListeners.set(key, new Set());
        }

        this.#changeListeners.get(key)!.add(listener);

        return () => {
            const listeners = this.#changeListeners.get(key);
            if (listeners) {
                listeners.delete(listener);
                if (listeners.size === 0) {
                    this.#changeListeners.delete(key);
                }
            }
        };
    }

    getDirtyCount(): number {
        return this.#dirtyCells.size;
    }

    hasFlag(row: number, col: number, flag: number): boolean {
        const cell = this.#dirtyCells.get(`${row},${col}`);
        if (!cell) return false;
        return (cell.flags & flag) !== 0;
    }

    addFlag(row: number, col: number, flag: number): void {
        this.markDirty(row, col, flag);
    }

    removeFlag(row: number, col: number, flag: number): void {
        const key = `${row},${col}`;
        const cell = this.#dirtyCells.get(key);
        if (cell) {
            cell.flags &= ~flag;
            if (cell.flags === 0) {
                this.#dirtyCells.delete(key);
            }
        }
    }

    clear(): void {
        this.#dirtyCells.clear();
        this.#batchBuffer = [];
    }

    destroy(): void {
        this.clear();
        this.#changeListeners.clear();
    }

    #evictOldest(): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;

        for (const [key, cell] of this.#dirtyCells) {
            if (cell.timestamp < oldestTime) {
                oldestTime = cell.timestamp;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.#dirtyCells.delete(oldestKey);
        }
    }

    #notifyListeners(cells: DirtyCell[]): void {
        for (const [flagKey, listeners] of this.#changeListeners) {
            const flag = parseInt(flagKey);
            const relevantCells = cells.filter((c) => (c.flags & flag) !== 0);

            if (relevantCells.length > 0) {
                for (const listener of listeners) {
                    try {
                        listener(relevantCells);
                    } catch (error: any) {
                        errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[DirtyFlagManager] 监听器回调执行失败:", error);
                    }
                }
            }
        }
    }
}

export { DIRTY_FLAGS };
