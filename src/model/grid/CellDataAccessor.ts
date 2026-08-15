import { Cell } from "../store/Cell";
import { ChunkedCellStore } from "../store/ChunkedCellStore";

/** Sheet 最小接口（仅 CellDataAccessor 所需） */
interface SheetLike {
    cellStore: ChunkedCellStore;
}

/**
 * 单元格数据访问代理（CellDataAccessor）
 *
 * 提供高效的批量数据操作方法，消除重复的遍历逻辑。
 * 核心价值：统一非空单元格提取、值矩阵构建、批量遍历等高频操作。
 *
 * ## 使用场景
 *
 * ```ts
 * const accessor = sheet.cellDataAccessor;
 *
 * // 1. 获取非空单元格（用于验证、删除、剪切）
 * const nonEmpty = accessor.getNonEmptyCells(0, 0, 100, 10);
 *
 * // 2. 提取值矩阵（用于导出、复制、公式计算）
 * const values = accessor.getValueMatrix(0, 0, 10, 5);
 *
 * // 3. 批量遍历（用于样式应用、合并检测）
 * accessor.forEach(0, 0, 100, 10, (r, c, cell) => {
 *     console.log(`[${r},${c}] =`, cell?.value);
 * });
 *
 * * 4. 迭代器模式（节省内存）
 * for (const {row, col, cell} of accessor[Symbol.iterator](0, 0, 1000, 20)) {
 *     if (cell) process(cell);
 * }
 *
 * // 5. 批量写入（用于导入、粘贴）
 * accessor.setRange(0, 0, importedData);
 * ```
 */
export class CellDataAccessor {
    #sheet: SheetLike;

    constructor(sheet: SheetLike) {
        this.#sheet = sheet;
    }

