import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

interface DirtyEntry {
    row: number;
    col: number;
    reason: string;
    timestamp: number;
    priority: number;
}

/**
 * 验证脏标记管理器
 *
 * 跟踪需要重新验证的单元格，支持批量标记和优先级排序。
 * 当单元格值发生变化或验证规则更新时，相关单元格会被标记为"脏"，
 * 等待下一次验证周期重新校验。
 */
export class ValidationDirtyFlagManager {
    #dirtyCells: Map<string, DirtyEntry> = new Map();
    #maxBatchSize: number = 1000;
    #processing: boolean = false;

    markDirty(row: number, col: number, reason: string = "value_change", priority: number = 0): void {
        const key = `${row},${col}`;
        const existing = this.#dirtyCells.get(key);

        if (existing) {
            existing.priority = Math.max(existing.priority, priority);
            existing.timestamp = Date.now();
            if (reason) existing.reason = reason;
        } else {
            this.#dirtyCells.set(key, {
                row,
                col,
                reason,
                timestamp: Date.now(),
                priority,
            });
        }
    }

    markRangeDirty(startRow: number, startCol: number, endRow: number, endCol: number, reason: string = "range_change"): void {
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                this.markDirty(row, col, reason);
            }
        }
    }

    isDirty(row: number, col: number): boolean {
        return this.#dirtyCells.has(`${row},${col}`);
    }

    getDirtyCells(): DirtyEntry[] {
        return Array.from(this.#dirtyCells.values()).sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            return a.timestamp - b.timestamp;
        });
    }

    getDirtyCellCount(): number {
        return this.#dirtyCells.size;
    }

    clearDirty(row: number, col: number): void {
        this.#dirtyCells.delete(`${row},${col}`);
    }

    clearAllDirty(): void {
        this.#dirtyCells.clear();
    }

    getBatch(maxSize?: number): DirtyEntry[] {
        const size = Math.min(maxSize ?? this.#maxBatchSize, this.#dirtyCells.size);
        const sorted = this.getDirtyCells();
        return sorted.slice(0, size);
    }

    markBatchProcessed(entries: DirtyEntry[]): void {
        for (const entry of entries) {
            this.#dirtyCells.delete(`${entry.row},${entry.col}`);
        }
    }

    isProcessing(): boolean {
        return this.#processing;
    }

    setProcessing(processing: boolean): void {
        this.#processing = processing;
    }

    getStats(): { dirtyCount: number; processing: boolean } {
        return {
            dirtyCount: this.#dirtyCells.size,
            processing: this.#processing,
        };
    }
}
