import type { PlotArea, ChartData, ChartStyle } from "./types";

export class IChartRenderer {
    render(ctx: CanvasRenderingContext2D, chart: unknown, data: ChartData, plotArea: PlotArea, style: ChartStyle): void {
        throw new Error("IChartRenderer.render() must be implemented by subclass");
    }

    hitTest(px: number, py: number, chart: unknown, viewport: unknown): boolean {
        return (chart as { containsPoint(px: number, py: number, viewport: unknown): boolean }).containsPoint(px, py, viewport);
    }

    destroy(): void {}
}