    get #cellStore(): ChunkedCellStore {
        return this.#sheet.cellStore;
    }

    /**
     * 获取单个单元格数据（基础读取方法）
     * @param row - 行号
     * @param col - 列号
     * @returns 单元格实例或 null
     */
    get(row: number, col: number): Cell | null {
        return this.#cellStore.get(row, col);
    }

    /**
     * 获取区域内所有非空单元格及其坐标
     *
     * @param topRow - 左上角行号
     * @param topCol - 左上角列号
     * @param bottomRow - 右下角行号
     * @param bottomCol - 右下角列号
     * @returns 非空单元格数组
     */
    getNonEmptyCells(topRow: number, topCol: number, bottomRow: number, bottomCol: number): Array<{ row: number; col: number; cell: Cell }> {
        const result: Array<{ row: number; col: number; cell: Cell }> = [];
        for (let r = topRow; r <= bottomRow; r++) {
            for (let c = topCol; c <= bottomCol; c++) {
                const cell = this.get(r, c);
                if (cell && cell.value !== "" && cell.value != null) {
                    result.push({ row: r, col: c, cell });
                }
            }
        }
        return result;
    }

    /**
     * 提取区域内的值矩阵（纯值二维数组）
     *
     * 特点：空单元格自动填充空字符串 ""
     *
     * @param topRow - 左上角行号
     * @param topCol - 左上角列号
     * @param bottomRow - 右下角行号
     * @param bottomCol - 右下角列号
     * @returns 二维值数组
     */
    getValueMatrix(topRow: number, topCol: number, bottomRow: number, bottomCol: number): unknown[][] {
        const matrix: unknown[][] = [];
        for (let r = topRow; r <= bottomRow; r++) {
            const rowData: unknown[] = [];
            for (let c = topCol; c <= bottomCol; c++) {
                const cell = this.get(r, c);
                rowData.push(cell ? cell.value : "");
            }
            matrix.push(rowData);
        }
        return matrix;
    }

    /**
     * 遍历区域内的每个单元格（回调模式）
     *
     * 性能提示：对于 >1000 行的大范围，优先使用迭代器模式 [Symbol.iterator]
     *
     * @param topRow - 左上角行号
     * @param topCol - 左上角列号
     * @param bottomRow - 右下角行号
     * @param bottomCol - 右下角列号
     * @param callback - 回调函数 (row, col, cell) => void
     */
    forEach(
        topRow: number,
        topCol: number,
        bottomRow: number,
        bottomCol: number,
        callback: (row: number, col: number, cell: Cell | null) => void,
    ): void {
        for (let r = topRow; r <= bottomRow; r++) {
            for (let c = topCol; c <= bottomCol; c++) {
                callback(r, c, this.get(r, c));
            }
        }
    }

    /**
     * 区域迭代器（生成器模式，惰性求值）
     *
     * 使用示例：
     * ```ts
     * for (const {row, col, cell} of accessor[Symbol.iterator](0, 0, 10000, 20)) {
     *     if (!cell) continue;
     *     if (foundTarget(cell)) break;  // 可提前退出
     * }
     * ```
     *
     * @param topRow - 左上角行号
     * @param topCol - 左上角列号
     * @param bottomRow - 右下角行号
     * @param bottomCol - 右下角列号
     * @yields 包含行列号和单元格的对象
     */
    *[Symbol.iterator](topRow: number, topCol: number, bottomRow: number, bottomCol: number): Generator<{ row: number; col: number; cell: Cell | null }> {
        for (let r = topRow; r <= bottomRow; r++) {
            for (let c = topCol; c <= bottomCol; c++) {
                yield { row: r, col: c, cell: this.get(r, c) };
            }
        }
    }

    /**
     * 批量写入矩形区域的数据
     *
     * ⚠️ 注意：此方法直接操作 cellStore，不触发事件和撤销历史。
     * 如需完整功能，请使用 sheet.setCell() 循环调用
     *
     * @param topRow - 左上角起始行号
     * @param topCol - 左上角起始列号
     * @param cells - 二维单元格数组
     */
    setRange(topRow: number, topCol: number, cells: Cell[][]): void {
        for (let r = 0; r < cells.length; r++) {
            for (let c = 0; c < cells[r].length; c++) {
                if (cells[r][c]) {
                    this.#cellStore.set(topRow + r, topCol + c, cells[r][c]);
                }
            }
        }
    }

    /**
     * 清空所有单元格数据（Clear All Data）
     *
     * 收集当前所有非空单元格的信息（用于撤销），然后清空整个存储。
     *
     * ⚠️ 注意：返回值用于撤销支持，调用方应保存并在需要时恢复
     *
     * @returns 包含变更信息和清空数量的对象
     */
    clearAll(): { changes: Array<{ row: number; col: number; oldValue: unknown; styleId: number }>; clearedCount: number } {
        const changes: Array<{ row: number; col: number; oldValue: unknown; styleId: number }> = [];

        // ✅ 使用显式的 chunks getter 避免迭代器兼容性问题
        for (const [, chunk] of this.#cellStore.chunks) {
            for (const { row, col, cell } of chunk.iterate()) {
                if (cell && cell.value !== "" && cell.value != null) {
                    changes.push({
                        row,
                        col,
                        oldValue: cell.value,
                        styleId: cell.styleId || 0,
                    });
                }
            }
        }

        const clearedCount = this.#cellStore.clear();

        return { changes, clearedCount };
    }

    /**
     * 清空指定区域内的数据（Clear Range Data）
     *
     * 与 clearAll() 类似，但仅处理指定矩形范围内的单元格。
     *
     * @param topRow - 左上角行号
     * @param topCol - 左上角列号
     * @param bottomRow - 右下角行号
     * @param bottomCol - 右下角列号
     * @returns 包含变更信息和清空数量的对象
     */
    clearRange(
        topRow: number,
        topCol: number,
        bottomRow: number,
        bottomCol: number,
    ): { changes: Array<{ row: number; col: number; oldValue: unknown; styleId: number }>; clearedCount: number } {
        const changes: Array<{ row: number; col: number; oldValue: unknown; styleId: number }> = [];

        for (let r = topRow; r <= bottomRow; r++) {
            for (let c = topCol; c <= bottomCol; c++) {
                const cell = this.get(r, c);
                if (cell && cell.value !== "" && cell.value != null) {
                    changes.push({
                        row: r,
                        col: c,
                        oldValue: cell.value,
                        styleId: cell.styleId || 0,
                    });
                    this.#cellStore.delete(r, c);
                }
            }
        }

        return { changes, clearedCount: changes.length };
    }
}