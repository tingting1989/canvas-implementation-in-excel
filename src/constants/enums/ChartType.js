/**
 * 图表类型枚举
 * @description 定义支持的图表可视化类型，用于数据分析和展示
 * @constant {Object}
 * @property {string} LINE - 折线图，适合展示数据随时间的变化趋势和连续性数据
 * @property {string} BAR - 柱状图/条形图，适合比较不同类别的数值大小
 * @property {string} PIE - 饼图，适合展示各部分占整体的比例关系
 * @property {string} AREA - 面积图，与折线图类似但强调数量随时间变化的程度
 * @property {string} SCATTER - 散点图，适合展示两个变量之间的相关性和分布情况
 */
export const CHART_TYPE = Object.freeze({
    LINE: "line",
    BAR: "bar",
    PIE: "pie",
    AREA: "area",
    SCATTER: "scatter",
});
