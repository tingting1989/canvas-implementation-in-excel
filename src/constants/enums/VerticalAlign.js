/**
 * 文本垂直对齐方式枚举
 * @description 定义单元格内文本的垂直对齐位置，用于控制文字在单元格中的上下分布
 * @constant {Object}
 * @property {string} TOP - 顶部对齐，文本靠单元格顶部显示，当行高较大时文本位于上部
 * @property {string} MIDDLE - 垂直居中，文本在单元格内垂直居中显示，是最常用的对齐方式
 * @property {string} BOTTOM - 底部对齐，文本靠单元格底部显示，当行高较大时文本位于下部
 */
export const VERTICAL_ALIGN = Object.freeze({
    TOP: "top",
    MIDDLE: "middle",
    BOTTOM: "bottom",
});
