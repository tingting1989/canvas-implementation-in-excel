/**
 * 单元格数据访问代理（CellDataAccessor）
 *
 * 提供高效的批量数据操作方法，消除重复的遍历逻辑。
 * 核心价值：统一非空单元格提取、值矩阵构建、批量遍历等高频操作。
 *
 * ## 使用场景
 *
 * ```js
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
 * // 4. 迭代器模式（节省内存）
 * for (const {row, col, cell} of accessor[Symbol.iterator](0, 0, 1000, 20)) {
 *     if (cell) process(cell);
 * }
 *
 * // 5. 批量写入（用于导入、粘贴）
 * accessor.setRange(0, 0, importedData);
 * ```
 */
export class CellDataAccessor {
    /** @type {import("../workbook/Sheet.js").Sheet} */
    #sheet;

    constructor(sheet) {
        this.#sheet = sheet;
    }

    get #cellStore() {
        return this.#sheet.cellStore;
    }

    /**
     * 获取单个单元格数据（基础读取方法）
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {import("../store/Cell.js").Cell|null}
     */
    get(row, col) {
        return this.#cellStore.get(row, col);
    }

    /**
     * 获取区域内所有非空单元格及其坐标
     *
     * 适用场景：
     * - 数据验证（检查重复值、唯一性）
     * - 批量删除/剪切前收集目标
     * - 条件格式计算
     *
     * @param {number} topRow - 左上角行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角行号
     * @param {number} bottomCol - 右下角列号
     * @returns {Array<{row:number, col:number, cell: import("../store/Cell.js").Cell}>}
     */
    getNonEmptyCells(topRow, topCol, bottomRow, bottomCol) {
        const result = [];
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
     * 适用场景：
     * - 导出 Excel/CSV
     * - 复制/剪贴板操作
     * - 公式计算（SUM, AVERAGE等聚合函数）
     * - 自动填充源数据获取
     *
     * 特点：空单元格自动填充空字符串 ""
     *
     * @param {number} topRow - 左上角行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角行号
     * @param {number} bottomCol - 右下角列号
     * @returns {Array<Array<*>>} 二维值数组
     */
    getValueMatrix(topRow, topCol, bottomRow, bottomCol) {
        const matrix = [];
        for (let r = topRow; r <= bottomRow; r++) {
            const rowData = [];
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
     * 适用场景：
     * - 批量样式修改
     * - 合并单元格检测与处理
     * - 条件判断与标记
     * - 数据统计与汇总
     *
     * 性能提示：对于 >1000 行的大范围，优先使用迭代器模式 [Symbol.iterator]
     *
     * @param {number} topRow - 左上角行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角行号
     * @param {number} bottomCol - 右下角列号
     * @param {function} callback - 回调函数 (row, col, cell) => void
     */
    forEach(topRow, topCol, bottomRow, bottomCol, callback) {
        for (let r = topRow; r <= bottomRow; r++) {
            for (let c = topCol; c <= bottomCol; c++) {
                callback(r, c, this.get(r, c));
            }
        }
    }

    /**
     * 区域迭代器（生成器模式，惰性求值）
     *
     * 适用场景：
     * - 大范围数据遍历（>1000行）时节省内存
     * - 需要提前终止遍历的场景
     * - 流式数据处理
     *
     * 使用示例：
     * ```js
     * for (const {row, col, cell} of accessor[Symbol.iterator](0, 0, 10000, 20)) {
     *     if (!cell) continue;
     *     if (foundTarget(cell)) break;  // 可提前退出
     * }
     * ```
     *
     * @param {number} topRow - 左上角行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角行号
     * @param {number} bottomCol - 右下角列号
     * @yields {{row:number, col:number, cell: import("../store/Cell.js").Cell|null}}
     */
    *[Symbol.iterator](topRow, topCol, bottomRow, bottomCol) {
        for (let r = topRow; r <= bottomRow; r++) {
            for (let c = topCol; c <= bottomCol; c++) {
                yield { row: r, col: c, cell: this.get(r, c) };
            }
        }
    }

    /**
     * 批量写入矩形区域的数据
     *
     * 适用场景：
     * - 导入外部数据（Excel、CSV解析后）
     * - 粘贴操作
     * - 批量初始化
     *
     * ⚠️ 注意：此方法直接操作 cellStore，不触发事件和撤销历史。
     * 如需完整功能，请使用 sheet.setCell() 循环调用
     *
     * @param {number} topRow - 左上角起始行号
     * @param {number} topCol - 左上角起始列号
     * @param {Array<Array<import("../store/Cell.js").Cell>>} cells - 二维单元格数组
     */
    setRange(topRow, topCol, cells) {
        for (let r = 0; r < cells.length; r++) {
            for (let c = 0; c < cells[r].length; c++) {
                if (cells[r][c]) {
                    this.#cellStore.set(topRow + r, topCol + c, cells[r][c]);
                }
            }
        }
    }
}
