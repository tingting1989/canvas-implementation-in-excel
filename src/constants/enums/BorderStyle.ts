/**
 * 边框样式枚举
 * @description 定义单元格边框的可选样式类型，用于设置表格边框的视觉效果
 * @constant
 */
export type BorderStyleValue = "solid" | "dashed" | "dotted";

export interface BorderStyle {
    /** 实线边框，最常见的边框样式，显示为连续的实线 */
    readonly SOLID: "solid";
    /** 虚线边框，显示为由短划线组成的虚线效果 */
    readonly DASHED: "dashed";
    /** 点线边框，显示为由点组成的点线效果 */
    readonly DOTTED: "dotted";
}

export const BORDER_STYLE: BorderStyle = Object.freeze({
    SOLID: "solid",
    DASHED: "dashed",
    DOTTED: "dotted",
});