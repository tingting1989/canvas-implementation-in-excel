/**
 * @fileoverview 图表插件实现
 * @description 提供图表的创建、删除、移动、调整大小等管理功能。
 *              支持9种图表类型：柱状图、折线图、饼图、面积图、散点图、K线图、仪表盘、漏斗图、雷达图。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module plugins/ChartPlugin
 * @see {@link BasePlugin} 基类定义
 * @see {@link ChartModel} 图表数据模型
 * @see {@link ChartManager} 图表管理器
 *
 * @typedef {Object} DataRange
 * @property {number} startRow - 数据起始行号（含表头）
 * @property {number} startCol - 数据起始列号
 * @property {number} endRow - 数据结束行号
 * @property {number} endCol - 数据结束列号
 *
 * @typedef {Object} ChartOptions
 * @property {number} [anchorRow=0] - 锚定行号（图表左上角绑定的单元格行）
 * @property {number} [anchorCol=0] - 锚定列号（图表左上角绑定的单元格列）
 * @property {number} [offsetX=0] - 相对锚单元格左上角的 X 像素偏移
 * @property {number} [offsetY=0] - 相对锚单元格左上角的 Y 像素偏移
 * @property {number} [width=400] - 图表宽度（px）
 * @property {number} [height=300] - 图表高度（px）
 * @property {ChartStyle} [style] - 样式配置对象
 *
 * @typedef {Object} ChartStyle
 * @property {string} [title=""] - 图表标题
 * @property {boolean} [showLegend=true] - 是否显示图例
 * @property {boolean} [showGrid=true] - 是否显示网格线
 * @property {boolean} [showTooltip=true] - 是否显示悬停提示
 * @property {string[]} [colors=["#5470c6","#91cc75","#fac858","#ee6666","#73c0de","#3ba272","#fc8452","#9a60b4","#ea7ccc"]] - 系列颜色数组
 * @property {boolean} [ignoreHiddenData=false] - 是否跳过隐藏行列的数据
 * @property {boolean} [fill] - 是否填充区域（面积图/折线图适用，面积图默认true，折线图默认false）
 * @property {boolean} [smooth] - 是否使用平滑曲线（折线图/面积图适用，默认false）
 * @property {string} [xAxisLabel] - X轴标签文本
 * @property {string} [yAxisLabel] - Y轴标签文本
 * @property {number} [min] - 最小值（仪表盘适用，默认0）
 * @property {number} [max] - 最大值（仪表盘适用，默认100）
 * @property {Array<Object>} [indicators] - 各维度配置（雷达图适用）
 * @property {number} [indicators[].max] - 该维度的最大值
 */

import { BasePlugin } from "./BasePlugin.js";
import { ChartModel, CHART_TYPE } from "@/model/chart/ChartModel";
import { ChartManager } from "@/model/chart/ChartManager";
import { ChartSelectionStrategy } from "@/editor/strategies";
import { HOOKS } from "@/constants/hookNames";
import { SHEET_EVENTS } from "@/constants/sheetEvents";
import { CONFIG } from "@/constants/config.js";

