import { BaseChartStrategy } from "../BaseChartStrategy";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, YScale, ChartStyle, HitInfo } from "../types";

export class CandlestickStrategy extends BaseChartStrategy {
    constructor() {
        super("candlestick", "K线图");
    }

    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: YScale | null): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Candlestick 开始渲染`);

        const catCount = data.data.length;
        if (catCount <= 0) return;

        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;

        const candleWidth = Math.max((area.w / catCount) * 0.7, 4);
        const wickWidth = 1;

        for (let i = 0; i < catCount; i++) {
            const row = data.data[i];
            if (!row || row.length < 4) continue;

            const open = Number(row[0]) || 0;
            const close = Number(row[1]) || 0;
            const low = Number(row[2]) || 0;
            const high = Number(row[3]) || 0;

            const isUp = close >= open;
            const cx = area.x + (i + 0.5) * (area.w / catCount);

            const openY = area.y + area.h - ((open - yMin) / yRange) * area.h;
            const closeY = area.y + area.h - ((close - yMin) / yRange) * area.h;
            const lowY = area.y + area.h - ((low - yMin) / yRange) * area.h;
            const highY = area.y + area.h - ((high - yMin) / yRange) * area.h;

            const bodyTop = Math.min(openY, closeY);
            const bodyH = Math.abs(closeY - openY) || 1;

            const pixelRatio = this.getPixelRatio(ctx, area);
            ctx.strokeStyle = isUp ? "#00aa44" : "#ff4444";
            ctx.fillStyle = isUp ? "#00aa44" : "#ff4444";

            ctx.lineWidth = wickWidth * pixelRatio;
            ctx.beginPath();
            ctx.moveTo(cx, highY);
            ctx.lineTo(cx, lowY);
            ctx.stroke();

            if (bodyH > 1) {
                ctx.fillRect(cx - candleWidth / 2, bodyTop, candleWidth, bodyH);
                ctx.lineWidth = 1 * pixelRatio;
                ctx.strokeRect(cx - candleWidth / 2, bodyTop, candleWidth, bodyH);
            } else {
                ctx.beginPath();
                ctx.moveTo(cx - candleWidth / 2, bodyTop);
                ctx.lineTo(cx + candleWidth / 2, bodyTop);
                ctx.stroke();
            }
        }
    }

    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: YScale | null): HitInfo | null {
        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;

        const candleWidth = Math.max((area.w / catCount) * 0.7, 4);
        const hitPaddingX = candleWidth / 2 + 8;
        const hitPaddingY = 15;

        for (let i = 0; i < catCount; i++) {
            const row = data.data[i];
            if (!row || row.length < 4) continue;

            const open = Number(row[0]) || 0;
            const close = Number(row[1]) || 0;
            const low = Number(row[2]) || 0;
            const high = Number(row[3]) || 0;

            const cx = area.x + (i + 0.5) * (area.w / catCount);

            const highY = area.y + area.h - ((high - yMin) / yRange) * area.h;
            const lowY = area.y + area.h - ((low - yMin) / yRange) * area.h;

            if (px >= cx - hitPaddingX && px <= cx + hitPaddingX && py >= highY - hitPaddingY && py <= lowY + hitPaddingY) {
                const isUp = close >= open;
                const change = close - open;
                const changePercent = open !== 0 ? ((change / open) * 100).toFixed(2) : "0.00";

                return {
                    category: String(data.headers?.[i] || `K${i + 1}`),
                    seriesName: "OHLC",
                    value: `O:${open} H:${high} L:${low} C:${close}`,
                    detail: {
                        type: "K线",
                        open,
                        high,
                        low,
                        close,
                        change: change.toFixed(2),
                        changePercent: `${changePercent}%`,
                        direction: isUp ? "上涨 📈" : "下跌 📉",
                    },
                    pointX: cx,
                    pointY: (highY + lowY) / 2,
                };
            }
        }

        return null;
    }

    formatDetail(detail: Record<string, unknown>): string[] {
        return [
            `📊 ${detail.direction || ""}`,
            `─────────`,
            `开盘: ${detail.open ?? "N/A"}`,
            `最高: ${detail.high ?? "N/A"}`,
            `最低: ${detail.low ?? "N/A"}`,
            `收盘: ${detail.close ?? "N/A"}`,
            `─────────`,
            `涨跌: ${detail.change ?? "N/A"} (${detail.changePercent ?? "N/A"})`,
        ];
    }
}
