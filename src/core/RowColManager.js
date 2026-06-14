import {CONFIG} from "../constants/config";

export class RowColManager {
    #rowHeights = [];
    #colWidths = [];
    #rowPrefixSum = null;
    #colPrefixSum = null;
    #rowPrefixDirty = true;
    #colPrefixDirty = true;
    #allocatedHeight = 0;
    #allocatedWidth = 0;

    #pageStartRow = -1;
    #pageEndRow = -1;

    /** 隐藏列集合（存储实际列号） */
    #hiddenCols = new Set();
    /** 可视列前缀和（仅包含非隐藏列的宽度累加） */
    #visibleColPrefixSum = null;
    /** 可视列宽度数组（仅包含非隐藏列） */
    #visibleColWidths = null;
    /** 可视列 → 实际列 映射表 */
    #visibleToRealMap = null;
    /** 实际列 → 可视列 映射表（隐藏列为 -1） */
    #realToVisibleMap = null;
    /** 可视列前缀和是否需要重建 */
    #visibleColDirty = true;
    /** 可视列总宽度缓存 */
    #visibleTotalWidth = 0;
    /** 可视列数量缓存 */
    #visibleColCountCache = 0;

    get totalHeight() {
        if (this.#pageStartRow >= 0 && this.#pageEndRow > this.#pageStartRow) {
            const startY = this.#rawGetRowY(this.#pageStartRow);
            const endY = this.#rawGetRowY(this.#pageEndRow);
            return endY - startY;
        }
        this.#ensureRowPrefix();
        return this.#allocatedHeight + (CONFIG.MAX_ROWS - this.#rowHeights.length) * CONFIG.DEFAULT_ROW_HEIGHT;
    }

    get totalWidth() {
        if (this.#hiddenCols.size > 0) {
            this.#ensureVisibleColPrefix();
            return this.#visibleTotalWidth;
        }
        this.#ensureColPrefix();
        return this.#allocatedWidth + (CONFIG.MAX_COLS - this.#colWidths.length) * CONFIG.DEFAULT_COL_WIDTH;
    }

    get rowCount() {
        if (this.#pageStartRow >= 0 && this.#pageEndRow > this.#pageStartRow) {
            return this.#pageEndRow - this.#pageStartRow;
        }
        return CONFIG.MAX_ROWS;
    }

    get colCount() {
        if (this.#hiddenCols.size > 0) {
            this.#ensureVisibleColPrefix();
            return this.#visibleColCountCache;
        }
        return CONFIG.MAX_COLS;
    }

    get realColCount() {
        return CONFIG.MAX_COLS;
    }

    /** 可视列总数（排除隐藏列） */
    get visibleColCount() {
        if (this.#hiddenCols.size > 0) {
            this.#ensureVisibleColPrefix();
            return this.#visibleColCountCache;
        }
        return CONFIG.MAX_COLS;
    }

    get allocatedRowCount() {
        return this.#rowHeights.length;
    }

    get allocatedColCount() {
        return this.#colWidths.length;
    }

