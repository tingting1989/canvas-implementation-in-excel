/**
 * 文本水平对齐方式枚举
 * @description 定义单元格内文本的水平对齐位置，用于控制文字在单元格中的左右分布
 * @constant
 */
export type TextAlignValue = "left" | "center" | "right";

export interface TextAlign {
    /** 左对齐，文本靠单元格左侧显示，是默认的文本对齐方式 */
    readonly LEFT: "left";
    /** 居中对齐，文本在单元格内水平居中显示 */
    readonly CENTER: "center";
    /** 右对齐，文本靠单元格右侧显示，常用于数字和日期 */
    readonly RIGHT: "right";
}

export const TEXT_ALIGN: TextAlign = Object.freeze({
    LEFT: "left",
    CENTER: "center",
    RIGHT: "right",
});