/**
 * 图表插件类
 *
 * @class ChartPlugin
 * @extends BasePlugin
 * @description 提供图表的完整生命周期管理，包括：
 *
 * **支持的图表类型（9种）：**
 * | 类型 | 方法 | CHART_TYPE |
 * |------|------|-----------|
 * | 柱状图 | addBarChart() | "bar" |
 * | 折线图 | addLineChart() | "line" |
 * | 饼图 | addPieChart() | "pie" |
 * | 面积图 | addAreaChart() | "area" |
 * | 散点图 | addScatterChart() | "scatter" |
 * | K线图 | addCandlestickChart() | "candlestick" |
 * | 仪表盘 | addGaugeChart() | "gauge" |
 * | 漏斗图 | addFunnelChart() | "funnel" |
 * | 雷达图 | addRadarChart() | "radar" |
 *
 * **通用调用方式：**
 * ```javascript
 * const chartPlugin = workbook.chartPlugin;
 *
 * // 1. 定义数据范围（表格中 A1:D5 的数据）
 * const dataRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 4 };
 *
 * // 2. 配置图表选项
 * const options = {
 *     anchorRow: 8,       // 锚定到第8行
 *     anchorCol: 1,       // 锚定到第1列(B列)
 *     offsetX: 0,         // X偏移
 *     offsetY: 0,         // Y偏移
 *     width: 450,         // 宽度
 *     height: 300,        // 高度
 *     style: {
 *         title: "销售趋势",
 *         showLegend: true,
 *         showGrid: true,
 *         showTooltip: true,
 *         colors: ['#4472C4', '#ED7D31', '#70AD47'],
 *         xAxisLabel: '产品',
 *         yAxisLabel: '销售额'
 *     }
 * };
 *
 * // 3. 创建图表
 * const chart = chartPlugin.addLineChart(dataRange, options);
 * ```
 *
 * **数据格式约定（与 Excel 一致）：**
 * ```
 * | 分类   | 销售额 | 利润 |   ← 第0行：系列名称（headers）
 * | Q1     | 100    | 30   |   ← 第1行起：数据值
 * | Q2     | 150    | 45   |
 * ```
 *
 * **渲染常量（CONFIG 中的 CHART_* 配置）：**
 * | 常量 | 默认值 | 说明 |
 * |------|--------|------|
 * | CHART_FONT_FAMILY | "sans-serif" | 图表字体族 |
 * | CHART_FONT_SIZE | 11 | 图表字号(px) |
 * | CHART_TEXT_COLOR | "#333" | 图表文字颜色 |
 * | CHART_GRID_COLOR | "#e0e0e0" | 网格线颜色 |
 * | CHART_GRID_LINE_WIDTH | 0.5 | 网格线宽度 |
 * | CHART_AXIS_COLOR | "#666" | 坐标轴颜色 |
 * | CHART_AXIS_LINE_WIDTH | 1 | 坐标轴线宽 |
 * | CHART_BAR_BORDER_COLOR | "rgba(0,0,0,0.15)" | 柱状图边框颜色 |
 * | CHART_AREA_LINE_WIDTH | 2 | 面积图线宽 |
 * | CHART_SCATTER_DOT_RADIUS | 4 | 散点图点半径 |
 * | CHART_LINE_DOT_RADIUS | 3 | 折线图数据点半径 |
 * | CHART_LEGEND_FONT_SIZE | 11 | 图例字号(px) |
 * | CHART_LEGEND_ITEM_SIZE | 12 | 图例色块尺寸 |
 * | CHART_LEGEND_ITEM_WIDTH | 80 | 图例项宽度 |
 * | CHART_MIN_WIDTH | 100 | 图表最小宽度(px) |
 * | CHART_MIN_HEIGHT | 80 | 图表最小高度(px) |
 */
export class ChartPlugin extends BasePlugin {
    static PLUGIN_NAME = "chart";

    #sheetSwitchUnsubscribe = null;

    init(options = {}) {
        super.init(options);
        this.#attachToSheets();
        this.addStrategy("chartSelection", new ChartSelectionStrategy(this.eventHandler));
        this.#bindSheetSwitchListener(this.sheet);
        if (options.enabled === false) {
            this.disable();
        }
    }

