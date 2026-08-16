/**
 * 迷你图渲染器（SparklineType）
 *
 * 将数值数组渲染为嵌入单元格的小型图表（折线图或柱状图），
 * 适合在有限空间内展示数据趋势，无需占用完整的图表区域。
 *
 * @module types/renderers/SparklineType
 * @see BaseColumnType 列类型基类，定义 name、editorType、format、parse 等接口
 * @see CHART_TYPE 图表类型枚举，定义 "line"、"bar" 等常量
 */

import { BaseColumnType } from "../BaseColumnType.js";
import { CONFIG } from "../../constants/config.js";
import { CHART_TYPE } from "../../constants/enums/ChartType.js";
import type { CellRenderContext } from "../CellRenderContext.js";

export class SparklineType extends BaseColumnType {
    get name(): string {
        return "sparkline";
    }

    get editorType(): string {
        return "text";
    }

    format(value: any): string {
        if (Array.isArray(value)) {
            return value.length > 0 ? `${value.length} 个数据点` : "";
        }
        return String(value ?? "");
    }

    render(context: CellRenderContext): void {
        const { ctx, x, y, width, height, value } = context;

        const data: number[] = Array.isArray(value) ? value : [];
        const chartType = this.options?.type || "line";
        const padding = CONFIG.SPARKLINE_PADDING;

        if (data.length === 0) return;

        const chartX = x + padding;
        const chartY = y + padding;
        const chartW = width - padding * 2;
        const chartH = height - padding * 2;

        const minVal = Math.min(...data);
        const maxVal = Math.max(...data);
        const range = maxVal - minVal || 1;

        if (chartType === CHART_TYPE.BAR) {
            this.#renderBarChart(ctx, data, chartX, chartY, chartW, chartH, minVal, range);
        } else {
            this.#renderLineChart(ctx, data, chartX, chartY, chartW, chartH, minVal, range);
        }
    }

    #renderLineChart(ctx: CanvasRenderingContext2D, data: number[], x: number, y: number, w: number, h: number, minVal: number, range: number): void {
        const lineColor = this.options?.lineColor || CONFIG.SPARKLINE_LINE_COLOR;
        const fillColor = this.options?.fillColor || CONFIG.SPARKLINE_FILL_COLOR;
        const showDots = this.options?.showDots ?? false;

        const stepX = w / (data.length - 1 || 1);

        ctx.beginPath();
        data.forEach((val, i) => {
            const px = x + i * stepX;
            const py = y + h - ((val - minVal) / range) * h;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });

        if (fillColor) {
            ctx.lineTo(x + (data.length - 1) * stepX, y + h);
            ctx.lineTo(x, y + h);
            ctx.closePath();
            ctx.fillStyle = fillColor;
            ctx.fill();

            ctx.beginPath();
            data.forEach((val, i) => {
                const px = x + i * stepX;
                const py = y + h - ((val - minVal) / range) * h;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
        }

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = this.options?.lineWidth || CONFIG.SPARKLINE_LINE_WIDTH;
        ctx.stroke();

        if (showDots && data.length <= 20) {
            data.forEach((val, i) => {
                const px = x + i * stepX;
                const py = y + h - ((val - minVal) / range) * h;
                ctx.beginPath();
                ctx.arc(px, py, CONFIG.SPARKLINE_DOT_RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = lineColor;
                ctx.fill();
            });
        }
    }

    #renderBarChart(ctx: CanvasRenderingContext2D, data: number[], x: number, y: number, w: number, h: number, minVal: number, range: number): void {
        const barColor = this.options?.barColor || CONFIG.SPARKLINE_BAR_COLOR;
        const barGap = CONFIG.SPARKLINE_BAR_GAP;
        const barW = (w - barGap * (data.length - 1)) / data.length;

        data.forEach((val, i) => {
            const barX = x + i * (barW + barGap);
            const barH = ((val - minVal) / range) * h;
            const barY = y + h - barH;

            ctx.fillStyle = barColor;
            ctx.fillRect(barX, barY, barW, barH);
        });
    }
}
