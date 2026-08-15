/**
 * @fileoverview 图表渲染器抽象接口
 * @description 定义图表渲染器的最小契约，供 ChartRendererFactory 统一调度。
 *              子类需实现 render / hitTest / destroy 三个核心方法。
 * @module render/chart/IChartRenderer
 */

import type { PlotArea, ChartData, ChartStyle } from "./types";

export class IChartRenderer {
    /** 渲染图表到 Canvas 上下文，子类必须实现 */
    render(ctx: CanvasRenderingContext2D, chart: unknown, data: ChartData, plotArea: PlotArea, style: ChartStyle): void {
        throw new Error("IChartRenderer.render() must be implemented by subclass");
    }

    /** 命中测试：判断坐标 (px, py) 是否落在图表元素上 */
    hitTest(px: number, py: number, chart: unknown, viewport: unknown): boolean {
        return (chart as { containsPoint(px: number, py: number, viewport: unknown): boolean }).containsPoint(px, py, viewport);
    }

    /** 销毁渲染器，释放资源 */
    destroy(): void {}
}