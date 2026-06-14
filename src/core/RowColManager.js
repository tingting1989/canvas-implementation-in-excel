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
    /** 隐藏列的原始宽度缓存（隐藏前保存，显示时恢复） */
    #originalColWidths = new Map();

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
        return CONFIG.MAX_COLS;
    }

    get realColCount() {
        return CONFIG.MAX_COLS;
    }

    /** 可视列总数（排除隐藏列） */
    get visibleColCount() {
        return CONFIG.MAX_COLS - this.#hiddenCols.size;
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
        if (this.#pageStartRow >= 0 && this.#pageEndRow > this.#pageStartRow) {
            const realRow = this.#pageStartRow + row;
            if (realRow >= 0 && realRow < this.#rowHeights.length) return this.#rowHeights[realRow];
            return CONFIG.DEFAULT_ROW_HEIGHT;
        }
        if (row >= 0 && row < this.#rowHeights.length) return this.#rowHeights[row];
        return CONFIG.DEFAULT_ROW_HEIGHT;
    }

    getColWidth(col) {
        if (col >= 0 && col < this.#colWidths.length) return this.#colWidths[col];
        if (this.#hiddenCols.has(col)) return 0;
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
        return col;
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
    }

    moveCol(fromCol, toCol) {
        if (fromCol === toCol) return;
        this.ensureSize(0, Math.max(fromCol, toCol) + 1);
        const [width] = this.#colWidths.splice(fromCol, 1);
        this.#colWidths.splice(toCol, 0, width);
        this.#colPrefixDirty = true;
    }

    moveRow(fromRow, toRow) {
        if (fromRow === toRow) return;
        this.ensureSize(Math.max(fromRow, toRow) + 1, 0);
        const [height] = this.#rowHeights.splice(fromRow, 1);
        this.#rowHeights.splice(toRow, 0, height);
        this.#rowPrefixDirty = true;
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