    ensureSize(rows, cols) {
        rows = Math.min(rows, CONFIG.MAX_ROWS);
        cols = Math.min(cols, CONFIG.MAX_COLS);
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
            this.#visibleColDirty = true;
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
            this.#visibleColDirty = true;
        }
    }

    getRowHeight(row) {
        if (this.#pageStartRow >= 0 && this.#pageEndRow > this.#pageStartRow) {
            const realRow = this.#pageStartRow + row;
            if (realRow >= 0 && realRow < this.#rowHeights.length) return this.#rowHeights[realRow];
            return CONFIG.DEFAULT_ROW_HEIGHT;
        }
        if (row >= 0 && row < this.#rowHeights.length) return this.#rowHeights[row];
        return CONFIG.DEFAULT_ROW_HEIGHT;
    }

    /**
     * 获取列宽
     * @param {number} col - 列索引（有隐藏列时为可视列号，否则为实际列号）
     */
    getColWidth(col) {
        if (this.#hiddenCols.size > 0) {
            this.#ensureVisibleColPrefix();
            if (col >= 0 && col < this.#visibleColWidths.length) return this.#visibleColWidths[col];
            return CONFIG.DEFAULT_COL_WIDTH;
        }
        if (col >= 0 && col < this.#colWidths.length) return this.#colWidths[col];
        return CONFIG.DEFAULT_COL_WIDTH;
    }

    getRowY(row) {
        if (this.#pageStartRow >= 0 && this.#pageEndRow > this.#pageStartRow) {
            const realRow = this.#pageStartRow + row;
            const pageStartY = this.#rawGetRowY(this.#pageStartRow);
            return this.#rawGetRowY(realRow) - pageStartY;
        }
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

    /**
     * 获取列的 X 坐标
     * @param {number} col - 列索引（有隐藏列时为可视列号，否则为实际列号）
     */
    getColX(col) {
        if (col <= 0) return 0;

        if (this.#hiddenCols.size > 0) {
            this.#ensureVisibleColPrefix();
            if (col <= this.#visibleColPrefixSum.length) {
                return this.#visibleColPrefixSum[col - 1];
            }
            return this.#visibleTotalWidth + (col - this.#visibleColPrefixSum.length) * CONFIG.DEFAULT_COL_WIDTH;
        }

        this.#ensureColPrefix();
        if (col <= this.#colWidths.length) {
            return this.#colPrefixSum[col - 1];
        }
        return this.#allocatedWidth + (col - this.#colWidths.length) * CONFIG.DEFAULT_COL_WIDTH;
    }

    rowAt(y) {
        if (y < 0) return 0;
        if (this.#pageStartRow >= 0 && this.#pageEndRow > this.#pageStartRow) {
            const pageStartY = this.#rawGetRowY(this.#pageStartRow);
            const realRow = this.#rawRowAt(y + pageStartY);
            return Math.max(0, Math.min(realRow - this.#pageStartRow, this.#pageEndRow - this.#pageStartRow - 1));
        }
        return this.#rawRowAt(y);
    }

    #rawRowAt(y) {
        if (y < 0) return 0;
        this.#ensureRowPrefix();
        if (y < this.#allocatedHeight) {
            return this.#binarySearch(this.#rowPrefixSum, y);
        }
        const virtualY = y - this.#allocatedHeight;
        return this.#rowHeights.length + Math.floor(virtualY / CONFIG.DEFAULT_ROW_HEIGHT);
    }

    /**
     * 根据 X 坐标获取列索引
     * @param {number} x - 像素坐标
     * @returns {number} 列索引（有隐藏列时返回可视列号）
     */
    colAt(x) {
        if (x < 0) return 0;

        if (this.#hiddenCols.size > 0) {
            this.#ensureVisibleColPrefix();
            if (x < this.#visibleTotalWidth && this.#visibleColPrefixSum.length > 0) {
                return this.#binarySearch(this.#visibleColPrefixSum, x);
            }
            if (x >= this.#visibleTotalWidth) {
                const virtualX = x - this.#visibleTotalWidth;
                return this.#visibleColPrefixSum.length + Math.floor(virtualX / CONFIG.DEFAULT_COL_WIDTH);
            }
            return 0;
        }

        this.#ensureColPrefix();
        if (x < this.#allocatedWidth) {
            return this.#binarySearch(this.#colPrefixSum, x);
        }
        const virtualX = x - this.#allocatedWidth;
        return this.#colWidths.length + Math.floor(virtualX / CONFIG.DEFAULT_COL_WIDTH);
    }

    #binarySearch(prefixSum, pos) {
        if (prefixSum.length === 0 || pos < prefixSum[0]) return 0;
        let lo = 0, hi = prefixSum.length - 1;
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
        this.#rowPrefixDirty = true;
    }

    insertCol(atCol) {
        this.ensureSize(0, atCol + 1);
        this.#colWidths.splice(atCol, 0, CONFIG.DEFAULT_COL_WIDTH);
        this.#colPrefixDirty = true;
        this.#visibleColDirty = true;
    }

    deleteRow(row) {
        if (row < 0 || row >= this.#rowHeights.length) return;
        this.#rowHeights.splice(row, 1);
        this.#rowPrefixDirty = true;
    }

    deleteCol(col) {
        if (col < 0 || col >= this.#colWidths.length) return;
        this.#colWidths.splice(col, 1);
        this.#colPrefixDirty = true;
        this.#visibleColDirty = true;
    }

    moveCol(fromCol, toCol) {
        if (fromCol === toCol) return;
        this.ensureSize(0, Math.max(fromCol, toCol) + 1);
        const [width] = this.#colWidths.splice(fromCol, 1);
        this.#colWidths.splice(toCol, 0, width);
        this.#colPrefixDirty = true;
        this.#visibleColDirty = true;
    }

    getVisibleRange(viewX, viewY, viewW, viewH) {
        const sc = this.colAt(viewX);
        const sr = this.rowAt(viewY);
        const ec = Math.min(this.colCount, this.colAt(viewX + viewW) + 1);
        const er = Math.min(this.rowCount, this.rowAt(viewY + viewH) + 1);
        return { sr, sc, er, ec };
    }

    setPaginationBounds(startRow, endRow) {
        this.#pageStartRow = startRow;
        this.#pageEndRow = endRow;
        this.#rowPrefixDirty = true;
    }

    clearPaginationBounds() {
        this.#pageStartRow = -1;
        this.#pageEndRow = -1;
        this.#rowPrefixDirty = true;
    }

    get pageStartRow() { return this.#pageStartRow; }
    get pageEndRow() { return this.#pageEndRow; }

    /**
     * 设置隐藏列集合
     * @param {Set<number>} hiddenSet - 隐藏列的实际列号集合
     */
    setHiddenColumns(hiddenSet) {
        this.#hiddenCols = hiddenSet ? new Set(hiddenSet) : new Set();
        this.#visibleColDirty = true;
        this.#colPrefixDirty = true;
    }

    /** 清除所有隐藏列，恢复全量显示 */
    clearHiddenColumns() {
        this.#hiddenCols = new Set();
        this.#visibleColDirty = true;
        this.#colPrefixDirty = true;
    }

    /** 隐藏列集合是否非空 */
    get hasHiddenColumns() {
        return this.#hiddenCols.size > 0;
    }

    /**
     * 可视列号 → 实际列号
     * @param {number} visibleCol - 可视列号
     * @returns {number} 实际列号
     */
    toRealCol(visibleCol) {
        if (this.#hiddenCols.size === 0) return visibleCol;
        this.#ensureVisibleColPrefix();
        if (visibleCol >= 0 && visibleCol < this.#visibleToRealMap.length) {
            return this.#visibleToRealMap[visibleCol];
        }
        const lastMapped = this.#visibleToRealMap.length > 0
            ? this.#visibleToRealMap[this.#visibleToRealMap.length - 1]
            : -1;
        const hiddenAfter = this.#countHiddenAfter(lastMapped + 1, visibleCol - this.#visibleToRealMap.length + 1);
        return lastMapped + 1 + hiddenAfter + (visibleCol - this.#visibleToRealMap.length);
    }

    /**
     * 实际列号 → 可视列号
     * @param {number} realCol - 实际列号
     * @returns {number} 可视列号（如果该列隐藏则返回 -1）
     */
    toVisibleCol(realCol) {
        if (this.#hiddenCols.size === 0) return realCol;
        if (this.#hiddenCols.has(realCol)) return -1;
        this.#ensureVisibleColPrefix();
        if (realCol >= 0 && realCol < this.#realToVisibleMap.length) {
            return this.#realToVisibleMap[realCol];
        }
        const lastMapped = this.#realToVisibleMap.length > 0
            ? this.#realToVisibleMap.length - 1
            : -1;
        let visible = this.#realToVisibleMap.length > 0 ? this.#realToVisibleMap[lastMapped] + 1 : 0;
        for (let c = lastMapped + 1; c <= realCol; c++) {
            if (!this.#hiddenCols.has(c)) visible++;
        }
        return visible - 1;
    }

    /**
     * 计算从 start 开始，前 count 个非隐藏列中隐藏列的数量
     */
    #countHiddenAfter(start, count) {
        let hidden = 0;
        let found = 0;
        let c = start;
        while (found < count) {
            if (this.#hiddenCols.has(c)) {
                hidden++;
            } else {
                found++;
            }
            c++;
        }
        return hidden;
    }

    /**
     * 构建可视列的前缀和和映射表
     * 遍历所有已分配列，跳过隐藏列，构建：
     * - #visibleColWidths: 可视列宽度数组
     * - #visibleColPrefixSum: 可视列前缀和
     * - #visibleToRealMap: 可视列号 → 实际列号
     * - #realToVisibleMap: 实际列号 → 可视列号（隐藏列为 -1）
     * - #visibleTotalWidth: 可视列总宽度
     * - #visibleColCountCache: 可视列总数
     */
    #ensureVisibleColPrefix() {
        if (!this.#visibleColDirty) return;

        this.#ensureColPrefix();

        const n = this.#colWidths.length;
        const widths = [];
        const prefixSum = [];
        const v2r = [];
        const r2v = new Int32Array(n).fill(-1);

        let sum = 0;
        let visibleIdx = 0;
        for (let c = 0; c < n; c++) {
            if (this.#hiddenCols.has(c)) {
                r2v[c] = -1;
                continue;
            }
            const w = this.#colWidths[c];
            widths.push(w);
            sum += w;
            prefixSum.push(sum);
            v2r.push(c);
            r2v[c] = visibleIdx;
            visibleIdx++;
        }

        this.#visibleColWidths = widths;
        this.#visibleColPrefixSum = prefixSum;
        this.#visibleToRealMap = v2r;
        this.#realToVisibleMap = r2v;
        this.#visibleTotalWidth = sum + (CONFIG.MAX_COLS - n + this.#hiddenCols.size) * CONFIG.DEFAULT_COL_WIDTH;
        this.#visibleColCountCache = CONFIG.MAX_COLS - this.#hiddenCols.size;

        this.#visibleColDirty = false;
    }

    #ensureRowPrefix() {
        if (!this.#rowPrefixDirty) return;
        const n = this.#rowHeights.length;
        if (n > 0) {
            this.#rowPrefixSum = new Float64Array(n);
            let sum = 0;
            for (let i = 0; i < n; i++) {
                sum += this.#rowHeights[i];
                this.#rowPrefixSum[i] = sum;
            }
            this.#allocatedHeight = sum;
        } else {
            this.#rowPrefixSum = new Float64Array(0);
            this.#allocatedHeight = 0;
        }
        this.#rowPrefixDirty = false;
    }

    #ensureColPrefix() {
        if (!this.#colPrefixDirty) return;
        const n = this.#colWidths.length;
        if (n > 0) {
            this.#colPrefixSum = new Float64Array(n);
            let sum = 0;
            for (let i = 0; i < n; i++) {
                sum += this.#colWidths[i];
                this.#colPrefixSum[i] = sum;
            }
            this.#allocatedWidth = sum;
        } else {
            this.#colPrefixSum = new Float64Array(0);
            this.#allocatedWidth = 0;
        }
        this.#colPrefixDirty = false;
    }
}