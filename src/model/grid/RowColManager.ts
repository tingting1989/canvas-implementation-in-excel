import { CONFIG } from "../../constants/config";
import type { CellRange } from "../types";

/** 可视范围（别名，语义化） */
export type VisibleRange = CellRange;

/**
 * 行列管理器类
 *
 * 负责管理表格中所有行的高度和列的宽度信息，
 * 提供行列尺寸设置、查询、插入、删除、移动等操作。
 * 支持行列隐藏/显示功能，以及基于像素坐标的行列位置查找。
 *
 * 主要功能：
 * - 行高和列宽的动态管理
 * - 行列的增删改操作
 * - 隐藏行/列的支持
 * - 像素坐标与行列号的相互转换
 * - 前缀和优化以加速范围查询
 */
export class RowColManager {
    /** 存储每行的实际高度值（索引 = 行号） */
    #rowHeights: number[] = [];

    /** 存储每列的实际宽度值（索引 = 列号） */
    #colWidths: number[] = [];

    /** 行高度的前缀和数组，用于快速计算任意行的Y坐标 */
    #rowPrefixSum: Float64Array | null = null;

    /** 列宽度的前缀和数组，用于快速计算任意列的X坐标 */
    #colPrefixSum: Float64Array | null = null;

    /** 标记行前缀和是否需要重新计算（脏标记） */
    #rowPrefixDirty: boolean = true;

    /** 标记列前缀和是否需要重新计算（脏标记） */
    #colPrefixDirty: boolean = true;

    /** 所有已分配行高的累计总高度（像素） */
    #allocatedHeight: number = 0;

    /** 所有已分配列宽的累计总宽度（像素） */
    #allocatedWidth: number = 0;

    /** 隐藏列集合（存储实际列号） */
    #hiddenCols: Set<number> = new Set();

    /** 隐藏列的原始宽度缓存（隐藏前保存，显示时恢复） */
    #originalColWidths: Map<number, number> = new Map();

    /** 隐藏行集合（存储实际行号） */
    #hiddenRows: Set<number> = new Set();

    /** 隐藏行的原始高度缓存（隐藏前保存，显示时恢复） */
    #originalRowHeights: Map<number, number> = new Map();

    /** 实际使用的列数（由 ensureSize 或 resetSize 设置） */
    #usedCols: number = 0;

    /** 实际使用的行数（由 ensureSize 或 resetSize 设置） */
    #usedRows: number = 0;

    /** 是否通过 resetSize() 显式设置了行列数（优先级最高） */
    #explicitlySized: boolean = false;

