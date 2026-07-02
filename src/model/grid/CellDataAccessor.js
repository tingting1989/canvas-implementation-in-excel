/**
 * 单元格数据访问代理（CellDataAccessor）
 *
 * 统一管理分页模式下的单元格数据读写，自动处理行号转换。
 * 所有 Strategy / Plugin 层代码应通过此类访问 cellStore，
 * 避免遗漏 toRealRow() 转换导致的 bug。
 *
 * ## 设计目标
 *
 * 1. **零心智负担**：调用方始终传入页面相对行号，内部自动转换
 * 2. **单一职责**：只负责数据读写 + 行号转换，不包含业务逻辑
 * 3. **透明代理**：API 与 CellStore 完全一致，替换成本极低
 * 4. **可测试**：纯函数式转换，无副作用
 *
 * ## 使用方式
 *
 * ```js
 * const accessor = sheet.cellDataAccessor;
 *
 * // 读取（自动转换 pageRow → realRow）
 * const cell = accessor.get(pageRow, pageCol);
 *
 * // 写入（自动转换 pageRow → realRow）
 * accessor.set(pageRow, pageCol, { value: 'hello', styleId: 0 });
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

    get #pageContext() {
        return this.#sheet.pageContext;
    }

    // ─── 核心转换方法 ─────────────────────────────────────

    /**
     * 页面相对行号 → 实际行号
     * @param {number} pageRow - 页面相对行号
     * @returns {number} 实际行号
     */
    toRealRow(pageRow) {
        return this.#pageContext.toRealRow(pageRow);
    }

    /**
     * 转换页面相对坐标到实际坐标
     * @param {number} row - 页面相对行号或列号
     * @param {number} col - 列号（列不受分页影响，原样返回）
     * @returns {{ realRow: number, realCol: number }}
     */
    #toRealCoords(row, col) {
        return {
            realRow: this.toRealRow(row),
            realCol: col,
        };
    }

    // ─── 单元格读取 ───────────────────────────────────────

    /**
     * 获取单元格数据（接受页面相对行号）
     * @param {number} pageRow - 页面相对行号
     * @param {number} col - 列号
     * @returns {import("../store/Cell.js").Cell|null}
     */
    get(pageRow, col) {
        const { realRow, realCol } = this.#toRealCoords(pageRow, col);
        return this.#cellStore.get(realRow, realCol);
    }

    /**
     * 批量获取矩形区域的单元格数据
     * 注意：此方法会一次性加载所有数据到内存。
     * 对于大范围（>1000 行），请使用 forEach() 或迭代器。
     * @param {number} topRow - 左上角页面行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角页面行号
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
     * @param {number} pageRow - 页面相对行号
     * @param {number} col - 列号
     * @returns {*} 单元格值
     */
    getValue(pageRow, col) {
        const cell = this.get(pageRow, col);
        return cell ? cell.value : undefined;
    }

    /**
     * 检查单元格是否存在
     * @param {number} pageRow - 页面相对行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    has(pageRow, col) {
        return this.get(pageRow, col) !== null && this.get(pageRow, col) !== undefined;
    }

    // ─── 单元格写入 ───────────────────────────────────────

    /**
     * 设置单元格数据（接受页面相对行号）
     * 注意：此方法直接操作 cellStore，不触发 Sheet 的事件和命令历史。
     * 如需完整功能（撤销/重做、事件通知），请使用 sheet.setCell()
     *
     * @param {number} pageRow - 页面相对行号
     * @param {number} col - 列号
     * @param {import("../store/Cell.js").Cell} cell - 单元格对象
     */
    set(pageRow, col, cell) {
        const { realRow, realCol } = this.#toRealCoords(pageRow, col);
        this.#cellStore.set(realRow, realCol, cell);
    }

    /**
     * 批量设置矩形区域的数据
     * @param {number} topRow - 左上角页面行号
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
     * @param {number} pageRow - 页面相对行号
     * @param {number} col - 列号
     */
    delete(pageRow, col) {
        const { realRow, realCol } = this.#toRealCoords(pageRow, col);
        this.#cellStore.delete(realRow, realCol);
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
