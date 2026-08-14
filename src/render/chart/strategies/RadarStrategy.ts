import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, ChartStyle, HitInfo, RadarRenderData } from "../types";

export class RadarStrategy extends BaseChartStrategy {
    #lastRenderData: RadarRenderData | null = null;

    constructor() {
        super("radar", "雷达图");
    }

    isAxisFree(): boolean {
        return true;
    }

    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Radar 开始渲染`);

        const dimCount = data.data.length;
        const seriesCount = data.headers.length - 1;
        if (dimCount < 3 || seriesCount <= 0) return;

        const indicators = data.data.map((row) => String(row?.[0] || ""));
        const values = data.data.map((row) => row.slice(1).map((v) => Number(v) || 0));

        const maxValues: number[] = [];
        for (let j = 0; j < seriesCount; j++) {
            const maxVal = Math.max(...values.map((row) => row[j]));
            maxValues[j] = (style?.indicators?.[j] as { max?: number } | undefined)?.max || (maxVal > 0 ? maxVal * 1.2 : 100);
        }

        const cx = area.x + area.w / 2;
        const cy = area.y + area.h / 2;
        const radius = Math.min(area.w, area.h) * 0.38;
        const angleStep = (Math.PI * 2) / dimCount;
        const levels = 5;

        const pixelRatio = this.getPixelRatio(ctx, area);
        ctx.lineWidth = 1 * pixelRatio;
        ctx.strokeStyle = "#e0e0e0";
        for (let level = 1; level <= levels; level++) {
            const r = (radius * level) / levels;
            ctx.beginPath();
            for (let i = 0; i <= dimCount; i++) {
                const angle = -Math.PI / 2 + i * angleStep;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        }

        for (let i = 0; i < dimCount; i++) {
            const angle = -Math.PI / 2 + i * angleStep;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
            ctx.stroke();
        }

        ctx.font = `${CONFIG.CHART_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.fillStyle = "#333";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < dimCount; i++) {
            const angle = -Math.PI / 2 + i * angleStep;
            const labelRadius = radius + 20 * pixelRatio;
            const x = cx + labelRadius * Math.cos(angle);
            const y = cy + labelRadius * Math.sin(angle);
            ctx.fillText(indicators[i], x, y);
        }

        const colors = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272"];

        for (let j = 0; j < seriesCount; j++) {
            const color = colors[j % colors.length];
            const points: { x: number; y: number; value: number; indicator: string; seriesName: string; index: number }[] = [];

            for (let i = 0; i < dimCount; i++) {
                const val = values[i][j];
                const maxVal = maxValues[j] || 100;
                const ratio = Math.min(val / maxVal, 1.2);

                const angle = -Math.PI / 2 + i * angleStep;
                const r = radius * ratio;
                points.push({
                    x: cx + r * Math.cos(angle),
                    y: cy + r * Math.sin(angle),
                    value: val,
                    indicator: indicators[i],
                    seriesName: data.headers[j + 1],
                    index: i,
                });
            }

            ctx.globalAlpha = 0.15;
            ctx.fillStyle = color;
            ctx.beginPath();
            points.forEach((p, idx) => {
                if (idx === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.fill();

            ctx.globalAlpha = 1;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 * pixelRatio;
            ctx.beginPath();
            points.forEach((p, idx) => {
                if (idx === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.stroke();

            ctx.fillStyle = color;
            points.forEach((p) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        this.#lastRenderData = { indicators, values, maxValues, cx, cy, radius, angleStep, seriesCount };
    }

    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: unknown): HitInfo | null {
        if (!this.#lastRenderData) return null;

        const { indicators, values, maxValues, cx, cy, radius, angleStep } = this.#lastRenderData;
        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        if (dist > radius + 10 || dist < 5) return null;

        let mouseAngle = Math.atan2(py - cy, px - cx) + Math.PI / 2;
        if (mouseAngle < 0) mouseAngle += Math.PI * 2;

        const dimIndex = Math.round(mouseAngle / angleStep) % indicators.length;

        for (let j = 0; j < this.#lastRenderData.seriesCount; j++) {
            const val = values[dimIndex]?.[j];
            const maxVal = maxValues[j] || 100;
            const pointDist = radius * Math.min(val / maxVal, 1.2);

            if (Math.abs(dist - pointDist) < HIT_RADIUS) {
                return {
                    category: indicators[dimIndex],
                    seriesName: data.headers[j + 1],
                    value: val,
                    detail: {
                        type: "radar",
                        dimension: indicators[dimIndex],
                        value: val,
                        maxValue: maxVal,
                        percentage: ((val / maxVal) * 100).toFixed(1) + "%",
                    },
                    pointX: px,
                    pointY: py,
                };
            }
        }

        return null;
    }

    formatDetail(detail: Record<string, unknown>): string[] {
        return [`📊 维度: ${detail.dimension}`, `─────────`, `数值: ${detail.value}`, `最大值: ${detail.maxValue}`, `占比: ${detail.percentage}`];
    }
}
