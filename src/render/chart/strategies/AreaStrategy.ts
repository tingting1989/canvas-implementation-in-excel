import { LineStrategy } from "./LineStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, YScale, ChartStyle } from "../types";

export class AreaStrategy extends LineStrategy {
    constructor() {
        super("area", "面积图");
    }

    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: YScale | null): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Area 开始渲染`);

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;
        const stepX = area.w / catCount;
        const pixelRatio = this.getPixelRatio(ctx, area);

        ctx.lineWidth = CONFIG.CHART_AREA_LINE_WIDTH * pixelRatio;

        for (let s = seriesCount - 1; s >= 0; s--) {
            const color = style.colors![s % style.colors!.length];
            ctx.fillStyle = color + "40";
            ctx.strokeStyle = color;

            const baseline = area.y + area.h;
            const points: { x: number; y: number }[] = [];
            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const x = area.x + stepX * i + stepX / 2;
                const y = area.y + area.h - ((val - yMin) / yRange) * area.h;
                points.push({ x, y });
            }

            ctx.beginPath();
            ctx.moveTo(points[0].x, baseline);

            if (style.smooth && points.length > 2) {
                ctx.lineTo(points[0].x, points[0].y);
                this.drawSmoothCurve(ctx, points);
            } else {
                for (const pt of points) {
                    ctx.lineTo(pt.x, pt.y);
                }
            }

            ctx.lineTo(points[points.length - 1].x, baseline);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            if (style.smooth && points.length > 2) {
                ctx.moveTo(points[0].x, points[0].y);
                this.drawSmoothCurve(ctx, points);
            } else {
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
            }
            ctx.stroke();
        }
    }
}