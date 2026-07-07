/**
 * 单元格数据访问代理（CellDataAccessor）
 *
 * 统一管理单元格数据读写，提供与 CellStore 一致的 API。
 * 所有 Strategy / Plugin 层代码应通过此类访问 cellStore。
 *
 * ## 使用方式
 *
 * ```js
 * const accessor = sheet.cellDataAccessor;
 *
 * // 读取
 * const cell = accessor.get(row, col);
 *
 * // 写入
 * accessor.set(row, col, { value: 'hello', styleId: 0 });
 *
 * // 批量操作
 * const cells = accessor.getRange(topRow, topCol, bottomRow, bottomCol);
 * ```
 */
export class CellDataAccessor {
    /** @type {import("../workbook/Sheet.js").Sheet} */
    #sheet;

    /**
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 工作表实例
     */
    constructor(sheet) {
        this.#sheet = sheet;
    }

    get #cellStore() {
        return this.#sheet.cellStore;
    }

    // ─── 单元格读取 ───────────────────────────────────────

    /**
     * 获取单元格数据
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {import("../store/Cell.js").Cell|null}
     */
    get(row, col) {
        return this.#cellStore.get(row, col);
    }

    /**
     * 批量获取矩形区域的单元格数据
     * 注意：此方法会一次性加载所有数据到内存。
     * 对于大范围（>1000 行），请使用 forEach() 或迭代器。
     * @param {number} topRow - 左上角行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角行号
     * @param {number} bottomCol - 右下角列号
     * @returns {Array<Array<import("../store/Cell.js").Cell|null>>} 二维数组
     */
    getRange(topRow, topCol, bottomRow, bottomCol) {
        const cells = [];
        for (let r = topRow; r <= bottomRow; r++) {
            const rowData = [];
            for (let c = topCol; c <= bottomCol; c++) {
                rowData.push(this.get(r, c));
            }
            cells.push(rowData);
        }
        return cells;
    }

    /**
     * 获取单元格值（便捷方法）
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {*} 单元格值
     */
    getValue(row, col) {
        const cell = this.get(row, col);
        return cell ? cell.value : undefined;
    }

    /**
     * 检查单元格是否存在
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    has(row, col) {
        return this.get(row, col) !== null && this.get(row, col) !== undefined;
    }

    // ─── 单元格写入 ───────────────────────────────────────

    /**
     * 设置单元格数据
     * 注意：此方法直接操作 cellStore，不触发 Sheet 的事件和命令历史。
     * 如需完整功能（撤销/重做、事件通知），请使用 sheet.setCell()
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {import("../store/Cell.js").Cell} cell - 单元格对象
     */
    set(row, col, cell) {
        this.#cellStore.set(row, col, cell);
    }

    /**
     * 批量设置矩形区域的数据
     * @param {number} topRow - 左上角行号
     * @param {number} topCol - 左上角列号
     * @param {Array<Array<import("../store/Cell.js").Cell>>} cells - 二维数组
     */
    setRange(topRow, topCol, cells) {
        for (let r = 0; r < cells.length; r++) {
            for (let c = 0; c < cells[r].length; c++) {
                if (cells[r][c]) {
                    this.set(topRow + r, topCol + c, cells[r][c]);
                }
            }
        }
    }

    /**
     * 删除单元格数据
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    delete(row, col) {
        this.#cellStore.delete(row, col);
    }

    // ─── 高级查询 ─────────────────────────────────────────

    /**
     * 获取区域内的所有非空单元格及其坐标
     * @param {number} topRow - 左上角页面行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角页面行号
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
     * 提取区域内的值矩阵（用于复制/粘贴等操作）
     * @param {number} topRow - 左上角页面行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角页面行号
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

    // ─── 迭代器支持 ───────────────────────────────────────

    /**
     * 创建区域迭代器（用于遍历大范围数据时节省内存）
     * @param {number} topRow - 左上角页面行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角页面行号
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
     * 遍历区域内的每个单元格
     * @param {number} topRow - 左上角页面行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角页面行号
     * @param {number} bottomCol - 右下角列号
     * @param {function} callback - 回调函数 (pageRow, pageCol, cell) => void
     */
    forEach(topRow, topCol, bottomRow, bottomCol, callback) {
        for (let r = topRow; r <= bottomRow; r++) {
            for (let c = topCol; c <= bottomCol; c++) {
                callback(r, c, this.get(r, c));
            }
        }
    }
}
