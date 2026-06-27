/**
 * 迷你图（Sparkline）渲染器
 *
 * 将数组数据渲染为小型折线图或柱状图，适合在单元格内展示趋势。
 *
 * @module types/renderers/SparklineType
 */

import { BaseColumnType } from '../BaseColumnType.js';

export class SparklineType extends BaseColumnType {
    get name() { return 'sparkline'; }

    get editorType() { return 'text'; }

    format(value) {
        if (Array.isArray(value)) {
            return value.length > 0 ? `${value.length} 个数据点` : '';
        }
        return String(value ?? '');
    }

    /**
     * 自定义渲染方法
     * @param {import('../CellRenderContext.js').CellRenderContext} context
     */
    render(context) {
        const { ctx, x, y, width, height, value } = context;

        const data = Array.isArray(value) ? value : [];
        const chartType = this.options?.type || 'line';
        const padding = 4;

        if (data.length === 0) return;

        const chartX = x + padding;
        const chartY = y + padding;
        const chartW = width - padding * 2;
        const chartH = height - padding * 2;

        // 计算数据范围
        const minVal = Math.min(...data);
        const maxVal = Math.max(...data);
        const range = maxVal - minVal || 1;

        if (chartType === 'bar') {
            this.#renderBarChart(ctx, data, chartX, chartY, chartW, chartH, minVal, range);
        } else {
            this.#renderLineChart(ctx, data, chartX, chartY, chartW, chartH, minVal, range);
        }
    }

    /**
     * 渲染折线图
     */
    #renderLineChart(ctx, data, x, y, w, h, minVal, range) {
        const lineColor = this.options?.lineColor || '#2196f3';
        const fillColor = this.options?.fillColor || 'rgba(33,150,243,0.2)';
        const showDots = this.options?.showDots ?? false;

        const stepX = w / (data.length - 1 || 1);

        ctx.beginPath();
        data.forEach((val, i) => {
            const px = x + i * stepX;
            const py = y + h - ((val - minVal) / range) * h;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });

        // 填充区域
        if (fillColor) {
            ctx.lineTo(x + (data.length - 1) * stepX, y + h);
            ctx.lineTo(x, y + h);
            ctx.closePath();
            ctx.fillStyle = fillColor;
            ctx.fill();

            // 重绘线条
            ctx.beginPath();
            data.forEach((val, i) => {
                const px = x + i * stepX;
                const py = y + h - ((val - minVal) / range) * h;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
        }

        // 绘制线条
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = this.options?.lineWidth || 1.5;
        ctx.stroke();

        // 数据点
        if (showDots && data.length <= 20) {
            data.forEach((val, i) => {
                const px = x + i * stepX;
                const py = y + h - ((val - minVal) / range) * h;
                ctx.beginPath();
                ctx.arc(px, py, 2, 0, Math.PI * 2);
                ctx.fillStyle = lineColor;
                ctx.fill();
            });
        }
    }

    /**
     * 渲染柱状图
     */
    #renderBarChart(ctx, data, x, y, w, h, minVal, range) {
        const barColor = this.options?.barColor || '#4caf50';
        const barGap = 1;
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