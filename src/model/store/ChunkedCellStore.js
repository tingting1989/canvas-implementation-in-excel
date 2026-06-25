import { Chunk } from "./Chunk.js";
import { CONFIG } from "../../constants/config";

/**
 * 分块单元格存储（Chunked Cell Store）
 *
 * 设计意图：
 * - 将千万级单元格按二维网格切分为固定大小的数据块（Chunk），每个 Chunk 覆盖
 *   CHUNK_ROW_SIZE × CHUNK_COL_SIZE 个逻辑单元格位置（默认 1024 × 256 = 262,144）。
 * - 使用 Map<chunkKey, Chunk> 管理所有 Chunk，通过逻辑坐标 (row, col) 快速定位。
 * - 支持 CRUD 和行列插入/删除/移动操作。
 *
 * 坐标系：
 * - 所有方法使用全局逻辑坐标 (row, col)，内部自动通过 #chunkKey() 映射到对应 Chunk。
 * - Chunk 按需创建（lazy allocation），只有写入数据时才实例化 Chunk。
 *
 * 行列操作优化策略：
 * - insertRow/insertCol：仅遍历 rowStart/colStart >= 插入位置的 Chunk（而非所有 Chunk）。
 * - deleteRow/deleteCol：两步操作——先删除目标行/列上的 Cell，再将后续 Cell 移动。
 * - moveRow/moveCol：先收集源行/列的 Cell，再逐行/列移动中间数据，最后写入目标位置。
 *
 * 性能特征（典型场景：100 万 Cell，100 个 Chunk）：
 * - 基本 CRUD（get/set/delete）：O(1)，两次哈希查找（chunkKey + cell key）。
 * - insertRow（atRow 在数据中间）：遍历约 50 个 Chunk 的约 50 万 Cell，减少 50%。
 * - deleteRow（atRow 在数据中间）：遍历约 50 个 Chunk + 跨行 Chunk 的 Cell，减少约 50%。
 * - 已知限制：受影响 Chunk 内部仍遍历全部 Cell（而非仅遍历需要移动的行），
 *   进一步优化方向见 Chunk.iterate() 的文档。
 *
 * 容量上限：
 * - 最大行数：MAX_ROWS = 10,000,000（一千万行）
 * - 最大列数：MAX_COLS = 70,000（七万列）
 * - 最多 Chunk 数：约 ceil(MAX_ROWS/1024) × ceil(MAX_COLS/256) ≈ 9,766 × 274 ≈ 267 万个
 * - Map 本身支持数百万 key，实际 Chunk 数取决于数据分布密度
 */
export class ChunkedCellStore {
    /**
     * 块映射表
     * key: "chunkRowIndex:chunkColIndex"（块网格坐标，非逻辑行列号）
     * value: Chunk 实例
     * @type {Map<string, Chunk>}
     */
    #chunks = new Map();

    constructor() {}

