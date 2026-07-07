/**
 * 文本水平对齐方式枚举
 * @description 定义单元格内文本的水平对齐位置，用于控制文字在单元格中的左右分布
 * @constant {Object}
 * @property {string} LEFT - 左对齐，文本靠单元格左侧显示，是默认的文本对齐方式
 * @property {string} CENTER - 居中对齐，文本在单元格内水平居中显示
 * @property {string} RIGHT - 右对齐，文本靠单元格右侧显示，常用于数字和日期
 */
export const TEXT_ALIGN = Object.freeze({
    LEFT: "left",
    CENTER: "center",
    RIGHT: "right",
});