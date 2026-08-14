import { CONFIG } from "../../constants/config";
import type { MergeInfo } from "../types";

export type { MergeInfo };

/**
 * 合并单元格管理器
 *
 * 管理工作表中所有合并区域，提供合并/取消合并/查询等操作，
 * 并在行列增删移动时自动同步合并区域的位置和范围。
 *
 * 数据结构：
 * - merges：以左上角编码 key 为键，存储合并区域信息（topRow/topCol/bottomRow/bottomCol/rowSpan/colSpan）
 * - cellMap：每个被合并的单元格 → 其所属合并区域左上角的 key，用于 O(1) 查询
 *
 * 合并区域编码：使用 row * MAX_COLS + col 将二维坐标编码为唯一整数 key
 */
export class MergeManager {
    /** 合并区域映射表 */
    merges: Map<number, MergeInfo>;

    /** 每个单元格 → 其所属合并区域左上角的 key */
    cellMap: Map<number, number>;

    /**
     * 初始化合并管理器
     */
    constructor() {
        this.merges = new Map();
        this.cellMap = new Map();
    }

    /**
     * 将 (row, col) 编码为唯一整数 key
     * 公式：row * MAX_COLS + col，最大约 7×10^11，安全在 Number.MAX_SAFE_INTEGER 内
     * @param r - 行号
     * @param c - 列号
     * @returns 编码后的整数 key
     */
    #encodeKey(r: number, c: number): number {
        return r * CONFIG.MAX_COLS + c;
    }

    /**
     * 合并指定矩形区域的单元格
     * 校验区域有效性（起始不大于结束）和与已有合并区域是否重叠
     * 合并成功后更新 merges 和 cellMap
     * @param topRow - 合并区域起始行号
     * @param topCol - 合并区域起始列号
     * @param bottomRow - 合并区域结束行号
     * @param bottomCol - 合并区域结束列号
     * @returns 合并是否成功
     */
    merge(topRow: number, topCol: number, bottomRow: number, bottomCol: number): boolean {
        if (topRow > bottomRow || topCol > bottomCol) {
            return false;
        }

        if (this.#hasOverlap(topRow, topCol, bottomRow, bottomCol)) {
            return false;
        }

        const key = this.#encodeKey(topRow, topCol);
        const mergeInfo: MergeInfo = {
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

    /**
     * 检查指定区域是否与已有合并区域重叠
     * 使用矩形不相交条件取反判断：两个矩形不重叠当且仅当一个在另一个的上下左右之外
     * @param topRow - 区域起始行号
     * @param topCol - 区域起始列号
     * @param bottomRow - 区域结束行号
     * @param bottomCol - 区域结束列号
     * @returns 是否存在重叠
     */
    #hasOverlap(topRow: number, topCol: number, bottomRow: number, bottomCol: number): boolean {
        for (const [, info] of this.merges) {
            if (!(bottomRow < info.topRow || topRow > info.bottomRow) && !(bottomCol < info.topCol || topCol > info.bottomCol)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 取消指定单元格所在的合并区域
     * 通过 cellMap 查找所属合并区域，然后清除 merges 和 cellMap 中的相关条目
     * @param row - 单元格行号（可以是合并区域内的任意单元格）
     * @param col - 单元格列号
     * @returns 是否成功取消合并
     */
    unmerge(row: number, col: number): boolean {
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

    /**
     * 获取指定单元格所属的合并区域信息
     * @param row - 单元格行号
     * @param col - 单元格列号
     * @returns 合并区域信息，若不在合并区域内则返回 null
     */
    getMerge(row: number, col: number): MergeInfo | null {
        const key = this.cellMap.get(this.#encodeKey(row, col));
        if (key === undefined) return null;
        return this.merges.get(key) || null;
    }

    /**
     * 判断指定单元格是否为合并区域的左上角
     * @param row - 单元格行号
     * @param col - 单元格列号
     * @returns 是否为合并区域左上角
     */
    isTopLeft(row: number, col: number): boolean {
        const key = this.cellMap.get(this.#encodeKey(row, col));
        if (key === undefined) return false;
        return key === this.#encodeKey(row, col);
    }

    /**
     * 判断指定单元格是否被合并（即属于某合并区域但不是左上角）
     * @param row - 单元格行号
     * @param col - 单元格列号
     * @returns 是否为被合并的单元格
     */
    isMerged(row: number, col: number): boolean {
        const key = this.cellMap.get(this.#encodeKey(row, col));
        if (key === undefined) return false;
        return key !== this.#encodeKey(row, col);
    }

    /**
     * 获取所有合并区域信息
     * @returns 合并区域信息数组
     */
    getAllMerges(): MergeInfo[] {
        return Array.from(this.merges.values());
    }

    /**
     * 清空所有合并区域和单元格映射
     */
    clear(): void {
        this.merges.clear();
        this.cellMap.clear();
    }

    /**
     * 获取当前合并区域数量
     * @returns 合并区域数量
     */
    getCount(): number {
        return this.merges.size;
    }

    /**
     * 判断指定矩形区域是否完全包含在某个合并区域内
     * 即左上角属于某合并区域，且该区域不超出合并区域的范围
     * @param topRow - 区域起始行号
     * @param topCol - 区域起始列号
     * @param bottomRow - 区域结束行号
     * @param bottomCol - 区域结束列号
     * @returns 是否完全包含在某个合并区域内
     */
    isRegionMerged(topRow: number, topCol: number, bottomRow: number, bottomCol: number): boolean {
        const topLeftMerge = this.getMerge(topRow, topCol);
        if (!topLeftMerge) return false;

        return bottomRow <= topLeftMerge.bottomRow && bottomCol <= topLeftMerge.bottomCol;
    }

    /**
     * 插入行：将 atRow 及以下的合并区域下移一行
     * 如果合并区域跨越 atRow（topRow < atRow ≤ bottomRow），则扩展一行
     *
     * @param atRow - 插入位置的行号
     */
    insertRow(atRow: number): void {
        const toUpdate: Array<{ topRow: number; topCol: number; bottomRow: number; bottomCol: number }> = [];
        const toRemove: number[] = [];

        for (const [key, info] of this.merges) {
            if (info.topRow >= atRow) {
                toRemove.push(key);
                toUpdate.push({
                    topRow: info.topRow + 1,
                    topCol: info.topCol,
                    bottomRow: info.bottomRow + 1,
                    bottomCol: info.bottomCol,
                });
            } else if (info.bottomRow >= atRow) {
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
            const info = this.merges.get(key)!;
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
     * 如果合并区域跨越 atCol（topCol < atCol ≤ bottomCol），则扩展一列
     *
     * @param atCol - 插入位置的列号
     */
    insertCol(atCol: number): void {
        const toUpdate: Array<{ topRow: number; topCol: number; bottomRow: number; bottomCol: number }> = [];
        const toRemove: number[] = [];

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
            const info = this.merges.get(key)!;
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
     * @param atRow - 要删除的行号
     */
    deleteRow(atRow: number): void {
        const toUpdate: Array<{ topRow: number; topCol: number; bottomRow: number; bottomCol: number }> = [];
        const toRemove: number[] = [];

        for (const [key, info] of this.merges) {
            if (info.topRow === atRow && info.bottomRow === atRow) {
                toRemove.push(key);
                continue;
            }

            if (info.topRow > atRow) {
                toRemove.push(key);
                toUpdate.push({
                    topRow: info.topRow - 1,
                    topCol: info.topCol,
                    bottomRow: info.bottomRow - 1,
                    bottomCol: info.bottomCol,
                });
            } else if (info.bottomRow >= atRow && info.topRow <= atRow) {
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
            const info = this.merges.get(key)!;
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
     * 如果合并区域跨越 atCol，则收缩一列
     * 如果合并区域只有一列，则取消合并
     *
     * @param atCol - 要删除的列号
     */
    deleteCol(atCol: number): void {
        const toUpdate: Array<{ topRow: number; topCol: number; bottomRow: number; bottomCol: number }> = [];
        const toRemove: number[] = [];

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
            const info = this.merges.get(key)!;
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
     * 计算移动操作后的新索引
     * 处理三种情况：
     * - 被移动元素本身：直接移到目标位置
     * - 向后移动（from < to）：区间 (from, to] 内的元素前移一位
     * - 向前移动（from > to）：区间 [to, from) 内的元素后移一位
     * @param idx - 原始索引
     * @param from - 源位置
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
     * 移动列时同步所有合并区域的列位置
     * 处理两种情况：
     * - 移动列在合并区域内：整个合并区域平移 offset
     * - 移动列不在合并区域内：使用 #shiftIndex 计算边界列的新位置
     * 移动后若 topCol > bottomCol 则丢弃该合并区域
     * @param fromCol - 源列位置
     * @param toCol - 目标列位置
     */
    moveCol(fromCol: number, toCol: number): void {
        if (fromCol === toCol) return;

        const toUpdate: Array<{ topRow: number; topCol: number; bottomRow: number; bottomCol: number }> = [];
        const toRemove: number[] = [];

        for (const [key, info] of this.merges) {
            toRemove.push(key);
            let newTopCol: number, newBottomCol: number;

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
            const info = this.merges.get(key)!;
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

    /**
     * 移动行时同步所有合并区域的行位置
     * 处理两种情况：
     * - 移动行在合并区域内：整个合并区域平移 offset
     * - 移动行不在合并区域内：使用 #shiftIndex 计算边界行的新位置
     * 移动后若 topRow > bottomRow 则丢弃该合并区域
     * @param fromRow - 源行位置
     * @param toRow - 目标行位置
     */
    moveRow(fromRow: number, toRow: number): void {
        if (fromRow === toRow) return;

        const toUpdate: Array<{ topRow: number; topCol: number; bottomRow: number; bottomCol: number }> = [];
        const toRemove: number[] = [];

        for (const [key, info] of this.merges) {
            toRemove.push(key);
            let newTopRow: number, newBottomRow: number;

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
            const info = this.merges.get(key)!;
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
