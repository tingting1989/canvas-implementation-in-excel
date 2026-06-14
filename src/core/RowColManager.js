import { CONFIG } from "../core/constants.js";

export class RowColManager {
    #rowHeights = [];
    #colWidths = [];
    #rowPrefixSum = null;
    #colPrefixSum = null;
    #rowPrefixDirty = true;
    #colPrefixDirty = true;
    #allocatedHeight = 0;
    #allocatedWidth = 0;

    get totalHeight() {
        this.#ensureRowPrefix();
        return this.#allocatedHeight + (CONFIG.MAX_ROWS - this.#rowHeights.length) * CONFIG.DEFAULT_ROW_HEIGHT;
    }

    get totalWidth() {
        this.#ensureColPrefix();
        return this.#allocatedWidth + (CONFIG.MAX_COLS - this.#colWidths.length) * CONFIG.DEFAULT_COL_WIDTH;
    }

    get rowCount() {
        return CONFIG.MAX_ROWS;
    }

    get colCount() {
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
        return CONFIG.DEFAULT_ROW_HEIGHT;
    }

    getColWidth(col) {
        if (col >= 0 && col < this.#colWidths.length) return this.#colWidths[col];
        return CONFIG.DEFAULT_COL_WIDTH;
    }

    getRowY(row) {
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

    getVisibleRange(viewX, viewY, viewW, viewH) {
        const sc = this.colAt(viewX);
        const sr = this.rowAt(viewY);
        const ec = Math.min(CONFIG.MAX_COLS, this.colAt(viewX + viewW) + 1);
        const er = Math.min(CONFIG.MAX_ROWS, this.rowAt(viewY + viewH) + 1);
        return { sr, sc, er, ec };
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