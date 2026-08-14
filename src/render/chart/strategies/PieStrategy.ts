import { BaseChartStrategy } from "../BaseChartStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, ChartStyle, HitInfo } from "../types";

export class PieStrategy extends BaseChartStrategy {
    constructor() {
        super("pie", "饼图");
    }

    isAxisFree(): boolean {
        return true;
    }

    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Pie 开始渲染`);

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const values = data.data.map((row) => Number(row[1]) || 0);
        const total = values.reduce((sum, v) => sum + v, 0);
        if (total === 0) return;

        const cx = area.x + area.w / 2;
        const cy = area.y + area.h / 2;
        const r = Math.min(area.w, area.h) / 2 - 10;

        const pixelRatio = this.getPixelRatio(ctx, area);
        ctx.strokeStyle = CONFIG.CHART_TOOLTIP_BORDER;
        ctx.lineWidth = CONFIG.CHART_TOOLTIP_BORDER_WIDTH * pixelRatio;
        ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
        ctx.font = `${CONFIG.CHART_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;

        let startAngle = -Math.PI / 2;

        for (let i = 0; i < catCount; i++) {
            const sliceAngle = (values[i] / total) * Math.PI * 2;
            ctx.fillStyle = style.colors![i % style.colors!.length];

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            const midAngle = startAngle + sliceAngle / 2;
            const pct = ((values[i] / total) * 100).toFixed(1) + "%";
            ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
            const labelR = r * 0.65;
            ctx.fillText(pct, cx + Math.cos(midAngle) * labelR, cy + Math.sin(midAngle) * labelR);

            startAngle += sliceAngle;
        }
    }

    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: unknown): HitInfo | null {
        const values = data.data.map((row) => Number(row[1]) || 0);
        const total = values.reduce((sum, v) => sum + v, 0);
        if (total === 0) return null;

        const cx = area.x + area.w / 2;
        const cy = area.y + area.h / 2;
        const r = Math.min(area.w, area.h) / 2 - 10;

        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) return null;

        let angle = Math.atan2(dy, dx);
        if (angle < -Math.PI / 2) angle += Math.PI * 2;

        let startAngle = -Math.PI / 2;
        for (let i = 0; i < catCount; i++) {
            const sliceAngle = (values[i] / total) * Math.PI * 2;
            let endAngle = startAngle + sliceAngle;
            if (endAngle > (Math.PI * 3) / 2) endAngle -= Math.PI * 2;

            const normalizedAngle = angle;
            if (startAngle <= endAngle) {
                if (normalizedAngle >= startAngle && normalizedAngle <= endAngle) {
                    return {
                        category: String(data.data[i][0]),
                        seriesName: "",
                        value: values[i],
                        pointX: cx + Math.cos(startAngle + sliceAngle / 2) * r * 0.6,
                        pointY: cy + Math.sin(startAngle + sliceAngle / 2) * r * 0.6,
                    };
                }
            } else {
                if (normalizedAngle >= startAngle || normalizedAngle <= endAngle) {
                    return {
                        category: String(data.data[i][0]),
                        seriesName: "",
                        value: values[i],
                        pointX: cx + Math.cos(startAngle + sliceAngle / 2) * r * 0.6,
                        pointY: cy + Math.sin(startAngle + sliceAngle / 2) * r * 0.6,
                    };
                }
            }
            startAngle += sliceAngle;
        }
        return null;
    }
}
