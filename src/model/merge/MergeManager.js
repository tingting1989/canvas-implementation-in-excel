export class MergeManager {
    constructor() {
        this.merges = new Map();
        this.cellMap = new Map();
    }

    merge(topRow, topCol, bottomRow, bottomCol) {
        if (topRow > bottomRow || topCol > bottomCol) {
            return false;
        }

        if (this.#hasOverlap(topRow, topCol, bottomRow, bottomCol)) {
            return false;
        }

        const key = `${topRow}:${topCol}`;
        const mergeInfo = {
            topRow,
            topCol,
            bottomRow,
            bottomCol,
            rowSpan: bottomRow - topRow + 1,
            colSpan: bottomCol - topCol + 1
        };

        this.merges.set(key, mergeInfo);

        for (let r = topRow; r <= bottomRow; r++) {
            for (let c = topCol; c <= bottomCol; c++) {
                this.cellMap.set(`${r}:${c}`, key);
            }
        }

        return true;
    }

    #hasOverlap(topRow, topCol, bottomRow, bottomCol) {
        for (const [, info] of this.merges) {
            if (
                !(bottomRow < info.topRow || topRow > info.bottomRow) &&
                !(bottomCol < info.topCol || topCol > info.bottomCol)
            ) {
                return true;
            }
        }
        return false;
    }

    unmerge(row, col) {
        const key = this.cellMap.get(`${row}:${col}`);
        if (!key) return false;

        const info = this.merges.get(key);
        if (!info) return false;

        for (let r = info.topRow; r <= info.bottomRow; r++) {
            for (let c = info.topCol; c <= info.bottomCol; c++) {
                this.cellMap.delete(`${r}:${c}`);
            }
        }

        this.merges.delete(key);
        return true;
    }

    getMerge(row, col) {
        const key = this.cellMap.get(`${row}:${col}`);
        if (!key) return null;
        return this.merges.get(key) || null;
    }

    isTopLeft(row, col) {
        const key = this.cellMap.get(`${row}:${col}`);
        if (!key) return false;
        return key === `${row}:${col}`;
    }

    isMerged(row, col) {
        const key = this.cellMap.get(`${row}:${col}`);
        if (!key) return false;
        return key !== `${row}:${col}`;
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

        return (
            bottomRow <= topLeftMerge.bottomRow &&
            bottomCol <= topLeftMerge.bottomCol
        );
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
                    this.cellMap.delete(`${r}:${c}`);
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
                    this.cellMap.delete(`${r}:${c}`);
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
                    this.cellMap.delete(`${r}:${c}`);
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
                    this.cellMap.delete(`${r}:${c}`);
                }
            }
            this.merges.delete(key);
        }

        for (const { topRow, topCol, bottomRow, bottomCol } of toUpdate) {
            this.merge(topRow, topCol, bottomRow, bottomCol);
        }
    }

    moveCol(fromCol, toCol) {
        if (fromCol === toCol) return;

        const toUpdate = [];
        const toRemove = [];

        for (const [key, info] of this.merges) {
            toRemove.push(key);
            let newTopCol = info.topCol;
            let newBottomCol = info.bottomCol;

            if (fromCol < toCol) {
                if (info.topCol === fromCol) newTopCol = toCol;
                else if (info.topCol > fromCol && info.topCol <= toCol) newTopCol--;

                if (info.bottomCol === fromCol) newBottomCol = toCol;
                else if (info.bottomCol > fromCol && info.bottomCol <= toCol) newBottomCol--;
            } else {
                if (info.topCol === fromCol) newTopCol = toCol;
                else if (info.topCol >= toCol && info.topCol < fromCol) newTopCol++;

                if (info.bottomCol === fromCol) newBottomCol = toCol;
                else if (info.bottomCol >= toCol && info.bottomCol < fromCol) newBottomCol++;
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
                    this.cellMap.delete(`${r}:${c}`);
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
            let newTopRow = info.topRow;
            let newBottomRow = info.bottomRow;

            if (fromRow < toRow) {
                if (info.topRow === fromRow) newTopRow = toRow;
                else if (info.topRow > fromRow && info.topRow <= toRow) newTopRow--;

                if (info.bottomRow === fromRow) newBottomRow = toRow;
                else if (info.bottomRow > fromRow && info.bottomRow <= toRow) newBottomRow--;
            } else {
                if (info.topRow === fromRow) newTopRow = toRow;
                else if (info.topRow >= toRow && info.topRow < fromRow) newTopRow++;

                if (info.bottomRow === fromRow) newBottomRow = toRow;
                else if (info.bottomRow >= toRow && info.bottomRow < fromRow) newBottomRow++;
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
                    this.cellMap.delete(`${r}:${c}`);
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