/**
 * @fileoverview 图表数据模型
 * @description 定义图表的所有属性和默认值，包括位置、尺寸、样式等。
 *              每个图表实例对应一个 ChartModel 对象。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module model/chart/ChartModel
 * @see {@link ChartPlugin} 图表插件（创建和管理图表）
 * @see {@link ChartManager} 图表管理器（增删改查）
 *
 * @typedef {Object} ChartModelOptions
 * @property {string} [id] - 图表唯一标识（默认自动生成 UUID）
 * @property {string} [type="bar"] - 图表类型标识符（CHART_TYPE 常量）
 * @property {number} [anchorRow=0] - 锚定行号
 * @property {number} [anchorCol=0] - 锚定列号
 * @property {number} [offsetX=0] - X像素偏移
 * @property {number} [offsetY=0] - Y像素偏移
 * @property {number} [width=400] - 图表宽度(px)
 * @property {number} [height=300] - 图表高度(px)
 * @property {DataRange|null} [dataRange=null] - 数据范围
 * @property {ChartStyle} [style] - 样式配置
 */



import {CHART_TYPE} from "../../constants/enums/ChartType.js";

/** 默认系列颜色数组（9色） */
const DEFAULT_COLORS = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc"];

/**
 * 图表数据模型类
 *
 * @class ChartModel
 * @description 存储图表的所有配置信息，包括：
 *
 * **位置属性：**
 * | 属性 | 类型 | 默认值 | 说明 |
 * |------|------|--------|------|
 * | anchorRow | number | 0 | 锚定行号（图表左上角绑定的单元格行） |
 * | anchorCol | number | 0 | 锚定列号（图表左上角绑定的单元格列） |
 * | offsetX | number | 0 | 相对锚单元格的 X 像素偏移 |
 * | offsetY | number | 0 | 相对锚单元格的 Y 像素偏移 |
 *
 * **尺寸属性：**
 * | 属性 | 类型 | 默认值 | 说明 |
 * |------|------|--------|------|
 * | width | number | 400 | 图表宽度(px) |
 * | height | number | 300 | 图表高度(px) |
 *
 * **样式属性（style 对象）：**
 * | 属性 | 类型 | 默认值 | 说明 |
 * |------|------|--------|------|
 * | title | string | "" | 图表标题 |
 * | showLegend | boolean | true | 是否显示图例 |
 * | showGrid | boolean | true | 是否显示网格线 |
 * | showTooltip | boolean | true | 是否显示悬停提示 |
 * | colors | string[] | DEFAULT_COLORS | 系列颜色数组 |
 * | ignoreHiddenData | boolean | false | 是否跳过隐藏行列 |
 * | fill | boolean | - | 是否填充区域 |
 * | smooth | boolean | - | 是否平滑曲线 |
 * | xAxisLabel | string | - | X轴标签 |
 * | yAxisLabel | string | - | Y轴标签 |
 * | min | number | - | 最小值（仪表盘） |
 * | max | number | - | 最大值（仪表盘） |
 * | indicators | Array | - | 维度配置（雷达图） |
 *
 * @example
 * const chart = new ChartModel({
 *     type: "line",
 *     dataRange: { startRow: 0, startCol: 0, endRow: 12, endCol: 3 },
 *     anchorRow: 8,
 *     anchorCol: 1,
 *     width: 450,
 *     height: 300,
 *     style: {
 *         title: "销售趋势",
 *         showLegend: true,
 *         colors: ['#4472C4', '#ED7D31'],
 *         fill: false,
 *         smooth: true
 *     }
 * });
 */
export class ChartModel {
    /**
     * 构造图表数据模型
     * @param {ChartModelOptions} [options={}] - 图表配置选项
     */
    constructor(options = {}) {
        /** @type {string} 图表唯一标识，未指定时自动生成 UUID */
        this.id = options.id || crypto.randomUUID();
        /** @type {string} 图表类型标识符，默认柱状图 */
        this.type = options.type || CHART_TYPE.BAR;
        /** @type {number} 锚定行号（图表左上角绑定的单元格行） */
        this.anchorRow = options.anchorRow ?? 0;
        /** @type {number} 锚定列号（图表左上角绑定的单元格列） */
        this.anchorCol = options.anchorCol ?? 0;
        /** @type {number} 相对锚单元格的 X 像素偏移 */
        this.offsetX = options.offsetX ?? 0;
        /** @type {number} 相对锚单元格的 Y 像素偏移 */
        this.offsetY = options.offsetY ?? 0;
        /** @type {number} 图表宽度(px) */
        this.width = options.width ?? 400;
        /** @type {number} 图表高度(px) */
        this.height = options.height ?? 300;
        /** @type {DataRange|null} 图表关联的数据范围，null 表示未绑定数据 */
        this.dataRange = options.dataRange || null;
        /** @type {ChartStyle} 图表样式配置 */
        this.style = {
            title: "",
            showLegend: true,
            showGrid: true,
            colors: [...DEFAULT_COLORS],
            ignoreHiddenData: false,
            showTooltip: true,
            ...options.style,
        };
        /** @type {object|null} 缓存的图表计算数据，用于避免重复计算 */
        this._cachedData = null;
        /** @type {number} 缓存版本号，用于判断缓存是否过期 */
        this._cacheVersion = -1;
    }

    /**
     * 计算图表在视口中的边界矩形
     * 若未提供 viewport，则仅返回偏移量作为坐标（适用于无视口场景）
     * 若提供 viewport，则根据锚单元格的视口坐标 + 偏移量计算实际位置
     * @param {object} [viewport] - 视口对象，需提供 colToViewX / rowToViewY 方法
     * @returns {{ x: number, y: number, w: number, h: number }} 边界矩形 { x, y, w, h }
     */
    getBounds(viewport) {
        if (!viewport) {
            return { x: this.offsetX, y: this.offsetY, w: this.width, h: this.height };
        }
        const anchorX = viewport.colToViewX(this.anchorCol);
        const anchorY = viewport.rowToViewY(this.anchorRow);
        return {
            x: anchorX + this.offsetX,
            y: anchorY + this.offsetY,
            w: this.width,
            h: this.height,
        };
    }

    /**
     * 判断指定点是否在图表边界矩形内
     * @param {number} px - 点的 X 坐标
     * @param {number} py - 点的 Y 坐标
     * @param {object} [viewport] - 视口对象，需提供 colToViewX / rowToViewY 方法
     * @returns {boolean} 点是否在图表区域内
     */
    containsPoint(px, py, viewport) {
        const b = this.getBounds(viewport);
        return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
    }

    /**
     * 将图表模型序列化为纯 JSON 对象，用于持久化存储或传输
     * 不包含缓存相关属性（_cachedData、_cacheVersion）
     * @returns {object} 可 JSON 序列化的图表数据对象
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            anchorRow: this.anchorRow,
            anchorCol: this.anchorCol,
            offsetX: this.offsetX,
            offsetY: this.offsetY,
            width: this.width,
            height: this.height,
            dataRange: this.dataRange,
            style: { ...this.style },
        };
    }

    /**
     * 从 JSON 对象反序列化创建 ChartModel 实例
     * @param {object} json - 由 toJSON() 生成的序列化对象
     * @returns {ChartModel} 还原的图表模型实例
     */
    static fromJSON(json) {
        return new ChartModel(json);
    }
}
