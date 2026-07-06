import { ERROR_CODE, errorHandler } from "@/core/ErrorHandler.js";

import { CONFIG } from "../../constants/config";

export class RowColManager {
    #rowHeights = [];
    #colWidths = [];
    #rowPrefixSum = null;
    #colPrefixSum = null;
    #rowPrefixDirty = true;
    #colPrefixDirty = true;
    #allocatedHeight = 0;
    #allocatedWidth = 0;

    /** 隐藏列集合（存储实际列号） */
    #hiddenCols = new Set();

    /** 隐藏列的原始宽度缓存（隐藏前保存，显示时恢复） */
    #originalColWidths = new Map();

    /** 隐藏行集合（存储实际行号） */
    #hiddenRows = new Set();

    /** 隐藏行的原始高度缓存（隐藏前保存，显示时恢复） */
    #originalRowHeights = new Map();

    /** 实际使用的列数（由 ensureSize 设置） */
    #usedCols = 0;

    /** 实际使用的行数（由 ensureSize 设置） */
    #usedRows = 0;

    /** 是否通过 resetSize() 显式设置了行列数（优先级最高） */
    #explicitlySized = false;

    get totalHeight() {
        this.#ensureRowPrefix();

        // 使用实际行数计算总高度
        const actualRowCount = Math.max(this.#usedRows, this.#rowHeights.length);
        return this.#allocatedHeight + Math.max(0, actualRowCount - this.#rowHeights.length) * CONFIG.DEFAULT_ROW_HEIGHT;
    }

    get totalWidth() {
        this.#ensureColPrefix();

        // 使用实际列数计算总宽度
        const actualColCount = Math.max(this.#usedCols, this.#colWidths.length);
        return this.#allocatedWidth + Math.max(0, actualColCount - this.#colWidths.length) * CONFIG.DEFAULT_COL_WIDTH;
    }

    get rowCount() {
        return Math.max(this.#usedRows, this.#rowHeights.length, 1);
    }

    get colCount() {
        return Math.max(this.#usedCols, this.#colWidths.length, 1);
    }

    get realColCount() {
        return this.colCount;
    }

    /** 可视列总数（排除隐藏列） */
    get visibleColCount() {
        const actualColCount = Math.max(this.#usedCols, this.#colWidths.length, 1);
        return actualColCount - this.#hiddenCols.size;
    }

    /** 可视行总数（排除隐藏行） */
    get visibleRowCount() {
        const actualRowCount = Math.max(this.#usedRows, this.#rowHeights.length, 1);
        return actualRowCount - this.#hiddenRows.size;
    }

    get allocatedRowCount() {
        return this.#rowHeights.length;
    }

    get allocatedColCount() {
        return this.#colWidths.length;
    }

    /**
     * 强制设置行列数（用于初始化配置，覆盖之前的值）
     * @param {number} rows
     * @param {number} cols
     */
    resetSize(rows, cols) {
        rows = Math.min(rows, CONFIG.MAX_ROWS);
        cols = Math.min(cols, CONFIG.MAX_COLS);
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[RowColManager] resetSize: ${rows}rows x ${cols}cols (force override)`);
        this.#usedRows = rows;
        this.#usedCols = cols;
        this.#explicitlySized = true; // 标记为显式配置

        // 强制调整数组长度（可以扩大或缩小）
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

        errorHandler.debug(
            ERROR_CODE.DEBUG_LOG,
            `[RowColManager] resetSize complete: rowHeights.len=${this.#rowHeights.length}, colWidths.len=${this.#colWidths.length}, explicitlySized=${this.#explicitlySized}`,
        );
    }

    /** 是否通过 resetSize() 显式设置了行列数 */
    get isExplicitlySized() {
        return this.#explicitlySized;
    }

    ensureSize(rows, cols) {
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

    setRowHeight(row, height) {
        this.ensureSize(row + 1, 0);
        if (this.#rowHeights[row] !== height) {
            this.#rowHeights[row] = height;
            this.#rowPrefixDirty = true;
        }
    }

    setColWidth(col, width) {
        this.ensureSize(0, col + 1);
        if (this.#colWidths[col] !== width) {
            this.#colWidths[col] = width;
            this.#colPrefixDirty = true;
        }
    }

    getRowHeight(row) {
        if (row >= 0 && row < this.#rowHeights.length) return this.#rowHeights[row];
        if (this.#hiddenRows.has(row)) return 0;
        return CONFIG.DEFAULT_ROW_HEIGHT;
    }

    getColWidth(col) {
        if (col >= 0 && col < this.#colWidths.length) return this.#colWidths[col];
        if (this.#hiddenCols.has(col)) return 0;
        return CONFIG.DEFAULT_COL_WIDTH;
    }

    getRowY(row) {
        return this.#rawGetRowY(row);
    }



    #rawGetRowY(row) {
        if (row <= 0) return 0;
        this.#ensureRowPrefix();
        if (row <= this.#rowHeights.length) {
            return this.#rowPrefixSum[row - 1];
        }
        return this.#allocatedHeight + (row - this.#rowHeights.length) * CONFIG.DEFAULT_ROW_HEIGHT;
    }

    getColX(col) {
        if (col <= 0) return 0;
        this.#ensureColPrefix();
        if (col <= this.#colWidths.length) {
            return this.#colPrefixSum[col - 1];
        }
        return this.#allocatedWidth + (col - this.#colWidths.length) * CONFIG.DEFAULT_COL_WIDTH;
    }

    rowAt(y) {
        if (y < 0) return 0;
        return this.rawRowAt(y);
    }

    /**
     * 根据全局像素 Y 坐标查找实际行号（不经过页面偏移转换）
     * @param {number} y - 全局像素 Y 坐标
     * @returns {number} 实际行号
     */
    rawRowAt(y) {
        if (y < 0) return 0;
        this.#ensureRowPrefix();
        let row;
        if (y < this.#allocatedHeight) {
            row = this.#binarySearch(this.#rowPrefixSum, y);
        } else {
            const virtualY = y - this.#allocatedHeight;
            row = this.#rowHeights.length + Math.floor(virtualY / CONFIG.DEFAULT_ROW_HEIGHT);
        }
        while (row < CONFIG.MAX_ROWS && this.#hiddenRows.has(row)) {
            row++;
        }

        // rawRowAt 返回全局坐标对应的实际行号，不应受限于当前数据范围
        // 分页模式下可能需要访问超出 #rowHeights.length 的虚拟行号
        return Math.min(row, CONFIG.MAX_ROWS);
    }

    colAt(x) {
        if (x < 0) return 0;
        this.#ensureColPrefix();
        let col;
        if (x < this.#allocatedWidth) {
            col = this.#binarySearch(this.#colPrefixSum, x);
        } else {
            const virtualX = x - this.#allocatedWidth;
            col = this.#colWidths.length + Math.floor(virtualX / CONFIG.DEFAULT_COL_WIDTH);
        }
        while (col < CONFIG.MAX_COLS && this.#hiddenCols.has(col)) {
            col++;
        }
        // colAt 返回全局坐标对应的实际列号，不应受限于当前数据范围
        return Math.min(col, CONFIG.MAX_COLS);
    }

    #binarySearch(prefixSum, pos) {
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

    insertRow(atRow) {
        this.ensureSize(atRow + 1, 0);
        this.#rowHeights.splice(atRow, 0, CONFIG.DEFAULT_ROW_HEIGHT);
        this.#hiddenRows = new Set([...this.#hiddenRows].map((r) => (r >= atRow ? r + 1 : r)));
        this.#originalRowHeights = new Map([...this.#originalRowHeights].map(([r, h]) => [r >= atRow ? r + 1 : r, h]));
        this.#rowPrefixDirty = true;
    }

    insertCol(atCol) {
        this.ensureSize(0, atCol + 1);
        this.#colWidths.splice(atCol, 0, CONFIG.DEFAULT_COL_WIDTH);
        this.#hiddenCols = new Set([...this.#hiddenCols].map((c) => (c >= atCol ? c + 1 : c)));
        this.#originalColWidths = new Map([...this.#originalColWidths].map(([c, w]) => [c >= atCol ? c + 1 : c, w]));
        this.#colPrefixDirty = true;
    }

    deleteRow(row) {
        if (row < 0 || row >= this.#rowHeights.length) return;
        this.#rowHeights.splice(row, 1);
        this.#hiddenRows.delete(row);
        this.#originalRowHeights.delete(row);
        this.#hiddenRows = new Set([...this.#hiddenRows].map((r) => (r > row ? r - 1 : r)));
        this.#originalRowHeights = new Map([...this.#originalRowHeights].map(([r, h]) => [r > row ? r - 1 : r, h]));
        this.#rowPrefixDirty = true;
    }

    deleteCol(col) {
        if (col < 0 || col >= this.#colWidths.length) return;
        this.#colWidths.splice(col, 1);
        this.#hiddenCols.delete(col);
        this.#originalColWidths.delete(col);
        this.#hiddenCols = new Set([...this.#hiddenCols].map((c) => (c > col ? c - 1 : c)));
        this.#originalColWidths = new Map([...this.#originalColWidths].map(([c, w]) => [c > col ? c - 1 : c, w]));
        this.#colPrefixDirty = true;
    }

    #shiftIndex(idx, from, to) {
        if (idx === from) return to;
        if (from < to) {
            return idx > from && idx <= to ? idx - 1 : idx;
        }
        return idx >= to && idx < from ? idx + 1 : idx;
    }

    moveCol(fromCol, toCol) {
        if (fromCol === toCol) return;
        this.ensureSize(0, Math.max(fromCol, toCol) + 1);
        const [width] = this.#colWidths.splice(fromCol, 1);
        this.#colWidths.splice(toCol, 0, width);

        this.#hiddenCols = new Set([...this.#hiddenCols].map((c) => this.#shiftIndex(c, fromCol, toCol)));
        this.#originalColWidths = new Map([...this.#originalColWidths].map(([c, w]) => [this.#shiftIndex(c, fromCol, toCol), w]));

        this.#colPrefixDirty = true;
    }

    moveRow(fromRow, toRow) {
        if (fromRow === toRow) return;
        this.ensureSize(Math.max(fromRow, toRow) + 1, 0);
        const [height] = this.#rowHeights.splice(fromRow, 1);
        this.#rowHeights.splice(toRow, 0, height);

        this.#hiddenRows = new Set([...this.#hiddenRows].map((r) => this.#shiftIndex(r, fromRow, toRow)));
        this.#originalRowHeights = new Map([...this.#originalRowHeights].map(([r, h]) => [this.#shiftIndex(r, fromRow, toRow), h]));

        this.#rowPrefixDirty = true;
    }

    getVisibleRange(viewX, viewY, viewW, viewH) {
        const topCol = this.colAt(viewX);
        const topRow = this.rowAt(viewY);
        const bottomCol = Math.min(this.colCount, this.colAt(viewX + viewW) + 1);
        const bottomRow = Math.min(this.rowCount, this.rowAt(viewY + viewH) + 1);
        return { topRow, topCol, bottomRow, bottomCol };
    }

    /**
     * 隐藏指定列（将宽度设为 0）
     * @param {number} col - 要隐藏的列索引
     */
    hideColumn(col) {
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
     * @param {number} col - 要显示的列索引
     */
    showColumn(col) {
        if (!this.#hiddenCols.has(col)) return;
        const originalWidth = this.#originalColWidths.get(col) ?? CONFIG.DEFAULT_COL_WIDTH;
        this.#colWidths[col] = originalWidth;
        this.#originalColWidths.delete(col);
        this.#hiddenCols.delete(col);
        this.#colPrefixDirty = true;
    }

    /**
     * 判断指定列是否隐藏
     * @param {number} col - 列索引
     * @returns {boolean}
     */
    isColumnHidden(col) {
        return this.#hiddenCols.has(col);
    }

    /**
     * 获取所有隐藏列索引
     * @returns {number[]} 升序排列
     */
    getHiddenColumns() {
        return [...this.#hiddenCols].sort((a, b) => a - b);
    }

    /**
     * 清除所有隐藏列，恢复全量显示
     */
    clearHiddenColumns() {
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

    /** 隐藏列集合是否非空 */
    get hasHiddenColumns() {
        return this.#hiddenCols.size > 0;
    }

    /**
     * 隐藏指定行（将高度设为 0）
     * @param {number} row - 要隐藏的行索引
     */
    hideRow(row) {
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
     * @param {number} row - 要显示的行索引
     */
    showRow(row) {
        if (!this.#hiddenRows.has(row)) return;
        const originalHeight = this.#originalRowHeights.get(row) ?? CONFIG.DEFAULT_ROW_HEIGHT;
        this.#rowHeights[row] = originalHeight;
        this.#originalRowHeights.delete(row);
        this.#hiddenRows.delete(row);
        this.#rowPrefixDirty = true;
    }

    /**
     * 判断指定行是否隐藏
     * @param {number} row - 行索引
     * @returns {boolean}
     */
    isRowHidden(row) {
        return this.#hiddenRows.has(row);
    }

    /**
     * 获取所有隐藏行索引
     * @returns {number[]} 升序排列
     */
    getHiddenRows() {
        return [...this.#hiddenRows].sort((a, b) => a - b);
    }

    /**
     * 清除所有隐藏行，恢复全量显示
     */
    clearHiddenRows() {
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

    /** 隐藏行集合是否非空 */
    get hasHiddenRows() {
        return this.#hiddenRows.size > 0;
    }

    #rebuildPrefix(sizes, dirtyFlag) {
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

    #ensureRowPrefix() {
        if (!this.#rowPrefixDirty) return;
        const { prefix, allocated } = this.#rebuildPrefix(this.#rowHeights);
        this.#rowPrefixSum = prefix;
        this.#allocatedHeight = allocated;
        this.#rowPrefixDirty = false;
    }

    #ensureColPrefix() {
        if (!this.#colPrefixDirty) return;
        const { prefix, allocated } = this.#rebuildPrefix(this.#colWidths);
        this.#colPrefixSum = prefix;
        this.#allocatedWidth = allocated;
        this.#colPrefixDirty = false;
    }
}