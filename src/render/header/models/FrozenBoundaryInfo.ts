import type { LogicalCell } from "./LogicalCell.js";

/** FrozenBoundaryInfo 构造参数接口 */
export interface FrozenBoundaryInfoOpts {
    /** 冻结列数（水平冻结边界） */
    fixedCols: number;
    /** 冻结行数（垂直冻结边界） */
    fixedRows: number;
}

/**
 * 冻结边界信息（FrozenBoundaryInfo）
 *
 * 封装工作表的冻结列/行数，提供判断逻辑单元格是否被冻结边界切割的能力。
 *
 * ## 水平冻结 vs 垂直冻结
 *
 * - **水平冻结**（fixedCols > 0）：左侧有固定列区域，右侧可水平滚动。
 *   合并单元格可能跨越此水平边界，需要拆分为冻结侧和滚动侧两个 Fragment。
 * - **垂直冻结**（fixedRows > 0）：上方有固定行区域，下方可垂直滚动。
 *   合并单元格可能跨越此垂直边界，需要拆分为冻结侧和滚动侧两个 Fragment。
 *
 * @see LogicalCell.crossesBoundary() 判断单元格是否跨越指定列边界
 */
export class FrozenBoundaryInfo {
    /** 冻结列数（水平冻结边界） */
    fixedCols: number;
    /** 冻结行数（垂直冻结边界） */
    fixedRows: number;

    /**
     * 是否存在水平冻结边界（fixedCols > 0）
     *
     * 水平冻结边界将表头分为左侧固定区域和右侧滚动区域。
     */
    get hasHorizontalBoundary(): boolean {
        return this.fixedCols > 0;
    }

    /**
     * 是否存在垂直冻结边界（fixedRows > 0）
     *
     * 垂直冻结边界将表头分为上方固定区域和下方滚动区域。
     */
    get hasVerticalBoundary(): boolean {
        return this.fixedRows > 0;
    }

    /**
     * 判断逻辑单元格是否被水平冻结边界切割
     *
     * 当存在水平冻结边界且单元格跨越该边界时返回 true。
     * 此时需要将单元格拆分为冻结侧和滚动侧两个 Fragment。
     *
     * @param cell - 待判断的逻辑单元格
     * @returns 是否被水平冻结边界切割
     */
    splitsCellHorizontally(cell: LogicalCell): boolean {
        return this.hasHorizontalBoundary && cell.crossesBoundary(this.fixedCols);
    }

    /**
     * 判断逻辑单元格是否被垂直冻结边界切割
     *
     * 当存在垂直冻结边界且单元格跨越该边界时返回 true。
     * 此时需要将单元格拆分为冻结侧和滚动侧两个 Fragment。
     *
     * @param cell - 待判断的逻辑单元格
     * @returns 是否被垂直冻结边界切割
     */
    splitsCellVertically(cell: LogicalCell): boolean {
        return this.hasVerticalBoundary && cell.crossesBoundary(this.fixedRows);
    }

    /**
     * 构造冻结边界信息
     *
     * @param opts - 构造参数
     * @param opts.fixedCols - 冻结列数（水平冻结边界）
     * @param opts.fixedRows - 冻结行数（垂直冻结边界）
     */
    constructor(opts: FrozenBoundaryInfoOpts) {
        this.fixedCols = opts.fixedCols;
        this.fixedRows = opts.fixedRows;
    }
}
