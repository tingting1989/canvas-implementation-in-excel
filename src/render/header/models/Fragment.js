import { BorderMask } from "./BorderMask.js";

/**
 * 可视片段
 *
 * 一个 LogicalCell 在当前视口中的可见部分。
 * 当单元格完全在视口内时，Fragment = LogicalCell 的 1:1 映射。
 * 当单元格被冻结边界切割时，产生 2 个 Fragment（冻结侧 + 非冻结侧）。
 * 当单元格被视口边缘裁剪时，Fragment 的 x/y/w/h 被限制在 clipRect 内。
 *
 * 关键设计：Fragment 携带 BorderMask，渲染器无需再做任何边框判断。
 */
export class Fragment {
    constructor(opts) {
        this.sourceCell = opts.sourceCell ?? null;
        this.visStartCol = opts.visStartCol;
        this.visEndCol = opts.visEndCol;

        this.x = opts.x;
        this.y = opts.y;
        this.w = opts.w;
        this.h = opts.h;

        this.borderMask = opts.borderMask ?? BorderMask.ALL;
        this.mergedStyle = opts.mergedStyle ?? null;
        this.text = opts.text ?? "";
        this.font = opts.font ?? "12px sans-serif";
        this.textAlign = opts.textAlign ?? "left";
        this.textX = opts.textX ?? 0;
        this.textY = opts.textY ?? 0;
        this.maxTextWidth = opts.maxTextWidth ?? 0;

        this.isPartial = opts.isPartial ?? false;
        this.partialType = opts.partialType ?? "full";
        this.isSource = opts.isSource ?? false;
        this.isHighlighted = opts.isHighlighted ?? false;
    }
}