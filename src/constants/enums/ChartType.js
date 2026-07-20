/**
 * 图表类型枚举
 * @description 定义支持的图表可视化类型，用于数据分析和展示
 * @constant {Object}
 * @property {string} LINE - 折线图，适合展示数据随时间的变化趋势和连续性数据
 * @property {string} BAR - 柱状图/条形图，适合比较不同类别的数值大小
 * @property {string} PIE - 饼图，适合展示各部分占整体的比例关系
 * @property {string} AREA - 面积图，与折线图类似但强调数量随时间变化的程度
 * @property {string} SCATTER - 散点图，适合展示两个变量之间的相关性和分布情况
 * @property {string} CANDLESTICK - K 线图（蜡烛图），适合金融数据的开高低收分析
 * @property {string} GAUGE - 仪表盘，适合展示单个指标值在范围内的位置（如速度、完成度）
 * @property {string} FUNNEL - 漏斗图，适合展示流程中的阶段转化情况（如销售漏斗、用户行为漏斗）
 * @property {string} RADAR - 雷达图，适合多维度数据的对比分析（如能力评估、性能指标）
 * @property {string} HEATMAP - 热力图，适合展示二维数据的密度分布情况（如相关性矩阵、混淆矩阵）
 */
export const CHART_TYPE = Object.freeze({
    LINE: "line",
    BAR: "bar",
    PIE: "pie",
    AREA: "area",
    SCATTER: "scatter",
    CANDLESTICK: "candlestick",
    GAUGE: "gauge",
    FUNNEL: "funnel",
    RADAR: "radar",
    HEATMAP: "heatmap",
});
