import { CONFIG } from "../../../constants/config.js";
import { BorderMask } from "./BorderMask.js";
import { PARTIAL_TYPE } from "./PartialType.js";
import type { LogicalCell, LogicalCellStyle } from "./LogicalCell.js";
import type { PartialType } from "./PartialType.js";
import type { BorderMaskValue } from "./BorderMask.js";

/** Fragment 构造参数接口 */
export interface FragmentOpts {
    /** 来源逻辑单元格（简单表头时为 null） */
    sourceCell?: LogicalCell | null;
    /** 可视起始列号（含） */
    visStartCol: number;
    /** 可视结束列号（含） */
    visEndCol: number;
    /** 片段左上角 x 坐标 */
    x: number;
    /** 片段左上角 y 坐标 */
    y: number;
    /** 片段宽度 */
    w: number;
    /** 片段高度 */
    h: number;
    /** 边框掩码（位域，决定画哪些边框） */
    borderMask?: BorderMaskValue;
    /** 合并后的样式（基础样式 + 自定义样式） */
    mergedStyle?: LogicalCellStyle | null;
    /** 显示文本（滚动侧部分为 null） */
    text?: string | null;
    /** 字体字符串（如 "bold 14px Arial"） */
    font?: string;
    /** 文本水平对齐方式（left/center/right） */
    textAlign?: string;
    /** 文本绘制 x 坐标 */
    textX?: number;
    /** 文本绘制 y 坐标（基线位置） */
    textY?: number;
    /** 文本最大绘制宽度（超出时截断加省略号） */
    maxTextWidth?: number;
    /** 是否为被冻结边界切割后的部分片段 */
    isPartial?: boolean;
    /** 片段类型（full/frozen/scroll） */
    partialType?: PartialType;
    /** 是否为拖拽源列（高亮显示） */
    isSource?: boolean;
    /** 是否为高亮列（选中列头） */
    isHighlighted?: boolean;
}

/**
 * 可视片段（Fragment）
 *
 * 一个 Fragment 代表表头中一个**可独立绘制**的矩形区域。
 *
 * ## 与 LogicalCell 的关系
 *
 * - **1:1**：普通单元格或未被冻结边界切割的合并单元格 → 一个 LogicalCell 产生一个 Fragment
 * - **1:2**：被冻结边界切割的合并单元格 → 一个 LogicalCell 产生两个 Fragment（冻结侧 + 滚动侧）
 *
 * ## 关键属性分组
 *
 * | 分组 | 属性 | 说明 |
 * |------|------|------|
 * | 来源 | sourceCell | 对应的 LogicalCell（简单表头时为 null） |
 * | 列范围 | visStartCol, visEndCol | 可视列范围，用于命中检测 |
 * | 几何 | x, y, w, h | 视口坐标和尺寸，用于 Canvas 绘制 |
 * | 边框 | borderMask | 位域掩码，决定画哪些边框 |
 * | 样式 | mergedStyle, font, textAlign | 合并后的最终样式 |
 * | 文本 | text, textX, textY, maxTextWidth | 文本内容和绘制位置 |
 * | 状态 | isPartial, partialType, isSource, isHighlighted | 片段状态标记 |
 *
 * @see LogicalCell 逻辑单元格，Fragment 的来源
 * @see BorderMask 边框掩码常量
 * @see PARTIAL_TYPE 片段类型常量
 */
export class Fragment {
    /** 来源逻辑单元格（简单表头时为 null） */
    sourceCell: LogicalCell | null;
    /** 可视起始列号（含） */
    visStartCol: number;
    /** 可视结束列号（含） */
    visEndCol: number;

    /** 片段左上角 x 坐标 */
    x: number;
    /** 片段左上角 y 坐标 */
    y: number;
    /** 片段宽度 */
    w: number;
    /** 片段高度 */
    h: number;

    /** 边框掩码（位域，决定画哪些边框） */
    borderMask: BorderMaskValue;
    /** 合并后的样式（基础样式 + 自定义样式） */
    mergedStyle: LogicalCellStyle | null;
    /** 显示文本（滚动侧部分为 null，避免与冻结侧重叠） */
    text: string | null;
    /** 字体字符串（如 "bold 14px Arial"） */
    font: string;
    /** 文本水平对齐方式（left/center/right） */
    textAlign: string;
    /** 文本绘制 x 坐标 */
    textX: number;
    /** 文本绘制 y 坐标（基线位置） */
    textY: number;
    /** 文本最大绘制宽度（超出时截断加省略号） */
    maxTextWidth: number;

    /** 是否为被冻结边界切割后的部分片段 */
    isPartial: boolean;
    /** 片段类型（full/frozen/scroll） */
    partialType: PartialType;
    /** 是否为拖拽源列（高亮显示） */
    isSource: boolean;
    /** 是否为高亮列（选中列头） */
    isHighlighted: boolean;

    /**
     * 构造可视片段
     *
     * 所有属性均有默认值，确保 Fragment 实例始终处于可绘制状态。
     *
     * @param opts - 构造参数
     * @param opts.sourceCell - 来源逻辑单元格，默认 null
     * @param opts.visStartCol - 可视起始列号
     * @param opts.visEndCol - 可视结束列号
     * @param opts.x - 片段左上角 x 坐标
     * @param opts.y - 片段左上角 y 坐标
     * @param opts.w - 片段宽度
     * @param opts.h - 片段高度
     * @param opts.borderMask - 边框掩码，默认 BorderMask.ALL（四边全画）
     * @param opts.mergedStyle - 合并后的样式，默认 null
     * @param opts.text - 显示文本，默认空字符串
     * @param opts.font - 字体字符串，默认基于 CONFIG 的默认字体
     * @param opts.textAlign - 文本对齐方式，默认 "left"
     * @param opts.textX - 文本绘制 x 坐标，默认 0
     * @param opts.textY - 文本绘制 y 坐标，默认 0
     * @param opts.maxTextWidth - 文本最大绘制宽度，默认 0
     * @param opts.isPartial - 是否为部分片段，默认 false
     * @param opts.partialType - 片段类型，默认 PARTIAL_TYPE.FULL
     * @param opts.isSource - 是否为拖拽源列，默认 false
     * @param opts.isHighlighted - 是否为高亮列，默认 false
     */
    constructor(opts: FragmentOpts) {
        this.sourceCell = opts.sourceCell ?? null;
        this.visStartCol = opts.visStartCol;
        this.visEndCol = opts.visEndCol;

        this.x = opts.x;
        this.y = opts.y;
        this.w = opts.w;
        this.h = opts.h;

        this.borderMask = opts.borderMask ?? BorderMask.ALL;
        this.mergedStyle = opts.mergedStyle ?? null;
        this.text = opts.text !== undefined ? opts.text : "";
        this.font = opts.font ?? `${CONFIG.DEFAULT_FONT_SIZE}px ${CONFIG.DEFAULT_FONT_FAMILY}`;
        this.textAlign = opts.textAlign ?? "left";
        this.textX = opts.textX ?? 0;
        this.textY = opts.textY ?? 0;
        this.maxTextWidth = opts.maxTextWidth ?? 0;

        this.isPartial = opts.isPartial ?? false;
        this.partialType = opts.partialType ?? PARTIAL_TYPE.FULL;
        this.isSource = opts.isSource ?? false;
        this.isHighlighted = opts.isHighlighted ?? false;
    }
}
