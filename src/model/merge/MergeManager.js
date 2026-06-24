import { CONFIG } from "../../constants/config";

export class MergeManager {
    constructor() {
        /** @type {Map<number, {topRow:number, topCol:number, bottomRow:number, bottomCol:number, rowSpan:number, colSpan:number}>} */
        this.merges = new Map();
        /** @type {Map<number, number>} 每个单元格 → 其所属合并区域左上角的 key */
        this.cellMap = new Map();
    }

    /**
     * 将 (row, col) 编码为唯一整数 key
     * 公式：row * MAX_COLS + col，最大约 7×10^11，安全在 Number.MAX_SAFE_INTEGER 内
     * @param {number} r
     * @param {number} c
     * @returns {number}
     */
    #encodeKey(r, c) {
        return r * CONFIG.MAX_COLS + c;
    }

    merge(topRow, topCol, bottomRow, bottomCol) {
        if (topRow > bottomRow || topCol > bottomCol) {
            return false;
        }

        if (this.#hasOverlap(topRow, topCol, bottomRow, bottomCol)) {
            return false;
        }

        const key = this.#encodeKey(topRow, topCol);
        const mergeInfo = {
            topRow,
            topCol,
            bottomRow,
            bottomCol,
            rowSpan: bottomRow - topRow + 1,
            colSpan: bottomCol - topCol + 1,
        };

        this.merges.set(key, mergeInfo);

        for (let r = topRow; r <= bottomRow; r++) {
            for (let c = topCol; c <= bottomCol; c++) {
                this.cellMap.set(this.#encodeKey(r, c), key);
            }
        }

        return true;
    }

    #hasOverlap(topRow, topCol, bottomRow, bottomCol) {
        for (const [, info] of this.merges) {
            if (!(bottomRow < info.topRow || topRow > info.bottomRow) && !(bottomCol < info.topCol || topCol > info.bottomCol)) {
                return true;
            }
        }
        return false;
    }

    unmerge(row, col) {
        const key = this.cellMap.get(this.#encodeKey(row, col));
        if (key === undefined) return false;

        const info = this.merges.get(key);
        if (!info) return false;

        for (let r = info.topRow; r <= info.bottomRow; r++) {
            for (let c = info.topCol; c <= info.bottomCol; c++) {
                this.cellMap.delete(this.#encodeKey(r, c));
            }
        }

        this.merges.delete(key);
        return true;
    }

    getMerge(row, col) {
        const key = this.cellMap.get(this.#encodeKey(row, col));
        if (key === undefined) return null;
        return this.merges.get(key) || null;
    }

    isTopLeft(row, col) {
        const key = this.cellMap.get(this.#encodeKey(row, col));
        if (key === undefined) return false;
        return key === this.#encodeKey(row, col);
    }

    isMerged(row, col) {
        const key = this.cellMap.get(this.#encodeKey(row, col));
        if (key === undefined) return false;
        return key !== this.#encodeKey(row, col);
    }

    getAllMerges() {
        return Array.from(this.merges.values());
    }

    clear() {
        this.merges.clear();
        this.cellMap.clear();
    }

    getCount() {
        return this.merges.size;
    }

    isRegionMerged(topRow, topCol, bottomRow, bottomCol) {
        const topLeftMerge = this.getMerge(topRow, topCol);
        if (!topLeftMerge) return false;

        return bottomRow <= topLeftMerge.bottomRow && bottomCol <= topLeftMerge.bottomCol;
    }

    /**
     * 插入行：将 atRow 及以下的合并区域下移一行
     * 如果合并区域跨越 atRow（topRow < atRow ≤ bottomRow），则扩展一行
     *
     * @param {number} atRow - 插入位置的行号
     */
    insertRow(atRow) {
        const toUpdate = [];
        const toRemove = [];

        for (const [key, info] of this.merges) {
            if (info.topRow >= atRow) {
                /** 合并区域完全在插入位置下方 → 整体下移 */
                toRemove.push(key);
                toUpdate.push({
                    topRow: info.topRow + 1,
                    topCol: info.topCol,
                    bottomRow: info.bottomRow + 1,
                    bottomCol: info.bottomCol,
                });
            } else if (info.bottomRow >= atRow) {
                /** 合并区域跨越插入位置 → 扩展一行 */
                toRemove.push(key);
                toUpdate.push({
                    topRow: info.topRow,
                    topCol: info.topCol,
                    bottomRow: info.bottomRow + 1,
                    bottomCol: info.bottomCol,
                });
            }
        }

        for (const key of toRemove) {
            const info = this.merges.get(key);
            for (let r = info.topRow; r <= info.bottomRow; r++) {
                for (let c = info.topCol; c <= info.bottomCol; c++) {
                    this.cellMap.delete(this.#encodeKey(r, c));
                }
            }
            this.merges.delete(key);
        }

        for (const { topRow, topCol, bottomRow, bottomCol } of toUpdate) {
            this.merge(topRow, topCol, bottomRow, bottomCol);
        }
    }

    /**
     * 插入列：将 atCol 及右侧的合并区域右移一列
     *
     * @param {number} atCol - 插入位置的列号
     */
    insertCol(atCol) {
        const toUpdate = [];
        const toRemove = [];

        for (const [key, info] of this.merges) {
            if (info.topCol >= atCol) {
                toRemove.push(key);
                toUpdate.push({
                    topRow: info.topRow,
                    topCol: info.topCol + 1,
                    bottomRow: info.bottomRow,
                    bottomCol: info.bottomCol + 1,
                });
            } else if (info.bottomCol >= atCol) {
                toRemove.push(key);
                toUpdate.push({
                    topRow: info.topRow,
                    topCol: info.topCol,
                    bottomRow: info.bottomRow,
                    bottomCol: info.bottomCol + 1,
                });
            }
        }

        for (const key of toRemove) {
            const info = this.merges.get(key);
            for (let r = info.topRow; r <= info.bottomRow; r++) {
                for (let c = info.topCol; c <= info.bottomCol; c++) {
                    this.cellMap.delete(this.#encodeKey(r, c));
                }
            }
            this.merges.delete(key);
        }

        for (const { topRow, topCol, bottomRow, bottomCol } of toUpdate) {
            this.merge(topRow, topCol, bottomRow, bottomCol);
        }
    }

    /**
     * 删除行：将 atRow 以下的合并区域上移一行
     * 如果合并区域跨越 atRow，则收缩一行
     * 如果合并区域只有一行，则取消合并
     *
     * @param {number} atRow - 要删除的行号
     */
    deleteRow(atRow) {
        const toUpdate = [];
        const toRemove = [];

        for (const [key, info] of this.merges) {
            if (info.topRow === atRow && info.bottomRow === atRow) {
                /** 合并区域只有一行且就是要删除的行 → 取消合并 */
                toRemove.push(key);
                continue;
            }

            if (info.topRow > atRow) {
                /** 合并区域完全在删除位置下方 → 整体上移 */
                toRemove.push(key);
                toUpdate.push({
                    topRow: info.topRow - 1,
                    topCol: info.topCol,
                    bottomRow: info.bottomRow - 1,
                    bottomCol: info.bottomCol,
                });
            } else if (info.bottomRow >= atRow && info.topRow <= atRow) {
                /** 合并区域跨越删除位置 → 收缩一行 */
                toRemove.push(key);
                toUpdate.push({
                    topRow: info.topRow,
                    topCol: info.topCol,
                    bottomRow: info.bottomRow - 1,
                    bottomCol: info.bottomCol,
                });
            }
        }

        for (const key of toRemove) {
            const info = this.merges.get(key);
            for (let r = info.topRow; r <= info.bottomRow; r++) {
                for (let c = info.topCol; c <= info.bottomCol; c++) {
                    this.cellMap.delete(this.#encodeKey(r, c));
                }
            }
            this.merges.delete(key);
        }

        for (const { topRow, topCol, bottomRow, bottomCol } of toUpdate) {
            this.merge(topRow, topCol, bottomRow, bottomCol);
        }
    }

    /**
     * 删除列：将 atCol 右侧的合并区域左移一列
     *
     * @param {number} atCol - 要删除的列号
     */
    deleteCol(atCol) {
        const toUpdate = [];
        const toRemove = [];

        for (const [key, info] of this.merges) {
            if (info.topCol === atCol && info.bottomCol === atCol) {
                toRemove.push(key);
                continue;
            }

            if (info.topCol > atCol) {
                toRemove.push(key);
                toUpdate.push({
                    topRow: info.topRow,
                    topCol: info.topCol - 1,
                    bottomRow: info.bottomRow,
                    bottomCol: info.bottomCol - 1,
                });
            } else if (info.bottomCol >= atCol && info.topCol <= atCol) {
                toRemove.push(key);
                toUpdate.push({
                    topRow: info.topRow,
                    topCol: info.topCol,
                    bottomRow: info.bottomRow,
                    bottomCol: info.bottomCol - 1,
                });
            }
        }

        for (const key of toRemove) {
            const info = this.merges.get(key);
            for (let r = info.topRow; r <= info.bottomRow; r++) {
                for (let c = info.topCol; c <= info.bottomCol; c++) {
                    this.cellMap.delete(this.#encodeKey(r, c));
                }
            }
            this.merges.delete(key);
        }

        for (const { topRow, topCol, bottomRow, bottomCol } of toUpdate) {
            this.merge(topRow, topCol, bottomRow, bottomCol);
        }
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

        const toUpdate = [];
        const toRemove = [];

        for (const [key, info] of this.merges) {
            toRemove.push(key);
            let newTopCol, newBottomCol;

            if (info.topCol <= fromCol && fromCol <= info.bottomCol) {
                const offset = toCol - fromCol;
                newTopCol = info.topCol + offset;
                newBottomCol = info.bottomCol + offset;
            } else {
                newTopCol = this.#shiftIndex(info.topCol, fromCol, toCol);
                newBottomCol = this.#shiftIndex(info.bottomCol, fromCol, toCol);
            }

            toUpdate.push({
                topRow: info.topRow,
                topCol: newTopCol,
                bottomRow: info.bottomRow,
                bottomCol: newBottomCol,
            });
        }

        for (const key of toRemove) {
            const info = this.merges.get(key);
            for (let r = info.topRow; r <= info.bottomRow; r++) {
                for (let c = info.topCol; c <= info.bottomCol; c++) {
                    this.cellMap.delete(this.#encodeKey(r, c));
                }
            }
            this.merges.delete(key);
        }

        for (const { topRow, topCol, bottomRow, bottomCol } of toUpdate) {
            if (topCol <= bottomCol) {
                this.merge(topRow, topCol, bottomRow, bottomCol);
            }
        }
    }

    moveRow(fromRow, toRow) {
        if (fromRow === toRow) return;

        const toUpdate = [];
        const toRemove = [];

        for (const [key, info] of this.merges) {
            toRemove.push(key);
            let newTopRow, newBottomRow;

            if (info.topRow <= fromRow && fromRow <= info.bottomRow) {
                const offset = toRow - fromRow;
                newTopRow = info.topRow + offset;
                newBottomRow = info.bottomRow + offset;
            } else {
                newTopRow = this.#shiftIndex(info.topRow, fromRow, toRow);
                newBottomRow = this.#shiftIndex(info.bottomRow, fromRow, toRow);
            }

            toUpdate.push({
                topRow: newTopRow,
                topCol: info.topCol,
                bottomRow: newBottomRow,
                bottomCol: info.bottomCol,
            });
        }

        for (const key of toRemove) {
            const info = this.merges.get(key);
            for (let r = info.topRow; r <= info.bottomRow; r++) {
                for (let c = info.topCol; c <= info.bottomCol; c++) {
                    this.cellMap.delete(this.#encodeKey(r, c));
                }
            }
            this.merges.delete(key);
        }

        for (const { topRow, topCol, bottomRow, bottomCol } of toUpdate) {
            if (topRow <= bottomRow) {
                this.merge(topRow, topCol, bottomRow, bottomCol);
            }
        }
    }
}