/**
 * 逻辑单元格样式接口
 *
 * 包含文本对齐、颜色、背景色、字体等样式属性。
 * 支持索引签名以兼容扩展样式属性。
 */
export interface LogicalCellStyle {
    /** 文本水平对齐方式（left/center/right） */
    textAlign?: string;
    /** 文字颜色 */
    color?: string;
    /** 背景颜色 */
    backgroundColor?: string;
    /** 字体样式（如 italic） */
    fontStyle?: string;
    /** 字体粗细（如 bold） */
    fontWeight?: string;
    /** 字体大小（如 "14px"） */
    fontSize?: string;
    /** 扩展样式属性索引签名 */
    [key: string]: unknown;
}

/** LogicalCell 构造参数接口 */
export interface LogicalCellOpts {
    /** 所属层索引（0 = 最上层） */
    layerIndex: number;
    /** 起始列号（含） */
    startCol: number;
    /** 结束列号（含） */
    endCol: number;
    /** 跨越列数 (endCol - startCol + 1) */
    colspan: number;
    /** 显示文本 */
    label: string;
    /** 用户自定义样式（含背景色、字体、对齐等） */
    style: LogicalCellStyle | null;
}

/**
 * 逻辑嵌套表头单元格（LogicalCell）
 *
 * 对应 nestedHeaders[layer][i] 解析后的结果。
 * 是"用户配置层面"的概念，不含任何视口/冻结相关信息。
 *
 * ## 在渲染管线中的位置
 *
 * ```
 * nestedHeaders 配置 → HeaderLayoutBuilder → LogicalCell[] → Fragmentizer → Fragment[] → HeaderPainter
 * ```
 *
 * LogicalCell 是 HeaderLayoutBuilder 的输出、Fragmentizer 的输入，
 * 描述了嵌套表头的逻辑结构（层级、列范围、文本、样式），
 * 与视口滚动和冻结无关。
 *
 * ## 合并单元格
 *
 * 当 colspan > 1 时，该单元格跨越多列，属于合并单元格。
 * 合并单元格可能跨越冻结边界，此时 Fragmentizer 会将其拆分为
 * 冻结侧和滚动侧两个 Fragment。
 *
 * @see FrozenBoundaryInfo 冻结边界信息，使用 crossesBoundary() 判断是否跨越边界
 * @see Fragment 可视片段，LogicalCell 在视口中的可见部分
 */
export class LogicalCell {
    /** 所属层索引（0 = 最上层） */
    layerIndex: number;
    /** 起始列号（含） */
    startCol: number;
    /** 结束列号（含） */
    endCol: number;
    /** 跨越列数 (endCol - startCol + 1) */
    colspan: number;
    /** 显示文本 */
    label: string;
    /** 用户自定义样式（含背景色、字体、对齐等） */
    style: LogicalCellStyle | null;

    /**
     * 是否为 colspan > 1 的合并单元格
     *
     * 合并单元格跨越多列，可能被冻结边界切割，
     * 需要由 Fragmentizer 拆分为多个 Fragment。
     */
    get isMerged(): boolean {
        return this.colspan > 1;
    }

    /**
     * 判断是否跨越指定的列边界
     *
     * 当单元格的列范围 [startCol, endCol] 同时包含边界两侧的列时，
     * 即认为跨越了该边界。判断条件：startCol < boundaryCol && endCol >= boundaryCol。
     *
     * 典型用途：FrozenBoundaryInfo.splitsCellHorizontally() 调用此方法，
     * 判断逻辑单元格是否跨越冻结列边界，从而决定是否需要拆分。
     *
     * @param boundaryCol - 边界列号（冻结列数，如 fixedCols）
     * @returns 是否跨越边界
     */
    crossesBoundary(boundaryCol: number): boolean {
        return this.startCol < boundaryCol && this.endCol >= boundaryCol;
    }

    /**
     * 构造逻辑单元格
     *
     * @param opts - 构造参数
     * @param opts.layerIndex - 所属层索引（0 = 最上层）
     * @param opts.startCol - 起始列号（含）
     * @param opts.endCol - 结束列号（含）
     * @param opts.colspan - 跨越列数 (endCol - startCol + 1)
     * @param opts.label - 显示文本
     * @param opts.style - 用户自定义样式
     */
    constructor(opts: LogicalCellOpts) {
        this.layerIndex = opts.layerIndex;
        this.startCol = opts.startCol;
        this.endCol = opts.endCol;
        this.colspan = opts.colspan;
        this.label = opts.label;
        this.style = opts.style;
    }
}
