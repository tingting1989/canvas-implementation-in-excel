/**
 * 行列头常量配置
 */
export interface HeaderConfig {
    /** 行列头默认背景色 */
    readonly HEADER_BG: "#f0f0f0";
    /** 行列头选中/高亮背景色 */
    readonly HEADER_HIGHLIGHT_BG: "#dcdcdc";
    /** 行列头选中/高亮文字颜色 */
    readonly HEADER_HIGHLIGHT_COLOR: "#217346";
    /** 普通表头文字颜色 */
    readonly HEADER_TEXT_COLOR: "#555";
    /** 表头边框颜色，需与 HEADER_BG (#f0f0f0) 有足够对比度 */
    readonly HEADER_BORDER_COLOR: "#b0b0b0";
}

export const HEADER_CONFIG: HeaderConfig = Object.freeze({
    HEADER_BG: "#f0f0f0",
    HEADER_HIGHLIGHT_BG: "#dcdcdc",
    HEADER_HIGHLIGHT_COLOR: "#217346",
    HEADER_TEXT_COLOR: "#555",
    HEADER_BORDER_COLOR: "#b0b0b0",
});
