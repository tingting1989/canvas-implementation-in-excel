/**
 * 样式作用域枚举
 * @description 定义样式的应用范围层级，用于确定格式化操作的生效区域
 * @constant {Object}
 * @property {string} ROW - 行级样式，应用于整行所有单元格，如行高、行背景色等
 * @property {string} COL - 列级样式，应用于整列所有单元格，如列宽、列背景色等
 * @property {string} CELL - 单元格级样式，仅应用于单个特定单元格，如字体、边框、对齐方式等
 */
export const STYLE_SCOPE = Object.freeze({
    ROW: "row",
    COL: "col",
    CELL: "cell",
});
