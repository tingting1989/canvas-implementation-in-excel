import { CONFIG } from "../../../constants/config.js";
import { BorderMask } from "./BorderMask.js";
import { PARTIAL_TYPE } from "./PartialType.js";
import type { LogicalCell, LogicalCellStyle } from "./LogicalCell.js";
import type { PartialType } from "./PartialType.js";
import type { BorderMaskValue } from "./BorderMask.js";

export interface FragmentOpts {
    sourceCell?: LogicalCell | null;
    visStartCol: number;
    visEndCol: number;
    x: number;
    y: number;
    w: number;
    h: number;
    borderMask?: BorderMaskValue;
    mergedStyle?: LogicalCellStyle | null;
    text?: string | null;
    font?: string;
    textAlign?: string;
    textX?: number;
    textY?: number;
    maxTextWidth?: number;
    isPartial?: boolean;
    partialType?: PartialType;
    isSource?: boolean;
    isHighlighted?: boolean;
}

export class Fragment {
    sourceCell: LogicalCell | null;
    visStartCol: number;
    visEndCol: number;

    x: number;
    y: number;
    w: number;
    h: number;

    borderMask: BorderMaskValue;
    mergedStyle: LogicalCellStyle | null;
    text: string | null;
    font: string;
    textAlign: string;
    textX: number;
    textY: number;
    maxTextWidth: number;

    isPartial: boolean;
    partialType: PartialType;
    isSource: boolean;
    isHighlighted: boolean;

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
