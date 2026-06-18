/**
 * 数据分块（Chunk）
 *
 * 设计意图：
 * - Chunk 是 ChunkedCellStore 的基本存储单元，将千万级单元格按二维网格切分为固定大小的块。
 * - 每个 Chunk 覆盖 CHUNK_ROW_SIZE × CHUNK_COL_SIZE 个逻辑单元格（默认 1024×256 = 262,144 个位置）。
 * - 内部使用 Map（而非二维数组）存储，仅记录"实际有数据"的单元格，天然支持稀疏矩阵。
 *
 * 坐标系说明：
 * - rowStart / colStart：Chunk 在逻辑坐标系中的起始行列号（含），例如 Chunk(0, 0) 覆盖行 [0, 1023]、列 [0, 255]。
 * - 内部存储的 key 为整数编码 rowOffset * CHUNK_COL_SIZE + colOffset，范围 [0, 262143]。
 *
 * 内存特性：
 * - 未写入数据的单元格不占用内存（Map 中没有对应 key）。
 * - 典型场景（100 万 Cell 分布在 100 个 Chunk）：每个 Chunk 平均 10,000 个 Cell，填充率约 3.8%。
 * - cells Map 被 ChunkedCellStore 的行列操作直接访问（如 clear()），因此设计为公开属性。
 *
 * 遍历性能：
 * - iterate() 是生成器方法，遍历 Chunk 内所有已存储的 Cell，返回逻辑坐标。
 * - 时间复杂度 O(k)，k 为 Chunk 内实际 Cell 数。
 * - 注意：遍历"所有已存储 Cell"而非"某个行列范围内的 Cell"——目前不支持按范围过滤的迭代。
 *   这导致 insertRow/deleteRow 等操作在受影响 Chunk 内仍需遍历全部 Cell（而非仅遍历目标行下方的 Cell）。
 *   优化方向：可考虑内部改用按行分组的二级 Map 或有序结构，以支持按行范围查询。
 */
import { CONFIG } from "../../constants/config";

export class Chunk {
    /**
     * @param {number} rowStart - Chunk 在逻辑坐标系中的起始行号（含）
     * @param {number} colStart - Chunk 在逻辑坐标系中的起始列号（含）
     */
    constructor(rowStart, colStart) {
        /** @type {number} Chunk 在逻辑坐标系中的起始行号 */
        this.rowStart = rowStart;
        /** @type {number} Chunk 在逻辑坐标系中的起始列号 */
        this.colStart = colStart;
        /**
         * 单元格存储 Map
         * key: 整数编码 rowOffset * CHUNK_COL_SIZE + colOffset
         * value: Cell 实例
         * @type {Map<number, import("../Cell.js").Cell>}
         */
        this.cells = new Map();
    }

    /**
     * 将逻辑坐标 (row, col) 转换为 Chunk 内部的整数 key
     *
     * 编码公式：rowOffset * CHUNK_COL_SIZE + colOffset
     * 示例：Chunk(1024, 0) 中，逻辑行 1050, 列 5 → key = 26*256 + 5 = 6661
     *
     * @param {number} row - 逻辑行号
     * @param {number} col - 逻辑列号
     * @returns {number} 整数编码
     */
    #key(row, col) {
        return (row - this.rowStart) * CONFIG.CHUNK_COL_SIZE + (col - this.colStart);
    }

    /**
     * 获取指定逻辑位置的单元格
     *
     * @param {number} row - 逻辑行号
     * @param {number} col - 逻辑列号
     * @returns {import("../Cell.js").Cell|undefined} 若该位置无数据则返回 undefined
     */
    get(row, col) {
        return this.cells.get(this.#key(row, col));
    }

    /**
     * 设置指定逻辑位置的单元格
     *
     * @param {number} row - 逻辑行号
     * @param {number} col - 逻辑列号
     * @param {import("../Cell.js").Cell} cell - 单元格实例
     */
    set(row, col, cell) {
        this.cells.set(this.#key(row, col), cell);
    }

    /**
     * 删除指定逻辑位置的单元格
     *
     * 注意：该方法不检查 key 是否存在，调用 Map.delete() 对不存在的 key 为无操作。
     *
     * @param {number} row - 逻辑行号
     * @param {number} col - 逻辑列号
     */
    delete(row, col) {
        this.cells.delete(this.#key(row, col));
    }

    /**
     * 遍历 Chunk 内所有已存储的单元格（生成器）
     *
     * 将内部整数 key 解码为逻辑坐标后 yield。
     * 解码公式：rowOffset = key / CHUNK_COL_SIZE, colOffset = key % CHUNK_COL_SIZE
     * 每次 yield 一个对象 { row, col, cell }，其中 row/col 为逻辑坐标。
     *
     * 性能注意：此方法遍历 Chunk 内所有 Cell，不提供按行列范围过滤的能力。
     * 在 ChunkedCellStore 的行列操作中，如果只需要操作 Chunk 内某几行的 Cell，
     * 当前实现仍会遍历 Chunk 全部 Cell 后再在外部过滤——这是已知的性能优化空间。
     *
     * @yields {{row: number, col: number, cell: import("../Cell.js").Cell}}
     */
    *iterate() {
        const colSize = CONFIG.CHUNK_COL_SIZE;
        for (const [key, cell] of this.cells) {
            const rowOffset = (key / colSize) | 0;
            const colOffset = key % colSize;
            yield {
                row: this.rowStart + rowOffset,
                col: this.colStart + colOffset,
                cell,
            };
        }
    }
}