    #attachToSheets() {
        const sheetsMap = this.workbook?.sheets;
        if (!sheetsMap) return;
        for (const sheet of sheetsMap.values()) {
            if (!sheet.chartManager) {
                sheet.chartManager = new ChartManager(sheet);
            }
        }
    }

    #bindSheetSwitchListener(sheet) {
        if (!sheet?.bus) return;
        this.#unbindSheetSwitchListener();
        this.#sheetSwitchUnsubscribe = sheet.bus.on(SHEET_EVENTS.SHEET_SWITCHED, (envelope) => {
            const { currentSheet } = envelope.payload;
            const newSheet = this.workbook.sheets.get(currentSheet);
            if (newSheet && !newSheet.chartManager) {
                newSheet.chartManager = new ChartManager(newSheet);
            }
            this.#bindSheetSwitchListener(newSheet);
        });
    }

    #unbindSheetSwitchListener() {
        if (this.#sheetSwitchUnsubscribe) {
            this.#sheetSwitchUnsubscribe();
            this.#sheetSwitchUnsubscribe = null;
        }
    }

    /**
     * 创建图表（通用方法）
     *
     * @method addChart
     * @param {string} type - 图表类型标识符（CHART_TYPE 常量）
     * @param {DataRange} dataRange - 数据范围
     * @param {ChartOptions} [options={}] - 图表选项
     * @returns {ChartModel|null} 创建的图表模型实例，失败返回 null
     *
     * @description 创建流程：
     * 1. 获取当前工作表的 chartManager
     * 2. 处理合并单元格的锚定位置
     * 3. 创建 ChartModel 实例
     * 4. 限制图表不在冻结边界内
     * 5. 添加到 chartManager
     * 6. 触发 AFTER_CHART_ADD 钩子
     * 7. 标记脏位并重新渲染
     */
    addChart(type, dataRange, options = {}) {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) {
            return null;
        }

        let anchorRow = options.anchorRow ?? 0;
        let anchorCol = options.anchorCol ?? 0;
        const merge = sheet.getMerge?.(anchorRow, anchorCol);
        if (merge) {
            anchorRow = merge.topRow;
            anchorCol = merge.topCol;
        }
        const chart = new ChartModel({
            type,
            dataRange,
            anchorRow,
            anchorCol,
            ...options,
        });
        this.#clampToFrozenBoundary(chart, sheet);
        sheet.chartManager.add(chart);
        this.hooks?.runHooks(HOOKS.AFTER_CHART_ADD, chart);
        this.renderEngine?.chartLayer?.markDirty();
        this.render();
        return chart;
    }

    /**
     * 创建柱状图
     *
     * @method addBarChart
     * @param {DataRange} dataRange - 数据范围
     * @param {ChartOptions} [options={}] - 图表选项
     * @param {ChartStyle} [options.style] - 样式配置
     * @param {string[]} [options.style.colors] - 系列颜色数组
     * @returns {ChartModel|null} 创建的图表模型实例
     *
     * @example
     * chartPlugin.addBarChart(
     *     { startRow: 0, startCol: 0, endRow: 5, endCol: 4 },
     *     { anchorRow: 8, anchorCol: 1, width: 450, height: 300,
     *       style: { title: "季度销售", colors: ['#4472C4', '#ED7D31'] } }
     * );
     */
    addBarChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.BAR, dataRange, options);
    }

    /**
     * 创建折线图
     *
     * @method addLineChart
     * @param {DataRange} dataRange - 数据范围
     * @param {ChartOptions} [options={}] - 图表选项
     * @param {ChartStyle} [options.style] - 样式配置
     * @param {boolean} [options.style.fill=false] - 是否填充区域（默认false，设为true则类似面积图）
     * @param {boolean} [options.style.smooth=false] - 是否使用平滑曲线
     * @returns {ChartModel|null} 创建的图表模型实例
     *
     * @example
     * chartPlugin.addLineChart(
     *     { startRow: 0, startCol: 0, endRow: 12, endCol: 3 },
     *     { anchorRow: 2, anchorCol: 6, width: 550, height: 380,
     *       style: { title: "月度趋势", smooth: true, fill: false } }
     * );
     */
    addLineChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.LINE, dataRange, options);
    }

    /**
     * 创建饼图
     *
     * @method addPieChart
     * @param {DataRange} dataRange - 数据范围（仅取第二列作为数值）
     * @param {ChartOptions} [options={}] - 图表选项
     * @param {ChartStyle} [options.style] - 样式配置
     * @returns {ChartModel|null} 创建的图表模型实例
     *
     * @example
     * chartPlugin.addPieChart(
     *     { startRow: 0, startCol: 0, endRow: 5, endCol: 2 },
     *     { anchorRow: 8, anchorCol: 1, width: 400, height: 400,
     *       style: { title: "市场份额" } }
     * );
     */
    addPieChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.PIE, dataRange, options);
    }

    /**
     * 创建面积图
     *
     * @method addAreaChart
     * @param {DataRange} dataRange - 数据范围
     * @param {ChartOptions} [options={}] - 图表选项
     * @param {ChartStyle} [options.style] - 样式配置
     * @param {boolean} [options.style.fill=true] - 是否填充区域（面积图默认true）
     * @param {boolean} [options.style.smooth=false] - 是否使用平滑曲线
     * @returns {ChartModel|null} 创建的图表模型实例
     *
     * @example
     * chartPlugin.addAreaChart(
     *     { startRow: 0, startCol: 0, endRow: 12, endCol: 3 },
     *     { anchorRow: 2, anchorCol: 6, width: 550, height: 380,
     *       style: { title: "销售趋势", fill: true, smooth: true } }
     * );
     */
    addAreaChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.AREA, dataRange, options);
    }

    /**
     * 创建散点图
     *
     * @method addScatterChart
     * @param {DataRange} dataRange - 数据范围（第一列为X轴数值，后续列为Y轴系列）
     * @param {ChartOptions} [options={}] - 图表选项
     * @param {ChartStyle} [options.style] - 样式配置
     * @returns {ChartModel|null} 创建的图表模型实例
     *
     * @example
     * chartPlugin.addScatterChart(
     *     { startRow: 0, startCol: 0, endRow: 20, endCol: 3 },
     *     { anchorRow: 2, anchorCol: 6, width: 500, height: 400,
     *       style: { title: "相关性分析", xAxisLabel: "广告投入", yAxisLabel: "销售额" } }
     * );
     */
    addScatterChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.SCATTER, dataRange, options);
    }

    /**
     * 创建K线图（蜡烛图）
     *
     * @method addCandlestickChart
     * @param {DataRange} dataRange - 数据范围（每行4列：[open, close, low, high]）
     * @param {ChartOptions} [options={}] - 图表选项
     * @param {ChartStyle} [options.style] - 样式配置
     * @returns {ChartModel|null} 创建的图表模型实例
     *
     * @example
     * chartPlugin.addCandlestickChart(
     *     { startRow: 0, startCol: 0, endRow: 10, endCol: 4 },
     *     { anchorRow: 2, anchorCol: 6, width: 600, height: 350,
     *       style: { title: "股票走势" } }
     * );
     */
    addCandlestickChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.CANDLESTICK, dataRange, options);
    }

    /**
     * 创建仪表盘
     *
     * @method addGaugeChart
     * @param {DataRange} dataRange - 数据范围（仅取第一行第二列的值）
     * @param {ChartOptions} [options={}] - 图表选项
     * @param {ChartStyle} [options.style] - 样式配置
     * @param {number} [options.style.min=0] - 最小值
     * @param {number} [options.style.max=100] - 最大值
     * @returns {ChartModel|null} 创建的图表模型实例
     *
     * @example
     * chartPlugin.addGaugeChart(
     *     { startRow: 0, startCol: 0, endRow: 1, endCol: 2 },
     *     { anchorRow: 2, anchorCol: 6, width: 300, height: 250,
     *       style: { title: "完成度", min: 0, max: 100 } }
     * );
     */
    addGaugeChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.GAUGE, dataRange, options);
    }

    /**
     * 创建漏斗图
     *
     * @method addFunnelChart
     * @param {DataRange} dataRange - 数据范围（两列：阶段名称 + 数值）
     * @param {ChartOptions} [options={}] - 图表选项
     * @param {ChartStyle} [options.style] - 样式配置
     * @returns {ChartModel|null} 创建的图表模型实例
     *
     * @example
     * chartPlugin.addFunnelChart(
     *     { startRow: 0, startCol: 0, endRow: 5, endCol: 2 },
     *     { anchorRow: 2, anchorCol: 6, width: 400, height: 400,
     *       style: { title: "转化漏斗" } }
     * );
     */
    addFunnelChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.FUNNEL, dataRange, options);
    }

    /**
     * 创建雷达图
     *
     * @method addRadarChart
     * @param {DataRange} dataRange - 数据范围（第一列为维度名，后续列为系列值）
     * @param {ChartOptions} [options={}] - 图表选项
     * @param {ChartStyle} [options.style] - 样式配置
     * @param {Array<Object>} [options.style.indicators] - 各维度配置
     * @param {number} [options.style.indicators[].max] - 该维度的最大值
     * @returns {ChartModel|null} 创建的图表模型实例
     *
     * @example
     * chartPlugin.addRadarChart(
     *     { startRow: 0, startCol: 0, endRow: 6, endCol: 3 },
     *     { anchorRow: 2, anchorCol: 6, width: 400, height: 400,
     *       style: { title: "能力评估", indicators: [{ max: 100 }] } }
     * );
     */
    addRadarChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.RADAR, dataRange, options);
    }

    addHeatmapChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.HEATMAP, dataRange, options);
    }

    removeChart(id) {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const chart = sheet.chartManager.remove(id);
        if (chart) {
            this.hooks?.runHooks(HOOKS.AFTER_CHART_REMOVE, id);
            this.renderEngine?.chartLayer?.removeChartCache(id);
            this.render();
        }
        return chart;
    }

    updateChartStyle(id, styleUpdate) {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const chart = sheet.chartManager.update(id, { style: styleUpdate });
        if (chart) {
            this.hooks?.runHooks(HOOKS.AFTER_CHART_UPDATE, id);
            this.renderEngine?.chartLayer?.invalidateChart(id);
            this.render();
        }
        return chart;
    }

    updateChartDataRange(id, dataRange) {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const chart = sheet.chartManager.update(id, { dataRange });
        if (chart) {
            this.hooks?.runHooks(HOOKS.AFTER_CHART_UPDATE, id);
            this.renderEngine?.chartLayer?.invalidateChart(id);
            this.render();
        }
        return chart;
    }

    moveChart(id, anchorRow, anchorCol, offsetX, offsetY) {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const updates = {};
        if (anchorRow !== undefined) updates.anchorRow = anchorRow;
        if (anchorCol !== undefined) updates.anchorCol = anchorCol;
        if (offsetX !== undefined) updates.offsetX = offsetX;
        if (offsetY !== undefined) updates.offsetY = offsetY;
        const chart = sheet.chartManager.update(id, updates);
        if (chart) {
            this.#clampToFrozenBoundary(chart, sheet);
            this.renderEngine?.chartLayer?.markDirty();
            this.render();
        }
        return chart;
    }

    resizeChart(id, width, height) {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const chart = sheet.chartManager.update(id, { width, height });
        if (chart) {
            this.#clampToFrozenBoundary(chart, sheet);
            this.renderEngine?.chartLayer?.invalidateChart(id);
            this.render();
        }
        return chart;
    }

    getChart(id) {
        return this.sheet?.chartManager?.get(id) || null;
    }

    getAllCharts() {
        return this.sheet?.chartManager?.getAll() || [];
    }

    hasCharts() {
        return (this.sheet?.chartManager?.count ?? 0) > 0;
    }

    selectChart(id) {
        this.selectedChartId = id;
        this.render();
    }

    deselectChart() {
        this.selectedChartId = null;
        this.render();
    }

    #clampToFrozenBoundary(chart, sheet) {
        const MIN_W = CONFIG.CHART_MIN_WIDTH;
        const MIN_H = CONFIG.CHART_MIN_HEIGHT;
        chart.width = Math.max(MIN_W, chart.width);
        chart.height = Math.max(MIN_H, chart.height);
        const frozenColsW = sheet.frozenColsWidth || 0;
        const frozenRowsH = sheet.frozenRowsHeight || 0;
        if (frozenColsW > 0 && chart.anchorCol < (sheet.fixedColumnsStart || 0)) {
            const maxW = frozenColsW - chart.offsetX - 2;
            if (maxW > MIN_W) chart.width = Math.min(chart.width, maxW);
        }
        if (frozenRowsH > 0 && chart.anchorRow < (sheet.fixedRowsTop || 0)) {
            const maxH = frozenRowsH - chart.offsetY - 2;
            if (maxH > MIN_H) chart.height = Math.min(chart.height, maxH);
        }
    }

    get sheet() {
        return this.workbook?.activeSheet;
    }

    destroy() {
        this.#unbindSheetSwitchListener();
        const sheetsMap = this.workbook?.sheets;
        if (sheetsMap) {
            for (const sheet of sheetsMap.values()) {
                if (sheet.chartManager) {
                    sheet.chartManager.destroy();
                    sheet.chartManager = null;
                }
            }
        }
        super.destroy();
    }
}
