import { Chunk } from "./Chunk.js";
import {CONFIG} from "../../constants/config";

/**
 * 分块单元格存储
 * 将单元格按行列分块存储，支持千万级数据
 * 每个块（Chunk）覆盖 CHUNK_ROW_SIZE × CHUNK_COL_SIZE 个单元格
 */
export class ChunkedCellStore {
    /** 块映射表：chunkKey → Chunk 实例 */
    #chunks = new Map();

    constructor() {
    }

    /**
     * 计算块键
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {string}
     */
    #chunkKey(row, col) {
        return `${Math.floor(row / CONFIG.CHUNK_ROW_SIZE)}:${Math.floor(col / CONFIG.CHUNK_COL_SIZE)}`;
    }

    /**
     * 获取或创建指定位置的块
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {Chunk}
     */
    #getChunk(row, col) {
        const key = this.#chunkKey(row, col);
        if (!this.#chunks.has(key)) {
            const [r, c] = key.split(":").map(Number);
            this.#chunks.set(key, new Chunk(r * CONFIG.CHUNK_ROW_SIZE, c * CONFIG.CHUNK_COL_SIZE));
        }
        return this.#chunks.get(key);
    }

    /**
     * 获取指定位置的单元格
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {import("../Cell.js").Cell|undefined}
     */
    get(row, col) {
        return this.#getChunk(row, col).get(row, col);
    }

    /**
     * 设置指定位置的单元格
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {import("../Cell.js").Cell} cell
     */
    set(row, col, cell) {
        this.#getChunk(row, col).set(row, col, cell);
    }

    /**
     * 删除指定位置的单元格
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    delete(row, col) {
        const chunk = this.#getChunk(row, col);
        chunk.delete(row, col);
    }

    /**
     * 插入行：将 atRow 及以下所有单元格下移一行
     * 从最底行开始向上遍历，避免覆盖
     *
     * @param {number} atRow - 插入位置的行号
     * @param {number} [maxRow] - 最大行号（限制遍历范围）
     */
    insertRow(atRow, maxRow) {
        const affected = [];
        for (const chunk of this.#chunks.values()) {
            for (const { row, col, cell } of chunk.iterate()) {
                if (row >= atRow) {
                    affected.push({ row, col, cell });
                }
            }
        }

        affected.sort((a, b) => b.row - a.row);

        for (const { row, col, cell } of affected) {
            this.delete(row, col);
            this.set(row + 1, col, cell);
        }
    }

    /**
     * 插入列：将 atCol 及右侧所有单元格右移一列
     * 从最右列开始向左遍历，避免覆盖
     *
     * @param {number} atCol - 插入位置的列号
     * @param {number} [maxCol] - 最大列号（限制遍历范围）
     */
    insertCol(atCol, maxCol) {
        const affected = [];
        for (const chunk of this.#chunks.values()) {
            for (const { row, col, cell } of chunk.iterate()) {
                if (col >= atCol) {
                    affected.push({ row, col, cell });
                }
            }
        }

        affected.sort((a, b) => b.col - a.col);

        for (const { row, col, cell } of affected) {
            this.delete(row, col);
            this.set(row, col + 1, cell);
        }
    }

    /**
     * 删除行：将 atRow 以下所有单元格上移一行
     *
     * @param {number} atRow - 要删除的行号
     */
    deleteRow(atRow) {
        const affected = [];
        for (const chunk of this.#chunks.values()) {
            for (const { row, col, cell } of chunk.iterate()) {
                if (row > atRow) {
                    affected.push({ row, col, cell });
                }
            }
        }

        affected.sort((a, b) => a.row - b.row);

        for (const chunk of this.#chunks.values()) {
            for (const { row, col } of chunk.iterate()) {
                if (row === atRow) {
                    this.delete(row, col);
                }
            }
        }

        for (const { row, col, cell } of affected) {
            this.delete(row, col);
            this.set(row - 1, col, cell);
        }
    }

    /**
     * 删除列：将 atCol 右侧所有单元格左移一列
     *
     * @param {number} atCol - 要删除的列号
     */
    deleteCol(atCol) {
        const affected = [];
        for (const chunk of this.#chunks.values()) {
            for (const { row, col, cell } of chunk.iterate()) {
                if (col > atCol) {
                    affected.push({ row, col, cell });
                }
            }
        }

        affected.sort((a, b) => a.col - b.col);

        for (const chunk of this.#chunks.values()) {
            for (const { row, col } of chunk.iterate()) {
                if (col === atCol) {
                    this.delete(row, col);
                }
            }
        }

        for (const { row, col, cell } of affected) {
            this.delete(row, col);
            this.set(row, col - 1, cell);
        }
    }

    moveCol(fromCol, toCol) {
        if (fromCol === toCol) return;

        const colCells = new Map();
        for (const chunk of this.#chunks.values()) {
            for (const { row, col, cell } of chunk.iterate()) {
                if (col === fromCol) {
                    colCells.set(row, cell);
                }
            }
        }

        for (const [row] of colCells) {
            this.delete(row, fromCol);
        }

        if (fromCol < toCol) {
            const shiftCols = [];
            for (const chunk of this.#chunks.values()) {
                for (const { row, col, cell } of chunk.iterate()) {
                    if (col > fromCol && col <= toCol) {
                        shiftCols.push({ row, col, cell });
                    }
                }
            }
            shiftCols.sort((a, b) => a.col - b.col);
            for (const { row, col, cell } of shiftCols) {
                this.delete(row, col);
                this.set(row, col - 1, cell);
            }
        } else {
            const shiftCols = [];
            for (const chunk of this.#chunks.values()) {
                for (const { row, col, cell } of chunk.iterate()) {
                    if (col >= toCol && col < fromCol) {
                        shiftCols.push({ row, col, cell });
                    }
                }
            }
            shiftCols.sort((a, b) => b.col - a.col);
            for (const { row, col, cell } of shiftCols) {
                this.delete(row, col);
                this.set(row, col + 1, cell);
            }
        }

        for (const [row, cell] of colCells) {
            this.set(row, toCol, cell);
        }
    }

    /**
     * 遍历所有块（生成器方法）
     *
     * @yields {Chunk}
     */
    *chunks() {
        for (const chunk of this.#chunks.values()) {
            yield chunk;
        }
    }

    getMaxRow() {
        let maxRow = -1;
        for (const chunk of this.#chunks.values()) {
            if (chunk.cells.size > 0) {
                const chunkMax = chunk.rowStart + CONFIG.CHUNK_ROW_SIZE - 1;
                if (chunkMax > maxRow) maxRow = chunkMax;
            }
        }
        return maxRow;
    }

    getMaxCol() {
        let maxCol = -1;
        for (const chunk of this.#chunks.values()) {
            if (chunk.cells.size > 0) {
                const chunkMax = chunk.colStart + CONFIG.CHUNK_COL_SIZE - 1;
                if (chunkMax > maxCol) maxCol = chunkMax;
            }
        }
        return maxCol;
    }
}