    /**
     * 获取表格的总高度（像素）
     * 包括已分配高度的行 + 未分配但使用的默认高度行
     */
    get totalHeight(): number {
        this.#ensureRowPrefix();
        const actualRowCount = Math.max(this.#usedRows, this.#rowHeights.length);
        return this.#allocatedHeight + Math.max(0, actualRowCount - this.#rowHeights.length) * CONFIG.DEFAULT_ROW_HEIGHT;
    }

    /**
     * 获取表格的总宽度（像素）
     */
    get totalWidth(): number {
        this.#ensureColPrefix();
        const actualColCount = Math.max(this.#usedCols, this.#colWidths.length);
        return this.#allocatedWidth + Math.max(0, actualColCount - this.#colWidths.length) * CONFIG.DEFAULT_COL_WIDTH;
    }

    /**
     * 获取当前管理的总行数
     */
    get rowCount(): number {
        return Math.max(this.#usedRows, this.#rowHeights.length, 1);
    }

    /**
     * 获取当前管理的总列数
     */
    get colCount(): number {
        return Math.max(this.#usedCols, this.#colWidths.length, 1);
    }

    /**
     * 获取实际列数（与 colCount 相同）
     */
    get realColCount(): number {
        return this.colCount;
    }

    /**
     * 获取可视列总数（排除隐藏列）
     */
    get visibleColCount(): number {
        const actualColCount = Math.max(this.#usedCols, this.#colWidths.length, 1);
        return actualColCount - this.#hiddenCols.size;
    }

    /**
     * 获取可视行总数（排除隐藏行）
     */
    get visibleRowCount(): number {
        const actualRowCount = Math.max(this.#usedRows, this.#rowHeights.length, 1);
        return actualRowCount - this.#hiddenRows.size;
    }

    /**
     * 获取已分配行高的行数
     */
    get allocatedRowCount(): number {
        return this.#rowHeights.length;
    }

    /**
     * 获取已分配列宽的列数
     */
    get allocatedColCount(): number {
        return this.#colWidths.length;
    }

    /**
     * 强制设置行列数（用于初始化配置，覆盖之前的值）
     *
     * @param rows - 要设置的行数（不超过 CONFIG.MAX_ROWS）
     * @param cols - 要设置的列数（不超过 CONFIG.MAX_COLS）
     */
    resetSize(rows: number, cols: number): void {
        rows = Math.min(rows, CONFIG.MAX_ROWS);
        cols = Math.min(cols, CONFIG.MAX_COLS);
        this.#usedRows = rows;
        this.#usedCols = cols;
        this.#explicitlySized = true;

        if (this.#rowHeights.length !== rows) {
            const oldLen = this.#rowHeights.length;
            this.#rowHeights.length = rows;
            if (rows > oldLen) {
                this.#rowHeights.fill(CONFIG.DEFAULT_ROW_HEIGHT, oldLen, rows);
            }
            this.#rowPrefixDirty = true;
        }

        if (this.#colWidths.length !== cols) {
            const oldLen = this.#colWidths.length;
            this.#colWidths.length = cols;
            if (cols > oldLen) {
                this.#colWidths.fill(CONFIG.DEFAULT_COL_WIDTH, oldLen, cols);
            }
            this.#colPrefixDirty = true;
        }
    }

    /**
     * 是否通过 resetSize() 显式设置了行列数
     */
    get isExplicitlySized(): boolean {
        return this.#explicitlySized;
    }

    /**
     * 确保数组大小足够容纳指定的行列数
     *
     * @param rows - 需要的最少行数
     * @param cols - 需要的最少列数
     */
    ensureSize(rows: number, cols: number): void {
        rows = Math.min(rows, CONFIG.MAX_ROWS);
        cols = Math.min(cols, CONFIG.MAX_COLS);

        if (this.#explicitlySized) return;

        this.#usedRows = Math.max(this.#usedRows, rows);
        this.#usedCols = Math.max(this.#usedCols, cols);

        if (this.#rowHeights.length < rows) {
            const oldLen = this.#rowHeights.length;
            this.#rowHeights.length = rows;
            this.#rowHeights.fill(CONFIG.DEFAULT_ROW_HEIGHT, oldLen, rows);
            this.#rowPrefixDirty = true;
        }

        if (this.#colWidths.length < cols) {
            const oldLen = this.#colWidths.length;
            this.#colWidths.length = cols;
            this.#colWidths.fill(CONFIG.DEFAULT_COL_WIDTH, oldLen, cols);
            this.#colPrefixDirty = true;
        }
    }

    /**
     * 设置指定行的高度
     *
     * @param row - 行索引（从0开始）
     * @param height - 行高（像素）
     */
    setRowHeight(row: number, height: number): void {
        this.ensureSize(row + 1, 0);
        if (this.#rowHeights[row] !== height) {
            this.#rowHeights[row] = height;
            this.#rowPrefixDirty = true;
        }
    }

    /**
     * 设置指定列的宽度
     *
     * @param col - 列索引（从0开始）
     * @param width - 列宽（像素）
     */
    setColWidth(col: number, width: number): void {
        this.ensureSize(0, col + 1);
        if (this.#colWidths[col] !== width) {
            this.#colWidths[col] = width;
            this.#colPrefixDirty = true;
        }
    }

    /**
     * 获取指定行的高度
     *
     * @param row - 行索引
     * @returns 行高（像素）
     */
    getRowHeight(row: number): number {
        if (row >= 0 && row < this.#rowHeights.length) return this.#rowHeights[row];
        if (this.#hiddenRows.has(row)) return 0;
        return CONFIG.DEFAULT_ROW_HEIGHT;
    }

    /**
     * 获取指定列的宽度
     *
     * @param col - 列索引
     * @returns 列宽（像素）
     */
    getColWidth(col: number): number {
        if (col >= 0 && col < this.#colWidths.length) return this.#colWidths[col];
        if (this.#hiddenCols.has(col)) return 0;
        return CONFIG.DEFAULT_COL_WIDTH;
    }

    /**
     * 获取指定行顶部边缘的 Y 坐标（像素）
     *
     * @param row - 行索引
     * @returns 该行顶部的 Y 坐标（像素）
     */
    getRowY(row: number): number {
        return this.#rawGetRowY(row);
    }

    /**
     * 内部方法：获取指定行顶部边缘的原始 Y 坐标
     *
     * @param row - 行索引
     * @returns Y 坐标（像素）
     */
    #rawGetRowY(row: number): number {
        if (row <= 0) return 0;
        this.#ensureRowPrefix();
        if (row <= this.#rowHeights.length) {
            return this.#rowPrefixSum![row - 1];
        }
        return this.#allocatedHeight + (row - this.#rowHeights.length) * CONFIG.DEFAULT_ROW_HEIGHT;
    }

    /**
     * 获取指定列左侧边缘的 X 坐标（像素）
     *
     * @param col - 列索引
     * @returns 该列左侧的 X 坐标（像素）
     */
    getColX(col: number): number {
        if (col <= 0) return 0;
        this.#ensureColPrefix();
        if (col <= this.#colWidths.length) {
            return this.#colPrefixSum![col - 1];
        }
        return this.#allocatedWidth + (col - this.#colWidths.length) * CONFIG.DEFAULT_COL_WIDTH;
    }

    /**
     * 根据 Y 像素坐标查找对应的行号
     *
     * @param y - Y 像素坐标
     * @returns 对应的行号
     */
    rowAt(y: number): number {
        if (y < 0) return 0;
        return this.rawRowAt(y);
    }

    /**
     * 根据全局像素 Y 坐标查找实际行号
     *
     * @param y - 全局像素 Y 坐标
     * @returns 实际行号
     */
    rawRowAt(y: number): number {
        if (y < 0) return 0;
        this.#ensureRowPrefix();
        let row: number;
        if (y < this.#allocatedHeight) {
            row = this.#binarySearch(this.#rowPrefixSum!, y);
        } else {
            const virtualY = y - this.#allocatedHeight;
            row = this.#rowHeights.length + Math.floor(virtualY / CONFIG.DEFAULT_ROW_HEIGHT);
        }

        while (row < CONFIG.MAX_ROWS && this.#hiddenRows.has(row)) {
            row++;
        }

        return Math.min(row, CONFIG.MAX_ROWS);
    }

    /**
     * 根据 X 像素坐标查找对应的列号
     *
     * @param x - X 像素坐标
     * @returns 对应的列号
     */
    colAt(x: number): number {
        if (x < 0) return 0;
        this.#ensureColPrefix();
        let col: number;
        if (x < this.#allocatedWidth) {
            col = this.#binarySearch(this.#colPrefixSum!, x);
        } else {
            const virtualX = x - this.#allocatedWidth;
            col = this.#colWidths.length + Math.floor(virtualX / CONFIG.DEFAULT_COL_WIDTH);
        }

        while (col < CONFIG.MAX_COLS && this.#hiddenCols.has(col)) {
            col++;
        }

        return Math.min(col, CONFIG.MAX_COLS);
    }

    /**
     * 二分搜索：在前缀和数组中查找指定位置对应的索引
     *
     * @param prefixSum - 前缀和数组
     * @param pos - 要查找的位置（像素值）
     * @returns 对应的索引
     */
    #binarySearch(prefixSum: Float64Array, pos: number): number {
        if (prefixSum.length === 0 || pos < prefixSum[0]) return 0;
        let lo = 0,
            hi = prefixSum.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (prefixSum[mid] <= pos) lo = mid;
            else hi = mid - 1;
        }
        return lo + 1;
    }

    /**
     * 在指定位置插入一行
     *
     * @param atRow - 要插入的行位置
     */
    insertRow(atRow: number): void {
        this.ensureSize(atRow + 1, 0);
        this.#rowHeights.splice(atRow, 0, CONFIG.DEFAULT_ROW_HEIGHT);

        this.#hiddenRows = new Set([...this.#hiddenRows].map((r) => (r >= atRow ? r + 1 : r)));
        this.#originalRowHeights = new Map([...this.#originalRowHeights].map(([r, h]) => [r >= atRow ? r + 1 : r, h]));
        this.#rowPrefixDirty = true;
    }

    /**
     * 在指定位置插入一列
     *
     * @param atCol - 要插入的列位置
     */
    insertCol(atCol: number): void {
        this.ensureSize(0, atCol + 1);
        this.#colWidths.splice(atCol, 0, CONFIG.DEFAULT_COL_WIDTH);

        this.#hiddenCols = new Set([...this.#hiddenCols].map((c) => (c >= atCol ? c + 1 : c)));
        this.#originalColWidths = new Map([...this.#originalColWidths].map(([c, w]) => [c >= atCol ? c + 1 : c, w]));
        this.#colPrefixDirty = true;
    }

    /**
     * 删除指定行
     *
     * @param row - 要删除的行索引
     */
    deleteRow(row: number): void {
        if (row < 0 || row >= this.#rowHeights.length) return;
        this.#rowHeights.splice(row, 1);

        this.#hiddenRows.delete(row);
        this.#originalRowHeights.delete(row);

        this.#hiddenRows = new Set([...this.#hiddenRows].map((r) => (r > row ? r - 1 : r)));
        this.#originalRowHeights = new Map([...this.#originalRowHeights].map(([r, h]) => [r > row ? r - 1 : r, h]));
        this.#rowPrefixDirty = true;
    }

    /**
     * 删除指定列
     *
     * @param col - 要删除的列索引
     */
    deleteCol(col: number): void {
        if (col < 0 || col >= this.#colWidths.length) return;
        this.#colWidths.splice(col, 1);

        this.#hiddenCols.delete(col);
        this.#originalColWidths.delete(col);

        this.#hiddenCols = new Set([...this.#hiddenCols].map((c) => (c > col ? c - 1 : c)));
        this.#originalColWidths = new Map([...this.#originalColWidths].map(([c, w]) => [c > col ? c - 1 : c, w]));
        this.#colPrefixDirty = true;
    }

    /**
     * 计算移动操作后的新索引
     *
     * @param idx - 原始索引
     * @param from - 起始位置
     * @param to - 目标位置
     * @returns 移动后的新索引
     */
    #shiftIndex(idx: number, from: number, to: number): number {
        if (idx === from) return to;
        if (from < to) {
            return idx > from && idx <= to ? idx - 1 : idx;
        }
        return idx >= to && idx < from ? idx + 1 : idx;
    }

    /**
     * 移动一列到新位置
     *
     * @param fromCol - 要移动的列的当前位置
     * @param toCol - 目标位置
     */
    moveCol(fromCol: number, toCol: number): void {
        if (fromCol === toCol) return;
        this.ensureSize(0, Math.max(fromCol, toCol) + 1);

        const [width] = this.#colWidths.splice(fromCol, 1);
        this.#colWidths.splice(toCol, 0, width);

        this.#hiddenCols = new Set([...this.#hiddenCols].map((c) => this.#shiftIndex(c, fromCol, toCol)));
        this.#originalColWidths = new Map([...this.#originalColWidths].map(([c, w]) => [this.#shiftIndex(c, fromCol, toCol), w]));

        this.#colPrefixDirty = true;
    }

    /**
     * 移动一行到新位置
     *
     * @param fromRow - 要移动的行的当前位置
     * @param toRow - 目标位置
     */
    moveRow(fromRow: number, toRow: number): void {
        if (fromRow === toRow) return;
        this.ensureSize(Math.max(fromRow, toRow) + 1, 0);

        const [height] = this.#rowHeights.splice(fromRow, 1);
        this.#rowHeights.splice(toRow, 0, height);

        this.#hiddenRows = new Set([...this.#hiddenRows].map((r) => this.#shiftIndex(r, fromRow, toRow)));
        this.#originalRowHeights = new Map([...this.#originalRowHeights].map(([r, h]) => [this.#shiftIndex(r, fromRow, toRow), h]));

        this.#rowPrefixDirty = true;
    }

    /**
     * 获取可视区域内的行列范围
     *
     * @param viewX - 视口左侧 X 坐标
     * @param viewY - 视口顶部 Y 坐标
     * @param viewW - 视口宽度
     * @param viewH - 视口高度
     * @returns 可视范围
     */
    getVisibleRange(viewX: number, viewY: number, viewW: number, viewH: number): VisibleRange {
        const topCol = this.colAt(viewX);
        const topRow = this.rowAt(viewY);
        const bottomCol = Math.min(this.colCount, this.colAt(viewX + viewW) + 1);
        const bottomRow = Math.min(this.rowCount, this.rowAt(viewY + viewH) + 1);
        return { topRow, topCol, bottomRow, bottomCol };
    }

    /**
     * 隐藏指定列（将宽度设为 0）
     *
     * @param col - 要隐藏的列索引
     */
    hideColumn(col: number): void {
        if (col < 0 || this.#hiddenCols.has(col)) return;
        this.ensureSize(0, col + 1);
        const currentWidth = this.#colWidths[col];
        this.#originalColWidths.set(col, currentWidth);
        this.#colWidths[col] = 0;
        this.#hiddenCols.add(col);
        this.#colPrefixDirty = true;
    }

    /**
     * 显示指定列（恢复原始宽度）
     *
     * @param col - 要显示的列索引
     */
    showColumn(col: number): void {
        if (!this.#hiddenCols.has(col)) return;
        this.#colWidths[col] = this.#originalColWidths.get(col) ?? CONFIG.DEFAULT_COL_WIDTH;
        this.#originalColWidths.delete(col);
        this.#hiddenCols.delete(col);
        this.#colPrefixDirty = true;
    }

    /**
     * 判断指定列是否隐藏
     *
     * @param col - 列索引
     * @returns 是否隐藏
     */
    isColumnHidden(col: number): boolean {
        return this.#hiddenCols.has(col);
    }

    /**
     * 获取所有隐藏列索引（升序）
     *
     * @returns 隐藏列索引数组
     */
    getHiddenColumns(): number[] {
        return [...this.#hiddenCols].sort((a, b) => a - b);
    }

    /**
     * 清除所有隐藏列，恢复全量显示
     */
    clearHiddenColumns(): void {
        for (const col of this.#hiddenCols) {
            const originalWidth = this.#originalColWidths.get(col) ?? CONFIG.DEFAULT_COL_WIDTH;
            if (col < this.#colWidths.length) {
                this.#colWidths[col] = originalWidth;
            }
        }
        this.#hiddenCols.clear();
        this.#originalColWidths.clear();
        this.#colPrefixDirty = true;
    }

    /**
     * 检查是否存在隐藏列
     */
    get hasHiddenColumns(): boolean {
        return this.#hiddenCols.size > 0;
    }

    /**
     * 隐藏指定行（将高度设为 0）
     *
     * @param row - 要隐藏的行索引
     */
    hideRow(row: number): void {
        if (row < 0 || this.#hiddenRows.has(row)) return;
        this.ensureSize(row + 1, 0);
        const currentHeight = this.#rowHeights[row];
        this.#originalRowHeights.set(row, currentHeight);
        this.#rowHeights[row] = 0;
        this.#hiddenRows.add(row);
        this.#rowPrefixDirty = true;
    }

    /**
     * 显示指定行（恢复原始高度）
     *
     * @param row - 要显示的行索引
     */
    showRow(row: number): void {
        if (!this.#hiddenRows.has(row)) return;
        const originalHeight = this.#originalRowHeights.get(row) ?? CONFIG.DEFAULT_ROW_HEIGHT;
        this.#rowHeights[row] = originalHeight;
        this.#originalRowHeights.delete(row);
        this.#hiddenRows.delete(row);
        this.#rowPrefixDirty = true;
    }

    /**
     * 判断指定行是否隐藏
     *
     * @param row - 行索引
     * @returns 是否隐藏
     */
    isRowHidden(row: number): boolean {
        return this.#hiddenRows.has(row);
    }

    /**
     * 获取所有隐藏行索引（升序）
     *
     * @returns 隐藏行索引数组
     */
    getHiddenRows(): number[] {
        return [...this.#hiddenRows].sort((a, b) => a - b);
    }

    /**
     * 清除所有隐藏行，恢复全量显示
     */
    clearHiddenRows(): void {
        for (const row of this.#hiddenRows) {
            const originalHeight = this.#originalRowHeights.get(row) ?? CONFIG.DEFAULT_ROW_HEIGHT;
            if (row < this.#rowHeights.length) {
                this.#rowHeights[row] = originalHeight;
            }
        }
        this.#hiddenRows.clear();
        this.#originalRowHeights.clear();
        this.#rowPrefixDirty = true;
    }

    /**
     * 检查是否存在隐藏行
     */
    get hasHiddenRows(): boolean {
        return this.#hiddenRows.size > 0;
    }

    /**
     * 重建前缀和数组
     *
     * @param sizes - 尺寸数组
     * @returns 前缀和数组及总分配值
     */
    #rebuildPrefix(sizes: number[], dirtyFlag: boolean): { prefix: Float64Array; allocated: number } {
        const n = sizes.length;
        if (n > 0) {
            const prefix = new Float64Array(n);
            let sum = 0;
            for (let i = 0; i < n; i++) {
                sum += sizes[i];
                prefix[i] = sum;
            }
            return { prefix, allocated: sum };
        }
        return { prefix: new Float64Array(0), allocated: 0 };
    }

    /**
     * 确保行前缀和数组是最新的
     */
    #ensureRowPrefix(): void {
        if (!this.#rowPrefixDirty) return;
        const { prefix, allocated } = this.#rebuildPrefix(this.#rowHeights, this.#rowPrefixDirty);
        this.#rowPrefixSum = prefix;
        this.#allocatedHeight = allocated;
        this.#rowPrefixDirty = false;
    }

    /**
     * 确保列前缀和数组是最新的
     */
    #ensureColPrefix(): void {
        if (!this.#colPrefixDirty) return;
        const { prefix, allocated } = this.#rebuildPrefix(this.#colWidths, this.#colPrefixDirty);
        this.#colPrefixSum = prefix;
        this.#allocatedWidth = allocated;
        this.#colPrefixDirty = false;
    }
}
