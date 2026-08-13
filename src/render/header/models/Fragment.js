import { CONFIG } from "../../../constants/config.js";
import { BorderMask } from "./BorderMask.js";
import { PARTIAL_TYPE } from "./PartialType.js";

/**
 * 可视片段（Fragment）
 *
 * 一个 LogicalCell 在当前视口中的可见部分。
 * Fragment 是表头渲染管线的核心数据单元，由 Fragmentizer 产生，
 * 由 HeaderPainter 消费绘制。
 *
 * ## 产生场景
 *
 * | 场景                     | Fragment 数量 | 说明                                        |
 * |--------------------------|---------------|---------------------------------------------|
 * | 单元格完全在视口内       | 1             | Fragment = LogicalCell 的 1:1 映射           |
 * | 单元格被冻结边界切割     | 2             | 冻结侧 Fragment + 滚动侧 Fragment            |
 * | 单元格被视口边缘裁剪     | 1             | x/y/w/h 被限制在 clipRect 内                |
 *
 * ## 关键设计：BorderMask
 *
 * Fragment 携带 BorderMask（位域），渲染器无需再做任何边框判断。
 * 例如：被冻结边界切割的单元格，冻结侧 Fragment 不画右边框，
 * 滚动侧 Fragment 不画左边框，通过 BorderMask 精确控制。
 *
 * ## 关键设计：partialType
 *
 * 标记 Fragment 是完整单元格还是被冻结边界切割后的部分：
 * - FULL：完整单元格，未被切割
 * - FROZEN：冻结侧部分（不画靠近边界的边框）
 * - SCROLL：滚动侧部分（不画靠近边界的边框）
 *
 * ## 数据流
 *
 * ```
 * LogicalCell → Fragmentizer → Fragment[] → HeaderPainter
 * ```
 *
 * @see LogicalCell 逻辑单元格，Fragment 的来源
 * @see Fragmentizer 片段化器，将 LogicalCell 转换为 Fragment[]
 * @see BorderMask 边框掩码，控制四边边框的可见性
 * @see PARTIAL_TYPE 片段类型，标记完整/冻结侧/滚动侧
 */
export class Fragment {
    /**
     * @param {Object} opts - 构造参数
     * @param {import('./LogicalCell.js').LogicalCell|null} [opts.sourceCell=null] - 源逻辑单元格
     * @param {number} opts.visStartCol - 可视起始列号
     * @param {number} opts.visEndCol - 可视结束列号
     * @param {number} opts.x - 片段左上角 X 坐标（视口像素）
     * @param {number} opts.y - 片段左上角 Y 坐标（视口像素）
     * @param {number} opts.w - 片段宽度（像素）
     * @param {number} opts.h - 片段高度（像素）
     * @param {number} [opts.borderMask=BorderMask.ALL] - 边框掩码（位域，控制四边边框可见性）
     * @param {Object|null} [opts.mergedStyle=null] - 合并后的样式对象（含背景色、字体、对齐等）
     * @param {string} [opts.text=""] - 显示文本
     * @param {string} [opts.font] - 字体字符串（如 "12px Segoe UI"）
     * @param {string} [opts.textAlign="left"] - 文本水平对齐方式
     * @param {number} [opts.textX=0] - 文本绘制 X 坐标（视口像素）
     * @param {number} [opts.textY=0] - 文本绘制 Y 坐标（视口像素）
     * @param {number} [opts.maxTextWidth=0] - 文本最大绘制宽度（超出时截断）
     * @param {boolean} [opts.isPartial=false] - 是否为被切割的部分片段
     * @param {string} [opts.partialType=PARTIAL_TYPE.FULL] - 片段类型（FULL/FROZEN/SCROLL）
     * @param {boolean} [opts.isSource=false] - 是否为选区源列/行（拖拽移动时的源标记）
     * @param {boolean} [opts.isHighlighted=false] - 是否为选区高亮列/行
     */
    constructor(opts) {
        /** @type {import('./LogicalCell.js').LogicalCell|null} 源逻辑单元格，null 表示合成片段 */
        this.sourceCell = opts.sourceCell ?? null;
        /** @type {number} 可视起始列号 */
        this.visStartCol = opts.visStartCol;
        /** @type {number} 可视结束列号 */
        this.visEndCol = opts.visEndCol;

        /** @type {number} 片段左上角 X 坐标（视口像素） */
        this.x = opts.x;
        /** @type {number} 片段左上角 Y 坐标（视口像素） */
        this.y = opts.y;
        /** @type {number} 片段宽度（像素） */
        this.w = opts.w;
        /** @type {number} 片段高度（像素） */
        this.h = opts.h;

        /** @type {number} 边框掩码（位域），控制四边边框的可见性，默认 ALL */
        this.borderMask = opts.borderMask ?? BorderMask.ALL;
        /** @type {Object|null} 合并后的样式对象（含背景色、字体、对齐等） */
        this.mergedStyle = opts.mergedStyle ?? null;
        /** @type {string} 显示文本 */
        this.text = opts.text !== undefined ? opts.text : "";
        /** @type {string} 字体字符串（如 "12px Segoe UI"） */
        this.font = opts.font ?? `${CONFIG.DEFAULT_FONT_SIZE}px ${CONFIG.DEFAULT_FONT_FAMILY}`;
        /** @type {string} 文本水平对齐方式 */
        this.textAlign = opts.textAlign ?? "left";
        /** @type {number} 文本绘制 X 坐标（视口像素） */
        this.textX = opts.textX ?? 0;
        /** @type {number} 文本绘制 Y 坐标（视口像素） */
        this.textY = opts.textY ?? 0;
        /** @type {number} 文本最大绘制宽度（超出时截断），0 表示不限制 */
        this.maxTextWidth = opts.maxTextWidth ?? 0;

        /** @type {boolean} 是否为被冻结边界切割后的部分片段 */
        this.isPartial = opts.isPartial ?? false;
        /** @type {string} 片段类型：FULL（完整）/ FROZEN（冻结侧）/ SCROLL（滚动侧） */
        this.partialType = opts.partialType ?? PARTIAL_TYPE.FULL;
        /** @type {boolean} 是否为选区源列/行（拖拽移动列/行时的源标记，用于视觉反馈） */
        this.isSource = opts.isSource ?? false;
        /** @type {boolean} 是否为选区高亮列/行（选区覆盖的列/行头背景加深） */
        this.isHighlighted = opts.isHighlighted ?? false;
    }
}
