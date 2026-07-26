/**
 * 图表渲染器接口（IChartRenderer）
 *
 * 定义所有图表类型渲染器的统一契约。
 * 每种图表类型（柱状图、折线图、饼图、K 线图等）都需实现此接口，
 * 由 ChartLayer 通过策略模式调度。
 *
 * ## 接口方法
 *
 * | 方法      | 用途                                         |
 * |-----------|----------------------------------------------|
 * | render    | 将图表数据绘制到 Canvas 指定区域              |
 * | hitTest   | 检测像素坐标是否命中图表元素（用于交互）       |
 * | destroy   | 释放渲染器持有的资源（事件监听、缓存等）       |
 *
 * ## 使用方式
 *
 * ```js
 * class BarChartRenderer extends IChartRenderer {
 *     render(ctx, chart, data, plotArea, style) { ... }
 *     hitTest(px, py, chart, viewport) { ... }
 *     destroy() { ... }
 * }
 * ```
 *
 * @see ChartLayer 图表层，负责调度 IChartRenderer 实例
 * @see ChartStrategyRegistry 图表策略注册表，管理类型 → 渲染器的映射
 */
export class IChartRenderer {
    /**
     * 渲染图表
     *
     * 将图表数据绘制到 Canvas 的 plotArea 区域内。
     * 子类必须实现此方法，否则抛出错误。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../../workbook/Chart.js").Chart} chart - 图表配置对象（含类型、系列、轴配置等）
     * @param {Object} data - 图表数据（含 series 数组、categories 等）
     * @param {{ x: number, y: number, w: number, h: number }} plotArea - 绘图区域矩形（逻辑像素，已扣除坐标轴/图例/内边距）
     * @param {Object} style - 图表样式配置（颜色主题、字体、网格线等）
     */
    render(ctx, chart, data, plotArea, style) {
        throw new Error("IChartRenderer.render() must be implemented by subclass");
    }

    /**
     * 命中测试：检测像素坐标是否命中图表元素
     *
     * 默认实现委托给 chart.containsPoint()，子类可覆盖以提供
     * 更精确的命中检测（如检测具体的数据点、图例项等）。
     *
     * @param {number} px - 像素 X 坐标（Canvas 逻辑坐标）
     * @param {number} py - 像素 Y 坐标（Canvas 逻辑坐标）
     * @param {import("../../workbook/Chart.js").Chart} chart - 图表配置对象
     * @param {import("../ViewportTransform.js").ViewportTransform} viewport - 视口坐标转换器
     * @returns {boolean} 是否命中图表元素
     */
    hitTest(px, py, chart, viewport) {
        return chart.containsPoint(px, py, viewport);
    }

    /**
     * 销毁渲染器，释放持有的资源
     *
     * 子类可覆盖此方法以清理事件监听器、缓存等资源。
     * 默认实现为空操作。
     */
    destroy() {}
}
