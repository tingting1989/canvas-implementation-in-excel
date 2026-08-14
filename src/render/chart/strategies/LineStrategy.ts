import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, YScale, ChartStyle, HitInfo } from "../types";

export class LineStrategy extends BaseChartStrategy {
    constructor(type: string = "line", name: string = "折线图") {
        super(type, name);
    }

    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: YScale | null): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Line 开始渲染`);

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;
        const stepX = area.w / catCount;
        const pixelRatio = this.getPixelRatio(ctx, area);

        for (let s = 0; s < seriesCount; s++) {
            ctx.strokeStyle = style.colors![s % style.colors!.length];
            ctx.fillStyle = style.colors![s % style.colors!.length];
            ctx.lineWidth = (CONFIG.CHART_LINE_DOT_RADIUS > 3 ? 2 : CONFIG.CHART_TOOLTIP_BORDER_WIDTH) * pixelRatio;

            const points: { x: number; y: number }[] = [];

            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const x = area.x + stepX * i + stepX / 2;
                const y = area.y + area.h - ((val - yMin) / yRange) * area.h;
                points.push({ x, y });
            }

            ctx.beginPath();

            if (style.smooth && points.length > 2) {
                this.drawSmoothCurve(ctx, points);
            } else {
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
            }

            ctx.stroke();

            for (const pt of points) {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, CONFIG.CHART_LINE_DOT_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    protected drawSmoothCurve(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]): void {
        const tension = 0.3;
        const n = points.length;

        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 0; i < n - 1; i++) {
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(n - 1, i + 2)];

            const cp1x = p1.x + (p2.x - p0.x) * tension;
            const cp1y = p1.y + (p2.y - p0.y) * tension;
            const cp2x = p2.x - (p3.x - p1.x) * tension;
            const cp2y = p2.y - (p3.y - p1.y) * tension;

            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
    }

    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: YScale | null): HitInfo | null {
        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;
        const stepX = area.w / catCount;
        const dotR = Math.max(CONFIG.CHART_LINE_DOT_RADIUS || 4, HIT_RADIUS);
        const lineSnapDist = 10;

        let closestHit: HitInfo | null = null;
        let minDistSq = dotR * dotR;

        for (let s = 0; s < seriesCount; s++) {
            const points: { x: number; y: number; val: number; idx: number }[] = [];

            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const dx = area.x + stepX * i + stepX / 2;
                const dy = area.y + area.h - ((val - yMin) / yRange) * area.h;
                points.push({ x: dx, y: dy, val, idx: i });

                const distSq = (px - dx) * (px - dx) + (py - dy) * (py - dy);

                if (distSq <= dotR * dotR && distSq < minDistSq) {
                    minDistSq = distSq;
                    closestHit = {
                        category: String(data.data[i][0]),
                        seriesName: String(data.headers[s + 1] || ""),
                        value: val,
                        pointX: dx,
                        pointY: dy,
                    };
                }
            }

            if (!closestHit && points.length > 1) {
                for (let i = 0; i < points.length - 1; i++) {
                    const p1 = points[i];
                    const p2 = points[i + 1];

                    const dist = this.pointToSegmentDistance(px, py, p1.x, p1.y, p2.x, p2.y);

                    if (dist <= lineSnapDist) {
                        const distToP1 = Math.sqrt((px - p1.x) ** 2 + (py - p1.y) ** 2);
                        const distToP2 = Math.sqrt((px - p2.x) ** 2 + (py - p2.y) ** 2);
                        const nearestPoint = distToP1 <= distToP2 ? p1 : p2;

                        closestHit = {
                            category: String(data.data[nearestPoint.idx][0]),
                            seriesName: String(data.headers[s + 1] || ""),
                            value: nearestPoint.val,
                            pointX: nearestPoint.x,
                            pointY: nearestPoint.y,
                        };

                        break;
                    }
                }
            }

            if (closestHit) break;
        }

        return closestHit;
    }

    protected getYMin(data: ChartData): number {
        let min = Infinity;
        for (const row of data.data) {
            for (let c = 1; c < row.length; c++) {
                const v = Number(row[c]);
                if (!isNaN(v) && v < min) min = v;
            }
        }
        return min === Infinity ? 0 : min;
    }

    protected getYMax(data: ChartData): number {
        let max = -Infinity;
        for (const row of data.data) {
            for (let c = 1; c < row.length; c++) {
                const v = Number(row[c]);
                if (!isNaN(v) && v > max) max = v;
            }
        }
        return max === -Infinity ? 1 : max;
    }
}