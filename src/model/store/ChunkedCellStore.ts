import { Chunk } from "./Chunk";
import { Cell } from "./Cell";
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
     */
    #chunks: Map<string, Chunk> = new Map();

    /**
     * 缓存的最大行号（-1 表示未初始化或无效）
     */
    #cachedMaxRow: number = -1;

    /**
     * 缓存的最大列号（-1 表示未初始化或无效）
     */
    #cachedMaxCol: number = -1;

    /**
     * 构造分块单元格存储
     * 初始化空的块映射表和无效的缓存
     */
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
     * @param row - 逻辑行号
     * @param col - 逻辑列号
     * @returns 格式 "chunkRowIndex:chunkColIndex"
     */
    #chunkKey(row: number, col: number): string {
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
     * @param row - 逻辑行号
     * @param col - 逻辑列号
     * @returns Chunk 实例
     */
    #getChunk(row: number, col: number): Chunk {
        const key = this.#chunkKey(row, col);
        if (!this.#chunks.has(key)) {
            const [r, c] = key.split(":").map(Number);
            this.#chunks.set(key, new Chunk(r * CONFIG.CHUNK_ROW_SIZE, c * CONFIG.CHUNK_COL_SIZE));
        }
        return this.#chunks.get(key)!;
    }

    // ============================================================
    // CRUD 操作
    // ============================================================

    /**
     * 获取指定位置的单元格
     *
     * @param row - 行号
     * @param col - 列号
     * @returns 单元格实例或 undefined
     */
    get(row: number, col: number): Cell | undefined {
        return this.#getChunk(row, col).get(row, col);
    }

    /**
     * 设置指定位置的单元格
     *
     * @param row - 行号
     * @param col - 列号
     * @param cell - 单元格实例
     */
    set(row: number, col: number, cell: Cell): void {
        const chunk = this.#getChunk(row, col);
        chunk.set(row, col, cell);

        if (row > this.#cachedMaxRow) {
            this.#cachedMaxRow = row;
        }
        const chunkMaxCol = chunk.colStart + CONFIG.CHUNK_COL_SIZE - 1;
        if (chunkMaxCol > this.#cachedMaxCol) {
            this.#cachedMaxCol = chunkMaxCol;
        }
    }

    /**
     * 删除指定位置的单元格
     *
     * @param row - 行号
     * @param col - 列号
     */
    delete(row: number, col: number): void {
        const chunk = this.#getChunk(row, col);
        chunk.delete(row, col);

        if (chunk.cells.size === 0) {
            if (row >= chunk.rowStart && row < chunk.rowStart + CONFIG.CHUNK_ROW_SIZE) {
                this.#cachedMaxRow = -1;
            }
            if (col >= chunk.colStart && col < chunk.colStart + CONFIG.CHUNK_COL_SIZE) {
                this.#cachedMaxCol = -1;
            }
        }
    }

    // ============================================================
    // 行列插入
    // ============================================================

    /**
     * 插入行：在 atRow 位置插入一行，atRow 及以下的 Cell 全部下移一行。
     *
     * @param atRow - 插入位置的行号（新行将占据此位置）
     */
    insertRow(atRow: number): void {
        const cellsToMove: Array<{ row: number; col: number; cell: Cell }> = [];

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
     * @param atCol - 插入位置的列号（新列将占据此位置）
     */
    insertCol(atCol: number): void {
        const cellsToMove: Array<{ row: number; col: number; cell: Cell }> = [];

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
     * @param atRow - 要删除的行号
     */
    deleteRow(atRow: number): void {
        for (const [, chunk] of this.#chunks) {
            if (chunk.rowStart > atRow + CONFIG.CHUNK_ROW_SIZE) continue;
            if (chunk.rowStart + CONFIG.CHUNK_ROW_SIZE <= atRow) continue;
            for (const { row, col } of chunk.iterate()) {
                if (row === atRow) {
                    chunk.delete(row, col);
                }
            }
        }

        const cellsToMove: Array<{ row: number; col: number; cell: Cell }> = [];

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
     * @param atCol - 要删除的列号
     */
    deleteCol(atCol: number): void {
        for (const [, chunk] of this.#chunks) {
            if (chunk.colStart > atCol + CONFIG.CHUNK_COL_SIZE) continue;
            if (chunk.colStart + CONFIG.CHUNK_COL_SIZE <= atCol) continue;
            for (const { row, col } of chunk.iterate()) {
                if (col === atCol) {
                    chunk.delete(row, col);
                }
            }
        }

        const cellsToMove: Array<{ row: number; col: number; cell: Cell }> = [];

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
     * @param fromCol - 源列号
     * @param toCol - 目标列号
     */
    moveCol(fromCol: number, toCol: number): void {
        if (fromCol === toCol) return;

        const colCells = new Map<number, Cell>();
        for (const [, chunk] of this.#chunks) {
            if (chunk.colStart > fromCol || chunk.colStart + CONFIG.CHUNK_COL_SIZE <= fromCol) continue;
            for (const { row, col, cell } of chunk.iterate()) {
                if (col === fromCol) {
                    colCells.set(row, cell);
                    chunk.delete(row, col);
                }
            }
        }

        if (fromCol < toCol) {
            for (let c = fromCol + 1; c <= toCol; c++) {
                this.#shiftColLeft(c);
            }
        } else {
            for (let c = fromCol - 1; c >= toCol; c--) {
                this.#shiftColRight(c);
            }
        }

        for (const [row, cell] of colCells) {
            this.set(row, toCol, cell);
        }
    }

    /**
     * 移动行：将 fromRow 整行移动到 toRow 位置，中间行顺移。
     *
     * @param fromRow - 源行号
     * @param toRow - 目标行号
     */
    moveRow(fromRow: number, toRow: number): void {
        if (fromRow === toRow) return;

        const rowCells = new Map<number, Cell>();
        for (const [, chunk] of this.#chunks) {
            if (chunk.rowStart > fromRow || chunk.rowStart + CONFIG.CHUNK_ROW_SIZE <= fromRow) continue;
            for (const { row, col, cell } of chunk.iterate()) {
                if (row === fromRow) {
                    rowCells.set(col, cell);
                    chunk.delete(row, col);
                }
            }
        }

        if (fromRow < toRow) {
            for (let r = fromRow + 1; r <= toRow; r++) {
                this.#shiftRowUp(r);
            }
        } else {
            for (let r = fromRow - 1; r >= toRow; r--) {
                this.#shiftRowDown(r);
            }
        }

        for (const [col, cell] of rowCells) {
            this.set(toRow, col, cell);
        }
    }

    /**
     * 将指定列的所有 Cell 左移一列（用于 moveCol 中间列的移动）
     * @param targetCol - 要左移的列号
     */
    #shiftColLeft(targetCol: number): void {
        for (const [, chunk] of this.#chunks) {
            if (chunk.colStart > targetCol || chunk.colStart + CONFIG.CHUNK_COL_SIZE <= targetCol) continue;
            const cellsInCol: Array<{ row: number; cell: Cell }> = [];
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
     * @param targetCol - 要右移的列号
     */
    #shiftColRight(targetCol: number): void {
        for (const [, chunk] of this.#chunks) {
            if (chunk.colStart > targetCol || chunk.colStart + CONFIG.CHUNK_COL_SIZE <= targetCol) continue;
            const cellsInCol: Array<{ row: number; cell: Cell }> = [];
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
     * 将指定行的所有 Cell 上移一行（用于 moveRow 中间行的移动）
     * @param targetRow - 要上移的行号
     */
    #shiftRowUp(targetRow: number): void {
        for (const [, chunk] of this.#chunks) {
            if (chunk.rowStart > targetRow || chunk.rowStart + CONFIG.CHUNK_ROW_SIZE <= targetRow) continue;
            const cellsInRow: Array<{ col: number; cell: Cell }> = [];
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
     * 将指定行的所有 Cell 下移一行（用于 moveRow 中间行的移动）
     * @param targetRow - 要下移的行号
     */
    #shiftRowDown(targetRow: number): void {
        for (const [, chunk] of this.#chunks) {
            if (chunk.rowStart > targetRow || chunk.rowStart + CONFIG.CHUNK_ROW_SIZE <= targetRow) continue;
            const cellsInRow: Array<{ col: number; cell: Cell }> = [];
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
     * ✅ 新实现：基于快照的链条安全移动算法
     *
     * 核心原理：
     * 1. 将映射表分解为独立的「移动链条」
     * 2. 对每个链条：
     *    a. 先提取所有源行的完整快照（避免后续覆盖）
     *    b. 再按目标位置回填快照数据
     * 3. 链条间互不影响，可并行处理
     *
     * @param mapping - 行映射表 (originalRow → targetRow)
     * @param options - 选项
     * @returns 实际移动的行数
     */
    batchMoveRows(mapping: Map<number, number>, options: { fixedRows?: number; hiddenRows?: number[] } = {}): number {
        if (!mapping || mapping.size === 0) return 0;

        const chains = this.#decomposeMappingToChains(mapping);

        if (chains.length === 0) return 0;

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
     * @param mapping - 行映射表
     * @returns 链条数组
     */
    #decomposeMappingToChains(mapping: Map<number, number>): number[][] {
        const visited = new Set<number>();
        const chains: number[][] = [];

        for (const [source] of mapping) {
            if (visited.has(source)) continue;

            const chain: number[] = [];
            let current = source;

            while (!visited.has(current)) {
                visited.add(current);
                chain.push(current);
                current = mapping.get(current)!;

                if (current === undefined || chain.length > mapping.size) {
                    break;
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
     * @param chain - 行号链条
     * @param mapping - 完整的行映射表
     * @returns 实际移动的行数
     */
    #moveChainSafely(chain: number[], mapping: Map<number, number>): number {
        const snapshots = chain.map((row) => this.#extractRowSnapshot(row));

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
     * @param row - 行号
     * @returns 列→单元格 映射
     */
    #extractRowSnapshot(row: number): Map<number, Cell> {
        const snapshot = new Map<number, Cell>();

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
     * @param targetRow - 目标行号
     * @param snapshot - 行快照
     */
    #restoreRowFromSnapshot(targetRow: number, snapshot: Map<number, Cell>): void {
        this.#clearRow(targetRow);

        for (const [col, cell] of snapshot) {
            this.set(targetRow, col, cell);
        }
    }

    /**
     * 清除指定行的所有数据
     *
     * @param row - 行号
     */
    #clearRow(row: number): void {
        for (const [, chunk] of this.#chunks) {
            if (chunk.rowStart > row || chunk.rowStart + CONFIG.CHUNK_ROW_SIZE <= row) continue;

            const cellsToDelete: number[] = [];
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
     * 获取当前数据区域的最大行号（带缓存优化）
     *
     * @returns 最大行号，-1 表示无数据
     */
    getMaxRow(): number {
        if (this.#cachedMaxRow >= 0) {
            return this.#cachedMaxRow;
        }

        let maxRow = -1;
        for (const chunk of this.#chunks.values()) {
            if (chunk.cells.size > 0) {
                for (const { row } of chunk.iterate()) {
                    if (row > maxRow) maxRow = row;
                }
            }
        }

        this.#cachedMaxRow = maxRow;
        return maxRow;
    }

    /**
     * 获取当前数据区域的最大列号
     *
     * @returns 最大列号，-1 表示无数据
     */
    getMaxCol(): number {
        if (this.#cachedMaxCol >= 0) {
            return this.#cachedMaxCol;
        }

        let maxCol = -1;
        for (const chunk of this.#chunks.values()) {
            if (chunk.cells.size > 0) {
                const chunkMax = chunk.colStart + CONFIG.CHUNK_COL_SIZE - 1;
                if (chunkMax > maxCol) maxCol = chunkMax;
            }
        }

        this.#cachedMaxCol = maxCol;
        return maxCol;
    }

    /**
     * 清空所有单元格数据（Clear All Cell Data）
     *
     * @returns 被清空的 Chunk 数量
     */
    clear(): number {
        const size = this.#chunks.size;
        this.#chunks.clear();
        this.#cachedMaxRow = -1;
        this.#cachedMaxCol = -1;
        return size;
    }

    /**
     * 遍历所有非空单元格（Iterator for All Cells）
     *
     * @yields 包含逻辑坐标和单元格的对象
     */
    *[Symbol.iterator](): Generator<{ row: number; col: number; cell: Cell }> {
        for (const [, chunk] of this.#chunks) {
            yield* chunk.iterate();
        }
    }

    /**
     * 获取所有 Chunk 的迭代器（推荐用于遍历）
     *
     * @returns Map entries 迭代器
     */
    get chunks(): IterableIterator<[string, Chunk]> {
        return this.#chunks.entries();
    }
}
