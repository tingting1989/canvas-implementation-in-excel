/**
 * 条件格式规则
 */
export class ConditionalRule {
    /**
     * @param {{topRow:number, topCol:number, bottomRow:number, bottomCol:number}} range - 作用范围
     * @param {Function} conditionFn - (value, cell) => boolean
     * @param {number} styleId - 命中时应使用的样式 ID
     */
    constructor(range, conditionFn, styleId) {
        this.range = range;
        this.conditionFn = conditionFn;
        this.styleId = styleId;
    }

    /**
     * 判断单元格是否命中规则
     * @param {number} row
     * @param {number} col
     * @param {Cell} cell
     * @returns {boolean}
     */
    match(row, col, cell) {
        const { topRow, topCol, bottomRow, bottomCol } = this.range;
        if (row < topRow || row > bottomRow || col < topCol || col > bottomCol) return false;
        return this.conditionFn(cell?.value, cell);
    }
}