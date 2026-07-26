/**
 * 冻结边界信息（FrozenBoundaryInfo）
 *
 * 在 Layout 阶段预计算，供 Fragmentizer 使用。
 * 将"是否有冻结"、"冻结在哪"从渲染时的隐式判断变为显式数据，
 * 使得 Fragmentizer 可以据此将跨越冻结边界的逻辑单元格拆分为多个 Fragment。
 *
 * ## 冻结边界的含义
 *
 * - **水平冻结边界**：位于第 fixedCols 列与第 fixedCols+1 列之间的垂直分界线。
 *   左侧为冻结列区域，始终固定显示；右侧为滚动区域。
 * - **垂直冻结边界**：位于第 fixedRows 行与第 fixedRows+1 行之间的水平分界线。
 *   上方为冻结行区域，始终固定显示；下方为滚动区域。
 *
 * ## 跨越边界的拆分
 *
 * 当一个逻辑单元格（LogicalCell）跨越冻结边界时，
 * Fragmentizer 需要将其拆分为冻结侧和滚动侧两个 Fragment，
 * 以便分别渲染到不同的区域（冻结层和滚动层）。
 *
 * 例如：一个 colSpan=3 的单元格起始于第 fixedCols-1 列，
 * 会跨越水平冻结边界，被拆分为：
 * - 冻结侧 Fragment：覆盖第 fixedCols-1 列
 * - 滚动侧 Fragment：覆盖第 fixedCols 列和第 fixedCols+1 列
 *
 * @see LogicalCell 逻辑单元格，提供 crossesBoundary() 方法判断是否跨越边界
 * @see Fragmentizer 片段化器，使用本类判断是否需要拆分逻辑单元格
 */
export class FrozenBoundaryInfo {
    /** @type {number} 固定列数（来自 sheet.fixedColumnsStart） */
    fixedCols;

    /** @type {number} 固定行数（来自 sheet.fixedRowsTop） */
    fixedRows;

    /**
     * 是否存在水平冻结边界（垂直分界线）
     *
     * 当 fixedCols > 0 时，第 fixedCols 列左侧存在冻结列区域，
     * 即存在一条垂直的水平冻结边界线。
     *
     * @type {boolean}
     */
    get hasHorizontalBoundary() {
        return this.fixedCols > 0;
    }

    /**
     * 是否存在垂直冻结边界（水平分界线）
     *
     * 当 fixedRows > 0 时，第 fixedRows 行上方存在冻结行区域，
     * 即存在一条水平的垂直冻结边界线。
     *
     * @type {boolean}
     */
    get hasVerticalBoundary() {
        return this.fixedRows > 0;
    }

    /**
     * 判断逻辑单元格是否跨越水平冻结边界
     *
     * 水平冻结边界是位于第 fixedCols 列处的垂直分界线。
     * 如果单元格的列范围同时包含冻结侧和滚动侧的列，
     * 则该单元格跨越了水平冻结边界，需要拆分。
     *
     * @param {import('./LogicalCell.js').LogicalCell} cell - 逻辑单元格
     * @returns {boolean} 是否跨越水平冻结边界
     */
    splitsCellHorizontally(cell) {
        return this.hasHorizontalBoundary && cell.crossesBoundary(this.fixedCols);
    }

    /**
     * 判断逻辑单元格是否跨越垂直冻结边界
     *
     * 垂直冻结边界是位于第 fixedRows 行处的水平分界线。
     * 如果单元格的行范围同时包含冻结侧和滚动侧的行，
     * 则该单元格跨越了垂直冻结边界，需要拆分。
     *
     * @param {import('./LogicalCell.js').LogicalCell} cell - 逻辑单元格
     * @returns {boolean} 是否跨越垂直冻结边界
     */
    splitsCellVertically(cell) {
        return this.hasVerticalBoundary && cell.crossesBoundary(this.fixedRows);
    }

    /**
     * @param {Object} opts - 构造参数
     * @param {number} opts.fixedCols - 固定列数
     * @param {number} opts.fixedRows - 固定行数
     */
    constructor(opts) {
        this.fixedCols = opts.fixedCols;
        this.fixedRows = opts.fixedRows;
    }
}