    /**
     * 根据逻辑坐标计算所属 Chunk 的网格索引（块键）
     *
     * 块键是 Chunk 在二维网格中的坐标，而非逻辑行列号。
     * 示例：
     *   - 逻辑行 0~1023、列 0~255    → chunkKey "0:0"
     *   - 逻辑行 0~1023、列 256~511  → chunkKey "0:1"
     *   - 逻辑行 1024~2047、列 0~255 → chunkKey "1:0"
     *
     * 块键用于 Map 索引，确保 O(1) 定位到目标 Chunk。
     *
     * @param {number} row - 逻辑行号
     * @param {number} col - 逻辑列号
     * @returns {string} 格式 "chunkRowIndex:chunkColIndex"
     */
    #chunkKey(row, col) {
        return `${Math.floor(row / CONFIG.CHUNK_ROW_SIZE)}:${Math.floor(col / CONFIG.CHUNK_COL_SIZE)}`;
    }

    /**
     * 获取或创建指定位置的 Chunk（懒分配）
     *
     * 如果对应块键的 Chunk 不存在，则创建新的 Chunk 实例。
     * Chunk 的 rowStart/colStart 由块网格坐标反算得到：
     *   rowStart = chunkRowIndex × CHUNK_ROW_SIZE
     *   colStart = chunkColIndex × CHUNK_COL_SIZE
     *
     * @param {number} row - 逻辑行号
     * @param {number} col - 逻辑列号
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

    // ============================================================
    // CRUD 操作
    // ============================================================

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

    // ============================================================
    // 行列插入
    // ============================================================

    /**
     * 插入行：在 atRow 位置插入一行，atRow 及以下的 Cell 全部下移一行。
     *
     * 实现策略：
     * 1. 收集所有 Chunk，筛选 rowStart >= atRow 的受影响 Chunk。
     * 2. 从下往上处理（避免数据覆盖），遍历每个受影响 Chunk 的全部 Cell。
     * 3. 清空 Chunk 后，将每个 Cell 写入 row+1 位置（通过 this.set() 自动路由到正确的 Chunk）。
     *
     * 性能：
     * - 仅遍历 rowStart >= atRow 的 Chunk（而非所有 Chunk）。
     * - 典型场景（100 Chunk，atRow 在中间）：遍历约 50 个 Chunk，减少 50% 遍历量。
     * - 已知限制：Chunk 内遍历全部 Cell 而非仅 row >= atRow 的 Cell。
     *
     * 注意：newRow 本身不存储数据，插入后 atRow 位置为空行。
     *
     * @param {number} atRow - 插入位置的行号（新行将占据此位置）
     */
    insertRow(atRow) {
        const cellsToMove = [];

        for (const [, chunk] of this.#chunks) {
            if (chunk.rowStart + CONFIG.CHUNK_ROW_SIZE <= atRow) continue;

            for (const { row, col, cell } of chunk.iterate()) {
                if (row >= atRow) {
                    cellsToMove.push({ row, col, cell });
                }
            }
        }

        for (const { row, col } of cellsToMove) {
            const chunkKey = this.#chunkKey(row, col);
            const chunk = this.#chunks.get(chunkKey);
            if (chunk) chunk.delete(row, col);
        }

        for (const { row, col, cell } of cellsToMove) {
            this.set(row + 1, col, cell);
        }
    }

    /**
     * 插入列：在 atCol 位置插入一列，atCol 及右侧的 Cell 全部右移一列。
     *
     * 实现策略与 insertRow 对称：筛选 colStart >= atCol 的 Chunk，从右往左逐 Cell 移动。
     *
     * 注意：newCol 本身不存储数据，插入后 atCol 位置为空列。
     *
     * @param {number} atCol - 插入位置的列号（新列将占据此位置）
     */
    insertCol(atCol) {
        const cellsToMove = [];

        for (const [, chunk] of this.#chunks) {
            if (chunk.colStart + CONFIG.CHUNK_COL_SIZE <= atCol) continue;

            for (const { row, col, cell } of chunk.iterate()) {
                if (col >= atCol) {
                    cellsToMove.push({ row, col, cell });
                }
            }
        }

        for (const { row, col } of cellsToMove) {
            const chunkKey = this.#chunkKey(row, col);
            const chunk = this.#chunks.get(chunkKey);
            if (chunk) chunk.delete(row, col);
        }

        for (const { row, col, cell } of cellsToMove) {
            this.set(row, col + 1, cell);
        }
    }

    // ============================================================
    // 行列删除
    // ============================================================

    /**
     * 删除行：两步操作——
     * 1. 删除 atRow 上的所有 Cell（仅遍历包含 atRow 的 Chunk）。
     * 2. 将 atRow 下方的 Cell 全部上移一行（仅遍历 rowStart > atRow 的 Chunk）。
     *
     * 第一步的 Chunk 筛选使用区间判定（而非精确匹配），因为一个 Chunk 覆盖 1024 行。
     *
     * @param {number} atRow - 要删除的行号
     */
    deleteRow(atRow) {
        for (const [, chunk] of this.#chunks) {
            if (chunk.rowStart > atRow + CONFIG.CHUNK_ROW_SIZE) continue;
            if (chunk.rowStart + CONFIG.CHUNK_ROW_SIZE <= atRow) continue;
            for (const { row, col } of chunk.iterate()) {
                if (row === atRow) {
                    chunk.delete(row, col);
                }
            }
        }

        const cellsToMove = [];

        for (const [, chunk] of this.#chunks) {
            if (chunk.rowStart + CONFIG.CHUNK_ROW_SIZE <= atRow + 1) continue;

            for (const { row, col, cell } of chunk.iterate()) {
                if (row > atRow) {
                    cellsToMove.push({ row, col, cell });
                }
            }
        }

        for (const { row, col } of cellsToMove) {
            const chunkKey = this.#chunkKey(row, col);
            const chunk = this.#chunks.get(chunkKey);
            if (chunk) chunk.delete(row, col);
        }

        for (const { row, col, cell } of cellsToMove) {
            this.set(row - 1, col, cell);
        }
    }

    /**
     * 删除列：两步操作，与 deleteRow 对称——
     * 1. 删除 atCol 上的所有 Cell。
     * 2. 将 atCol 右侧的 Cell 全部左移一列。
     *
     * @param {number} atCol - 要删除的列号
     */
    deleteCol(atCol) {
        for (const [, chunk] of this.#chunks) {
            if (chunk.colStart > atCol + CONFIG.CHUNK_COL_SIZE) continue;
            if (chunk.colStart + CONFIG.CHUNK_COL_SIZE <= atCol) continue;
            for (const { row, col } of chunk.iterate()) {
                if (col === atCol) {
                    chunk.delete(row, col);
                }
            }
        }

        const cellsToMove = [];

        for (const [, chunk] of this.#chunks) {
            if (chunk.colStart + CONFIG.CHUNK_COL_SIZE <= atCol + 1) continue;

            for (const { row, col, cell } of chunk.iterate()) {
                if (col > atCol) {
                    cellsToMove.push({ row, col, cell });
                }
            }
        }

        for (const { row, col } of cellsToMove) {
            const chunkKey = this.#chunkKey(row, col);
            const chunk = this.#chunks.get(chunkKey);
            if (chunk) chunk.delete(row, col);
        }

        for (const { row, col, cell } of cellsToMove) {
            this.set(row, col - 1, cell);
        }
    }

    // ============================================================
    // 行列移动
    // ============================================================

    /**
     * 移动列：将 fromCol 整列移动到 toCol 位置，中间列顺移。
     *
     * 三步操作：
     * 1. 收集 fromCol 上的所有 Cell，从原位置删除。
     * 2. 移动中间列（fromCol+1 到 toCol 逐列左移，或 fromCol-1 到 toCol 逐列右移）。
     * 3. 将收集的 Cell 写入 toCol 位置。
     *
     * 中间列移动通过 #shiftColLeft / #shiftColRight 实现，每次只处理包含目标列的 Chunk。
     *
     * @param {number} fromCol - 源列号
     * @param {number} toCol - 目标列号
     */
    moveCol(fromCol, toCol) {
        if (fromCol === toCol) return;

        // 收集 fromCol 上的所有 Cell
        const colCells = new Map();
        for (const [, chunk] of this.#chunks) {
            if (chunk.colStart > fromCol || chunk.colStart + CONFIG.CHUNK_COL_SIZE <= fromCol) continue;
            for (const { row, col, cell } of chunk.iterate()) {
                if (col === fromCol) {
                    colCells.set(row, cell);
                    chunk.delete(row, col);
                }
            }
        }

        // 移动中间列
        if (fromCol < toCol) {
            for (let c = fromCol + 1; c <= toCol; c++) {
                this.#shiftColLeft(c);
            }
        } else {
            for (let c = fromCol - 1; c >= toCol; c--) {
                this.#shiftColRight(c);
            }
        }

        // 写入目标列
        for (const [row, cell] of colCells) {
            this.set(row, toCol, cell);
        }
    }

    /**
     * 移动行：将 fromRow 整行移动到 toRow 位置，中间行顺移。
     *
     * 实现策略与 moveCol 对称，通过 #shiftRowUp / #shiftRowDown 移动中间行。
     *
     * @param {number} fromRow - 源行号
     * @param {number} toRow - 目标行号
     */
    moveRow(fromRow, toRow) {
        if (fromRow === toRow) return;

        // 收集 fromRow 上的所有 Cell
        const rowCells = new Map();
        for (const [, chunk] of this.#chunks) {
            if (chunk.rowStart > fromRow || chunk.rowStart + CONFIG.CHUNK_ROW_SIZE <= fromRow) continue;
            for (const { row, col, cell } of chunk.iterate()) {
                if (row === fromRow) {
                    rowCells.set(col, cell);
                    chunk.delete(row, col);
                }
            }
        }

        // 移动中间行
        if (fromRow < toRow) {
            for (let r = fromRow + 1; r <= toRow; r++) {
                this.#shiftRowUp(r);
            }
        } else {
            for (let r = fromRow - 1; r >= toRow; r--) {
                this.#shiftRowDown(r);
            }
        }

        // 写入目标行
        for (const [col, cell] of rowCells) {
            this.set(toRow, col, cell);
        }
    }

    /**
     * 将指定列的所有 Cell 左移一列（用于 moveCol 中间列的移动）
     * @param {number} col - 要左移的列号
     */
    #shiftColLeft(targetCol) {
        for (const [, chunk] of this.#chunks) {
            if (chunk.colStart > targetCol || chunk.colStart + CONFIG.CHUNK_COL_SIZE <= targetCol) continue;
            const cellsInCol = [];
            for (const { row, col, cell } of chunk.iterate()) {
                if (col === targetCol) {
                    cellsInCol.push({ row, cell });
                }
            }
            for (const { row, cell } of cellsInCol) {
                chunk.delete(row, targetCol);
                this.set(row, targetCol - 1, cell);
            }
        }
    }

    /**
     * 将指定列的所有 Cell 右移一列（用于 moveCol 中间列的移动）
     * @param {number} col - 要右移的列号
     */
    #shiftColRight(targetCol) {
        for (const [, chunk] of this.#chunks) {
            if (chunk.colStart > targetCol || chunk.colStart + CONFIG.CHUNK_COL_SIZE <= targetCol) continue;
            const cellsInCol = [];
            for (const { row, col, cell } of chunk.iterate()) {
                if (col === targetCol) {
                    cellsInCol.push({ row, cell });
                }
            }
            for (const { row, cell } of cellsInCol) {
                chunk.delete(row, targetCol);
                this.set(row, targetCol + 1, cell);
            }
        }
    }

    /**
     * 将指定行的所有 Cell 上移一行
     * @param {number} row - 要上移的行号
     */
    #shiftRowUp(targetRow) {
        for (const [, chunk] of this.#chunks) {
            if (chunk.rowStart > targetRow || chunk.rowStart + CONFIG.CHUNK_ROW_SIZE <= targetRow) continue;
            const cellsInRow = [];
            for (const { row, col, cell } of chunk.iterate()) {
                if (row === targetRow) {
                    cellsInRow.push({ col, cell });
                }
            }
            for (const { col, cell } of cellsInRow) {
                chunk.delete(targetRow, col);
                this.set(targetRow - 1, col, cell);
            }
        }
    }

    /**
     * 将指定行的所有 Cell 下移一行
     * @param {number} row - 要下移的行号
     */
    #shiftRowDown(targetRow) {
        for (const [, chunk] of this.#chunks) {
            if (chunk.rowStart > targetRow || chunk.rowStart + CONFIG.CHUNK_ROW_SIZE <= targetRow) continue;
            const cellsInRow = [];
            for (const { row, col, cell } of chunk.iterate()) {
                if (row === targetRow) {
                    cellsInRow.push({ col, cell });
                }
            }
            for (const { col, cell } of cellsInRow) {
                chunk.delete(targetRow, col);
                this.set(targetRow + 1, col, cell);
            }
        }
    }

    /**
     * 批量移动行（Batch Move Rows）— 高效的多行重排
     *
     * ⚠️ 旧实现问题（已废弃）：
     * ```javascript
     * // ❌ 错误的链式移动（会导致数据覆盖！）
     * for (const [from, to] of mapping) {
     *     this.moveRow(from, to);  // 每次都读取/写入，数据会被覆盖！
     * }
     * ```
     *
     * ✅ 新实现：基于快照的链条安全移动算法
     *
     * 核心原理：
     * 1. 将映射表分解为独立的「移动链条」
     * 2. 对每个链条：
     *    a. 先提取所有源行的完整快照（避免后续覆盖）
     *    b. 再按目标位置回填快照数据
     * 3. 链条间互不影响，可并行处理
     *
     * 示例（mapping: {0→2, 1→0, 2→1}）：
     * - 分解为单条链条：[0 → 2 → 1 → 0]
     * - 快照提取：[row0_data, row2_data, row1_data]
     * - 回填位置：row2=row0_data, row1=row2_data, row0=row1_data
     *
     * 性能特征：
     * - 时间复杂度：O(n × m)，n=移动行数，m=平均每行列数
     * - 空间复杂度：O(k × m)，k=最长链条长度
     * - IO次数：2次（1次提取 + 1次回填），非 n 次 moveRow
     *
     * @param {Map<number, number>} mapping - 行映射表 (originalRow → targetRow)
     * @param {object} [options={}] - 选项
     * @param {number} [options.fixedRows=0] - 冻结行数
     * @param {Array<number>} [options.hiddenRows=[]] - 隐藏行数组
     * @returns {number} 实际移动的行数
     */
    batchMoveRows(mapping, options = {}) {
        if (!mapping || mapping.size === 0) return 0;

        // 1️⃣ 分解为独立链条
        const chains = this.#decomposeMappingToChains(mapping);

        if (chains.length === 0) return 0;

        // 2️⃣ 逐个链条安全移动
        let totalSwapped = 0;
        for (const chain of chains) {
            const swapped = this.#moveChainSafely(chain, mapping);
            totalSwapped += swapped;
        }

        return totalSwapped;
    }

    /**
     * 将映射表分解为独立的移动链条
     *
     * 链条定义：一系列行形成闭环 A→B→C→...→A
     * 不同链条之间完全独立，可以分别处理
     *
     * @private
     * @param {Map<number, number>} mapping - 行映射表
     * @returns {Array<Array<number>>} 链条数组
     */
    #decomposeMappingToChains(mapping) {
        const visited = new Set();
        const chains = [];

        for (const [source] of mapping) {
            if (visited.has(source)) continue;

            const chain = [];
            let current = source;

            while (!visited.has(current)) {
                visited.add(current);
                chain.push(current);
                current = mapping.get(current);

                if (current === undefined || chain.length > mapping.size) {
                    break; // 异常情况保护
                }
            }

            if (chain.length > 1) {
                chains.push(chain);
            }
        }

        return chains;
    }

    /**
     * 安全地移动单个链条（基于快照机制）
     *
     * ⚠️ 关键改进：解决链式移动的数据覆盖问题
     *
     * ❌ 旧方案（错误）：
     *   直接复制行数据，导致源数据被覆盖
     *   链条越长，数据丢失越严重
     *
     * ✅ 新方案（正确）：
     *   1. 先提取所有行的完整快照
     *   2. 再按目标位置回填快照数据
     *   确保数据完整性
     *
     * @private
     * @param {Array<number>} chain - 行号链条 [source, target1, target2, ...]
     modal.msgSuccess("修改成功");     * @param {Map<number, number>} mapping - 完整的行映射表
     * @returns {number} 实际移动的行数
     */
    #moveChainSafely(chain, mapping) {
        // Step 1: 提取所有行的完整快照
        const snapshots = chain.map((row) => this.#extractRowSnapshot(row));

        // Step 2: 按目标位置回填快照数据
        for (let i = 0; i < chain.length; i++) {
            const sourceRow = chain[i];
            const targetRow = mapping.get(sourceRow);

            if (targetRow !== undefined && sourceRow !== targetRow) {
                this.#restoreRowFromSnapshot(targetRow, snapshots[i]);
            }
        }

        return chain.filter((row, i) => {
            const target = chain[(i + 1) % chain.length];
            return row !== target;
        }).length;
    }

    /**
     * 提取指定行的完整数据快照
     *
     * @private
     * @param {number} row - 行号
     * @returns {Map<number, import("../Cell.js").Cell>} 列→单元格 映射
     */
    #extractRowSnapshot(row) {
        const snapshot = new Map();

        for (const [, chunk] of this.#chunks) {
            if (chunk.rowStart > row || chunk.rowStart + CONFIG.CHUNK_ROW_SIZE <= row) continue;

            for (const { row: r, col, cell } of chunk.iterate()) {
                if (r === row) {
                    snapshot.set(col, cell);
                }
            }
        }

        return snapshot;
    }

    /**
     * 从快照恢复整行数据到目标行
     *
     * @private
     * @param {number} targetRow - 目标行号
     * @param {Map<number, import("../Cell.js").Cell>} snapshot - 行快照
     */
    #restoreRowFromSnapshot(targetRow, snapshot) {
        // 先清除目标行现有数据
        this.#clearRow(targetRow);

        // 从快照恢复数据
        for (const [col, cell] of snapshot) {
            this.set(targetRow, col, cell);
        }
    }

    /**
     * 清除指定行的所有数据
     *
     * @private
     * @param {number} row - 行号
     */
    #clearRow(row) {
        for (const [, chunk] of this.#chunks) {
            if (chunk.rowStart > row || chunk.rowStart + CONFIG.CHUNK_ROW_SIZE <= row) continue;

            const cellsToDelete = [];
            for (const { row: r, col } of chunk.iterate()) {
                if (r === row) {
                    cellsToDelete.push(col);
                }
            }

            for (const col of cellsToDelete) {
                chunk.delete(row, col);
            }
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

    /**
     * 获取当前数据区域的最大行号
     *
     * 遍历所有非空 Chunk，取 rowStart + CHUNK_ROW_SIZE - 1 的最大值。
     * 注意：返回的是 Chunk 覆盖范围的最大行号，而非精确的"最后一个有数据行"的行号。
     * 无数据时返回 -1。
     *
     * @returns {number} 最大行号，-1 表示无数据
     */
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

    /**
     * 获取当前数据区域的最大列号
     *
     * 与 getMaxRow 对称，返回非空 Chunk 中 colStart + CHUNK_COL_SIZE - 1 的最大值。
     * 无数据时返回 -1。
     *
     * @returns {number} 最大列号，-1 表示无数据
     */
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
