/**
 * 文本垂直对齐方式枚举
 * @description 定义单元格内文本的垂直对齐位置，用于控制文字在单元格中的上下分布
 * @constant
 */
export type VerticalAlignValue = "top" | "middle" | "bottom";

export interface VerticalAlign {
    /** 顶部对齐，文本靠单元格顶部显示，当行高较大时文本位于上部 */
    readonly TOP: "top";
    /** 垂直居中，文本在单元格内垂直居中显示，是最常用的对齐方式 */
    readonly MIDDLE: "middle";
    /** 底部对齐，文本靠单元格底部显示，当行高较大时文本位于下部 */
    readonly BOTTOM: "bottom";
}

export const VERTICAL_ALIGN: VerticalAlign = Object.freeze({
    TOP: "top",
    MIDDLE: "middle",
    BOTTOM: "bottom",
});