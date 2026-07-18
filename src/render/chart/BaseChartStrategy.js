/**
 * @fileoverview 图表渲染策略基类
 * @description 定义所有图表策略的公共接口和默认实现。
 *              每种图表类型（柱状图、折线图等）都继承此类并重写相应方法。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module render/chart/BaseChartStrategy
 * @see {@link BarStrategy} 柱状图策略
 * @see {@link LineStrategy} 折线图策略
 * @see {@link PieStrategy} 饼图策略
 * @see {@link AreaStrategy} 面积图策略
 * @see {@link ScatterStrategy} 散点图策略
 * @see {@link CandlestickStrategy} K线图策略
 * @see {@link GaugeStrategy} 仪表盘策略
 * @see {@link FunnelStrategy} 漏斗图策略
 * @see {@link RadarStrategy} 雷达图策略
 *
 * @typedef {Object} HitInfo
 * @property {string} category - 类别名（如"1月"、"产品A"）
 * @property {string} seriesName - 系列名称（如"销售额"）
 * @property {number|string} value - 数值（K线图为格式化字符串）
 * @property {number} pointX - 命中点 X 坐标（用于定位 Tooltip）
 * @property {number} pointY - 命中点 Y 坐标（用于定位 Tooltip）
 * @property {Object} [detail] - 详细信息（K线图、仪表盘、漏斗图、雷达图适用）
 */

/** 点击检测的默认容差半径（px） */
const HIT_RADIUS = 12;
export { HIT_RADIUS };

/**
 * 图表渲染策略基类
 *
 * @class BaseChartStrategy
 * @description 定义所有图表策略必须实现的接口：
 *
 * **必须重写的方法：**
 * | 方法 | 说明 |
 * |------|------|
 * | render() | 渲染图表到 Canvas |
 * | hitTest() | 检测鼠标点击是否命中 |
 *
 * **可选重写的方法：**
 * | 方法 | 默认返回 | 说明 |
 * |------|----------|------|
 * | isAxisFree() | false | 是否不需要坐标轴 |
 * | formatTooltip() | 默认格式 | 格式化 Tooltip 文本 |
 * | formatDetail() | 默认格式 | 格式化详细信息 |
 *
 * **子类列表：**
 * - BarStrategy（柱状图）
 * - LineStrategy（折线图）→ AreaStrategy（面积图）
 * - PieStrategy（饼图）
 * - ScatterStrategy（散点图）
 * - CandlestickStrategy（K线图）
 * - GaugeStrategy（仪表盘）
 * - FunnelStrategy（漏斗图）
 * - RadarStrategy（雷达图）
 */
export class BaseChartStrategy {
    constructor(type, name) {
        this.type = type;
        this.name = name;
    }

    /**
     * 渲染图表到 Canvas 上下文（子类必须重写）
     *
     * @method render
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {Object} data - 图表数据对象
     * @param {string[]} data.headers - 列标题数组
     * @param {Array<Array<number|string>>} data.data - 二维数据数组
     * @param {Object} area - 绘制区域坐标
     * @param {number} area.x - 区域左上角 X 坐标
     * @param {number} area.y - 区域左上角 Y 坐标
     * @param {number} area.w - 区域宽度
     * @param {number} area.h - 区域高度
     * @param {Object} style - 样式配置（ChartStyle）
     * @param {Object} [yScale] - Y轴刻度信息
     * @param {number} yScale.min - Y轴最小值
     * @param {number} yScale.max - Y轴最大值
     */
    render(ctx, data, area, style, yScale) {}

    /**
     * 获取当前渲染的像素比（用于高清导出）
     *
     * 优先级：
     * 1. 外部通过 setPixelRatio() 设置的值（高清导出时使用）
     * 2. 通过 Canvas 尺寸自动计算的值（普通渲染时使用）
     * 3. 默认值 1（兜底）
     *
     * @protected
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {Object} area - 绘制区域坐标
     * @returns {number} 像素比（默认 1）
     */
    getPixelRatio(ctx, area) {
        if (this._pixelRatio && this._pixelRatio > 1) {
            return this._pixelRatio;
        }

        try {
            const logicalWidth = area.x + area.w + 56;
            const calculated = ctx.canvas.width / logicalWidth;

            if (calculated > 1.5) {
                return Math.round(calculated);
            }

            return 1;
        } catch {
            return 1;
        }
    }

    /**
     * 设置像素比（由 NativeChartRenderer 在高清渲染时调用）
     *
     * @protected
     * @param {number} ratio - 像素比值
     */
    setPixelRatio(ratio) {
        this._pixelRatio = ratio;
    }

    /**
     * 清除像素比设置（渲染完成后调用）
     *
     * @protected
     */
    clearPixelRatio() {
        this._pixelRatio = undefined;
    }

    /**
     * 检测鼠标点击是否命中图表元素（子类必须重写）
     *
     * @method hitTest
     * @param {number} px - 鼠标点击的 X 坐标（相对于 Canvas）
     * @param {number} py - 鼠标点击的 Y 坐标（相对于 Canvas）
     * @param {Object} data - 图表数据对象
     * @param {Object} area - 绘制区域坐标
     * @param {number} seriesCount - 系列数量
     * @param {number} catCount - 类别数量
     * @param {Object} [yScale] - Y轴刻度信息
     * @returns {HitInfo|null} 命中信息对象，未命中返回 null
     */
    hitTest(px, py, data, area, seriesCount, catCount, yScale) {
        return null;
    }

    /**
     * 判断是否为无坐标轴图表
     *
     * @method isAxisFree
     * @returns {boolean} 默认返回 false（需要坐标轴）
     * @description 返回 true 的图表类型：饼图、仪表盘、漏斗图、雷达图
     */
    isAxisFree() {
        return false;
    }

    /**
     * 格式化 Tooltip 文本
     *
     * @method formatTooltip
     * @param {HitInfo} hoverInfo - 命中信息对象
     * @returns {string[]} 格式化后的文本行数组
     * @description 默认格式：
     * - 有 detail：显示类别名 + formatDetail() 的输出
     * - 有 seriesName：显示"类别名\n系列名: 数值"
     * - 无 seriesName：显示"类别名\n数值"
     */
    formatTooltip(hoverInfo) {
        const lines = [String(hoverInfo.category)];
        let displayValue;

        if (typeof hoverInfo.value === "number" && !isNaN(hoverInfo.value)) {
            displayValue = Number.isInteger(hoverInfo.value) ? String(hoverInfo.value) : hoverInfo.value.toFixed(2);
        } else {
            displayValue = String(hoverInfo.value ?? "");
        }

        if (hoverInfo.detail) {
            lines.push(...this.formatDetail(hoverInfo.detail));
        } else if (hoverInfo.seriesName && hoverInfo.seriesName !== "undefined") {
            lines.push(`${hoverInfo.seriesName}: ${displayValue}`);
        } else {
            lines.push(displayValue);
        }

        return lines;
    }

    /**
     * 格式化详细信息（供 Tooltip 显示）
     *
     * @method formatDetail
     * @param {Object} detail - 详细信息对象
     * @returns {string[]} 格式化后的文本行数组
     * @description 子类可重写此方法提供自定义格式（如K线图、仪表盘等）
     */
    formatDetail(detail) {
        return [detail.value ?? detail];
    }
}
