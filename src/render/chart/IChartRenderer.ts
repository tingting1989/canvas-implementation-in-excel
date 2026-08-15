/**
 * @fileoverview 图表渲染器抽象接口
 * @description 定义图表渲染器的最小契约，供 ChartRendererFactory 统一调度。
 *              子类需实现 render / hitTest / destroy 三个核心方法。
 * @module render/chart/IChartRenderer
 */

import type { PlotArea, ChartData, ChartStyle } from "./types";

/**
 * 图表渲染器抽象接口
 *
 * 定义所有图表渲染器（NativeChartRenderer、ECharts 桥接等）的公共契约。
 * 作为基类使用，子类必须覆写 render() 方法。
 * hitTest() 默认委托给 chart.containsPoint()，destroy() 默认为空操作。
 *
 * @class IChartRenderer
 */
export class IChartRenderer {
    /**
     * 渲染图表到 Canvas 上下文
     *
     * 子类必须实现此方法，否则抛出错误。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param chart - 图表对象实例
     * @param data - 图表数据，headers 为列标题，data 为数据行
     * @param plotArea - 绘图区域矩形
     * @param style - 图表样式配置
     * @throws Error 若子类未实现此方法
     */
    render(ctx: CanvasRenderingContext2D, chart: unknown, data: ChartData, plotArea: PlotArea, style: ChartStyle): void {
        throw new Error("IChartRenderer.render() must be implemented by subclass");
    }

    /**
     * 命中测试
     *
     * 判断坐标 (px, py) 是否落在图表元素上。
     * 默认委托给 chart.containsPoint() 方法。
     *
     * @param px - 点击位置的 X 坐标
     * @param py - 点击位置的 Y 坐标
     * @param chart - 图表对象实例
     * @param viewport - 视口信息
     * @returns 是否命中图表元素
     */
    hitTest(px: number, py: number, chart: unknown, viewport: unknown): boolean {
        return (chart as { containsPoint(px: number, py: number, viewport: unknown): boolean }).containsPoint(px, py, viewport);
    }

    /**
     * 销毁渲染器
     *
     * 释放渲染器持有的资源。默认为空操作，子类按需覆写。
     */
    destroy(): void {}
}
