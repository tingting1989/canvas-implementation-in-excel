/**
 * 冻结边界信息
 *
 * 在 Layout 阶段预计算，供 Fragmentizer 使用。
 * 将"是否有冻结"、"冻结在哪"从渲染时的隐式判断变为显式数据。
 */
export class FrozenBoundaryInfo {
    /** @type {number} 固定列数（来自 sheet.fixedColumnsStart） */
    fixedCols;

    /** @type {number} 固定行数（来自 sheet.fixedRowsTop） */
    fixedRows;

    /** @type {boolean} 是否存在水平冻结边界 */
    get hasHorizontalBoundary() {
        return this.fixedCols > 0;
    }

    /** @type {boolean} 是否存在垂直冻结边界 */
    get hasVerticalBoundary() {
        return this.fixedRows > 0;
    }

    /**
     * 判断逻辑单元格是否跨越水平冻结边界
     * @param {import('./LogicalCell.js').LogicalCell} cell
     * @returns {boolean}
     */
    splitsCellHorizontally(cell) {
        return this.hasHorizontalBoundary && cell.crossesBoundary(this.fixedCols);
    }

    /**
     * 判断逻辑单元格是否跨越垂直冻结边界
     * @param {import('./LogicalCell.js').LogicalCell} cell
     * @returns {boolean}
     */
    splitsCellVertically(cell) {
        return this.hasVerticalBoundary && cell.crossesBoundary(this.fixedRows);
    }

    constructor(opts) {
        this.fixedCols = opts.fixedCols;
        this.fixedRows = opts.fixedRows;
    }
}
