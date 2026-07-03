/**
 * 逻辑嵌套表头单元格
 *
 * 对应 nestedHeaders[layer][i] 解析后的结果。
 * 是"用户配置层面"的概念，不含任何视口/冻结相关信息。
 */
export class LogicalCell {
    /** @type {number} 所属层索引 */
    layerIndex;

    /** @type {number} 起始列号（含） */
    startCol;

    /** @type {number} 结束列号（含） */
    endCol;

    /** @type {number} 跨越列数 (endCol - startCol + 1) */
    colspan;

    /** @type {string} 显示文本 */
    label;

    /** @type {object|null} 用户自定义样式 */
    style;

    /** @type {boolean} 是否为 colspan > 1 的合并单元格 */
    get isMerged() {
        return this.colspan > 1;
    }

    /**
     * 判断是否跨越指定的列边界
     * @param {number} boundaryCol - 边界列号
     * @returns {boolean}
     */
    crossesBoundary(boundaryCol) {
        return this.startCol < boundaryCol && this.endCol >= boundaryCol;
    }

    constructor(opts) {
        this.layerIndex = opts.layerIndex;
        this.startCol = opts.startCol;
        this.endCol = opts.endCol;
        this.colspan = opts.colspan;
        this.label = opts.label;
        this.style = opts.style;
    }
}