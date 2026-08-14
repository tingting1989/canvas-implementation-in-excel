import { Cell } from "../store/Cell";
import type { CellRange } from "../types";

/** 条件格式范围（别名，语义化） */
export type ConditionalRange = CellRange;

/**
 * 条件格式规则
 */
export class ConditionalRule {
    /** 作用范围 */
    range: ConditionalRange;

    /** 条件判断函数 */
    conditionFn: (value: unknown, cell: Cell | null | undefined) => boolean;

    /** 命中时应使用的样式 ID */
    styleId: number;

    /**
     * @param range - 作用范围
     * @param conditionFn - (value, cell) => boolean
     * @param styleId - 命中时应使用的样式 ID
     */
    constructor(range: ConditionalRange, conditionFn: (value: unknown, cell: Cell | null | undefined) => boolean, styleId: number) {
        this.range = range;
        this.conditionFn = conditionFn;
        this.styleId = styleId;
    }

    /**
     * 判断单元格是否命中规则
     * @param row - 行号
     * @param col - 列号
     * @param cell - 单元格实例
     * @returns 是否命中
     */
    match(row: number, col: number, cell: Cell | null | undefined): boolean {
        const { topRow, topCol, bottomRow, bottomCol } = this.range;
        if (row < topRow || row > bottomRow || col < topCol || col > bottomCol) return false;
        return this.conditionFn(cell?.value, cell);
    }
}
