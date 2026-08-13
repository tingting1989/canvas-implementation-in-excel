/**
 * 字体样式枚举
 * @description 定义文本字体的装饰样式选项，用于控制文字的外观效果
 * @constant
 */
export type FontStyleValue = "italic" | "bold" | "underline" | "normal";

export interface FontStyle {
    /** 斜体样式，文字向右倾斜显示 */
    readonly ITALIC: "italic";
    /** 粗体样式，文字加粗显示以增强视觉权重 */
    readonly BOLD: "bold";
    /** 下划线样式，在文字底部添加下划线装饰 */
    readonly UNDERLINE: "underline";
    /** 正常样式，无特殊字体装饰的标准文本显示 */
    readonly NORMAL: "normal";
}

export const FONT_STYLE: FontStyle = Object.freeze({
    ITALIC: "italic",
    BOLD: "bold",
    UNDERLINE: "underline",
    NORMAL: "normal",
});
