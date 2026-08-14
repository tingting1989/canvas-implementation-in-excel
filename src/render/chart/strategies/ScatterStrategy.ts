import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, YScale, ChartStyle, HitInfo } from "../types";

export class ScatterStrategy extends BaseChartStrategy {
    constructor() {
        super("scatter", "散点图");
    }

    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: YScale | null): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Scatter 开始渲染`);

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const allX = data.data.map((row) => Number(row[0]) || 0);
        const allY = data.data.flatMap((row) => row.slice(1).map((v) => Number(v) || 0));
        const xMin = Math.min(...allX);
        const xMax = Math.max(...allX);
        const yMin = yScale ? yScale.min : Math.min(...allY);
        const yMax = yScale ? yScale.max : Math.max(...allY);
        const xRange = xMax - xMin || 1;
        const yRange = yMax - yMin || 1;

        for (let s = 0; s < seriesCount; s++) {
            ctx.fillStyle = style.colors![s % style.colors!.length];

            for (let i = 0; i < catCount; i++) {
                const xVal = Number(data.data[i][0]) || 0;
                const yVal = Number(data.data[i][s + 1]) || 0;
                const x = area.x + ((xVal - xMin) / xRange) * area.w;
                const y = area.y + area.h - ((yVal - yMin) / yRange) * area.h;

                ctx.beginPath();
                ctx.arc(x, y, CONFIG.CHART_SCATTER_DOT_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: YScale | null): HitInfo | null {
        const allX = data.data.map((row) => Number(row[0]) || 0);
        const allY = data.data.flatMap((row) => row.slice(1).map((v) => Number(v) || 0));
        const xMin = Math.min(...allX);
        const xMax = Math.max(...allX);
        const yMin = yScale ? yScale.min : Math.min(...allY);
        const yMax = yScale ? yScale.max : Math.max(...allY);
        const xRange = xMax - xMin || 1;
        const yRange = yMax - yMin || 1;
        const dotR = Math.max(CONFIG.CHART_SCATTER_DOT_RADIUS, HIT_RADIUS);

        for (let s = 0; s < seriesCount; s++) {
            for (let i = 0; i < catCount; i++) {
                const xVal = Number(data.data[i][0]) || 0;
                const yVal = Number(data.data[i][s + 1]) || 0;
                const dx = area.x + ((xVal - xMin) / xRange) * area.w;
                const dy = area.y + area.h - ((yVal - yMin) / yRange) * area.h;

                if ((px - dx) * (px - dx) + (py - dy) * (py - dy) <= dotR * dotR) {
                    return {
                        category: String(xVal),
                        seriesName: String(data.headers[s + 1] || ""),
                        value: yVal,
                        pointX: dx,
                        pointY: dy,
                    };
                }
            }
        }
        return null;
    }
}