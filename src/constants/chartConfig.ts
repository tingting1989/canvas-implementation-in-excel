/**
 * 图表常量配置
 *
 * 图表渲染 + 图表选择
 */
export interface ChartConfig {
    // ═══ 图表渲染 ═══

    /** 图表字体族 */
    readonly CHART_FONT_FAMILY: "sans-serif";
    /** 图表字号（px） */
    readonly CHART_FONT_SIZE: 11;
    /** 图表标题字号 */
    readonly CHART_TITLE_FONT_SIZE: 16;
    /** 图表默认文字颜色 */
    readonly CHART_TEXT_COLOR: "#333";
    /** 图表网格线颜色 */
    readonly CHART_GRID_COLOR: "#e0e0e0";
    /** 图表网格线宽度 */
    readonly CHART_GRID_LINE_WIDTH: 0.5;
    /** 图表轴线颜色 */
    readonly CHART_AXIS_COLOR: "#666";
    /** 图表轴线宽度 */
    readonly CHART_AXIS_LINE_WIDTH: 1;
    /** 图表 tooltip 边框颜色 */
    readonly CHART_TOOLTIP_BORDER: "#fff";
    /** 图表 tooltip 边框宽度 */
    readonly CHART_TOOLTIP_BORDER_WIDTH: 2;
    /** 图表柱状图边框颜色 */
    readonly CHART_BAR_BORDER_COLOR: "rgba(0,0,0,0.15)";
    /** 图表面积图线宽 */
    readonly CHART_AREA_LINE_WIDTH: 2;
    /** 图表散点图点半径 */
    readonly CHART_SCATTER_DOT_RADIUS: 4;
    /** 图表折线图数据点半径 */
    readonly CHART_LINE_DOT_RADIUS: 3;
    /** 图表图例字号（px） */
    readonly CHART_LEGEND_FONT_SIZE: 11;
    /** 图表图例色块尺寸 */
    readonly CHART_LEGEND_ITEM_SIZE: 12;
    /** 图表图例色块间距 */
    readonly CHART_LEGEND_ITEM_WIDTH: 80;
    /** 图表图例偏移量 */
    readonly CHART_LEGEND_OFFSET_Y: 24;

    // ═══ 图表选择 ═══

    /** 图表选择边框颜色 */
    readonly CHART_SELECTION_BORDER_COLOR: "#217346";
    /** 图表选择边框线宽 */
    readonly CHART_SELECTION_BORDER_WIDTH: 2;
    /** 图表选择手柄大小 */
    readonly CHART_SELECTION_HANDLE_SIZE: 6;
    /** 图表选择手柄线宽 */
    readonly CHART_SELECTION_HANDLE_LINE_WIDTH: 1.5;
    /** 图表选择手柄填充色 */
    readonly CHART_SELECTION_HANDLE_FILL: "#fff";
    /** 图表最小宽度（px） */
    readonly CHART_MIN_WIDTH: 100;
    /** 图表最小高度（px） */
    readonly CHART_MIN_HEIGHT: 80;
}

export const CHART_CONFIG: ChartConfig = Object.freeze({
    CHART_FONT_FAMILY: "sans-serif",
    CHART_FONT_SIZE: 11,
    CHART_TITLE_FONT_SIZE: 16,
    CHART_TEXT_COLOR: "#333",
    CHART_GRID_COLOR: "#e0e0e0",
    CHART_GRID_LINE_WIDTH: 0.5,
    CHART_AXIS_COLOR: "#666",
    CHART_AXIS_LINE_WIDTH: 1,
    CHART_TOOLTIP_BORDER: "#fff",
    CHART_TOOLTIP_BORDER_WIDTH: 2,
    CHART_BAR_BORDER_COLOR: "rgba(0,0,0,0.15)",
    CHART_AREA_LINE_WIDTH: 2,
    CHART_SCATTER_DOT_RADIUS: 4,
    CHART_LINE_DOT_RADIUS: 3,
    CHART_LEGEND_FONT_SIZE: 11,
    CHART_LEGEND_ITEM_SIZE: 12,
    CHART_LEGEND_ITEM_WIDTH: 80,
    CHART_LEGEND_OFFSET_Y: 24,

    CHART_SELECTION_BORDER_COLOR: "#217346",
    CHART_SELECTION_BORDER_WIDTH: 2,
    CHART_SELECTION_HANDLE_SIZE: 6,
    CHART_SELECTION_HANDLE_LINE_WIDTH: 1.5,
    CHART_SELECTION_HANDLE_FILL: "#fff",
    CHART_MIN_WIDTH: 100,
    CHART_MIN_HEIGHT: 80,
});
