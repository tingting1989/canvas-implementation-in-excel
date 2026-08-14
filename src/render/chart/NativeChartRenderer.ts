import { BaseChartStrategy } from "./BaseChartStrategy";
import { getAllStrategies } from "./strategies/index";
import { CONFIG } from "../../constants/config";
import { errorHandler } from "../../core/ErrorHandler";
import { ERROR_CODE } from "../../constants/errorCodes";
import type { ChartData, PlotArea, ChartStyle, YScale, HitInfo } from "./types";
import type { Rect } from "../../model/types";

export class NativeChartRenderer {
    static #registry: Map<string, BaseChartStrategy> = new Map();

    static register(strategy: BaseChartStrategy): void {
        if (!(strategy instanceof BaseChartStrategy)) {
            errorHandler.error(ERROR_CODE.CHART_INVALID_STRATEGY, `Invalid strategy:`, strategy);
            return;
        }

        this.#registry.set(strategy.type, strategy);
        errorHandler.info(ERROR_CODE.CHART_STRATEGY_REGISTERED, `Registered chart strategy: ${strategy.type} (${strategy.name})`);
    }

    static get(type: string): BaseChartStrategy | undefined {
        return this.#registry.get(type);
    }

    static getTypes(): string[] {
        return Array.from(this.#registry.keys());
    }

    static getNames(): string[] {
        return Array.from(this.#registry.values()).map((s) => s.name);
    }

    static init(): void {
        const strategies = getAllStrategies();
        strategies.forEach((strategy) => this.register(strategy));
    }

    static setLogLevel(level: number): void {
        errorHandler.configure({ level });
    }

    static renderWithPixelRatio(ctx: CanvasRenderingContext2D, chart: { type: string }, data: ChartData, plotArea: PlotArea, style: ChartStyle, pixelRatio: number): void {
        ctx.save();

        let yScale: YScale | null = null;
        const strategy = this.get(chart.type);

        if (strategy) {
            strategy.setPixelRatio(pixelRatio);
        }

        try {
            if (strategy && !strategy.isAxisFree()) {
                if (style.showGrid !== false) {
                    this.renderGridWithPixelRatio(ctx, plotArea, pixelRatio);
                }

                yScale = this.buildYScale(data, chart.type);
                this.renderAxes(ctx, data, plotArea, yScale, style, pixelRatio);
            }

            if (strategy) {
                strategy.render(ctx, data, plotArea, style, yScale);
            } else {
                errorHandler.warn(ERROR_CODE.CHART_TYPE_NOT_FOUND, `No strategy found for chart type: ${chart.type}`);
            }

            if (style.title) {
                this.renderTitle(ctx, style.title, plotArea, pixelRatio);
            }

            if (style.showLegend !== false) {
                this.renderLegend(ctx, data, plotArea, style, pixelRatio);
            }
        } finally {
            if (strategy) {
                strategy.clearPixelRatio();
            }
        }

        ctx.restore();
    }

    static render(ctx: CanvasRenderingContext2D, chart: { type: string }, data: ChartData, plotArea: PlotArea, style: ChartStyle): void {
        ctx.save();

        const pixelRatio = ctx.canvas.width / (plotArea.x + plotArea.w + 56);

        let yScale: YScale | null = null;
        const strategy = this.get(chart.type);

        if (strategy && !strategy.isAxisFree()) {
            if (style.showGrid !== false) {
                this.renderGrid(ctx, plotArea);
            }

            yScale = this.buildYScale(data, chart.type);
            this.renderAxes(ctx, data, plotArea, yScale, style, pixelRatio);
        }

        if (strategy) {
            strategy.render(ctx, data, plotArea, style, yScale);
        } else {
            errorHandler.warn(ERROR_CODE.CHART_TYPE_NOT_FOUND, `No strategy found for chart type: ${chart.type}`);
        }

        if (style.title) {
            this.renderTitle(ctx, style.title, plotArea, pixelRatio);
        }

        if (style.showLegend !== false) {
            this.renderLegend(ctx, data, plotArea, style, pixelRatio);
        }

        ctx.restore();
    }

    static hitTest(px: number, py: number, chart: { type: string }, data: ChartData, plotArea: PlotArea, seriesCount: number, catCount: number, yScale?: YScale | null): HitInfo | null {
        const strategy = this.get(chart.type);
        if (strategy) {
            return strategy.hitTest(px, py, data, plotArea, seriesCount, catCount, yScale);
        }
        return null;
    }

    static hitTestDataPoint(px: number, py: number, chartType: string, data: ChartData, plotArea: PlotArea, yScale: YScale): HitInfo | null {
        const strategy = this.get(chartType);
        if (!strategy) return null;

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return null;

        return strategy.hitTest(px, py, data, plotArea, seriesCount, catCount, yScale);
    }

    static renderTooltip(ctx: CanvasRenderingContext2D, hoverInfo: HitInfo, bounds: Rect, style: ChartStyle): void {
        if (!hoverInfo || !bounds) return;

        const { category, seriesName, value, pointX, pointY } = hoverInfo;
        const padding = { x: 8, y: 6 };
        const lineHeight = 16;

        const strategy = this.get(hoverInfo.chartType || "");
        const lines = strategy ? strategy.formatTooltip(hoverInfo) : [String(category)];

        ctx.save();
        ctx.font = `${CONFIG.CHART_FONT_SIZE}px ${CONFIG.CHART_FONT_FAMILY}`;

        let maxW = 0;
        for (const line of lines) {
            const w = ctx.measureText(line).width;
            if (w > maxW) maxW = w;
        }

        const boxW = maxW + padding.x * 2;
        const boxH = lines.length * lineHeight + padding.y * 2;

        let tipX = pointX + 12;
        let tipY = pointY - boxH - 10;

        if (tipX + boxW > bounds.x + bounds.w) {
            tipX = pointX - boxW - 12;
        }
        if (tipY < bounds.y) {
            tipY = pointY + 14;
        }

        tipX = Math.max(bounds.x, Math.min(tipX, bounds.x + bounds.w - boxW));
        tipY = Math.max(bounds.y, Math.min(tipY, bounds.y + bounds.h - boxH));

        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.beginPath();
        ctx.roundRect(tipX, tipY, boxW, boxH, 4);
        ctx.fill();

        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], tipX + padding.x, tipY + padding.y + i * lineHeight);
        }

        ctx.restore();
    }

    static renderGrid(ctx: CanvasRenderingContext2D, area: PlotArea): void {
        const pixelRatio = ctx.canvas.width / (area.x + area.w + 56);

        this.renderGridWithPixelRatio(ctx, area, pixelRatio);
    }

    static renderGridWithPixelRatio(ctx: CanvasRenderingContext2D, area: PlotArea, pixelRatio: number): void {
        ctx.save();
        ctx.strokeStyle = CONFIG.CHART_GRID_COLOR;
        ctx.lineWidth = CONFIG.CHART_GRID_LINE_WIDTH * pixelRatio;

        const yTicks = 5;
        const stepY = area.h / yTicks;
        for (let i = 0; i <= yTicks; i++) {
            const y = area.y + stepY * i;
            ctx.beginPath();
            ctx.moveTo(area.x, y);
            ctx.lineTo(area.x + area.w, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    static renderAxes(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, yScale: YScale, style: ChartStyle, pixelRatio: number = 1): void {
        ctx.save();
        ctx.strokeStyle = CONFIG.CHART_AXIS_COLOR;
        ctx.lineWidth = CONFIG.CHART_AXIS_LINE_WIDTH * pixelRatio;

        ctx.beginPath();
        ctx.moveTo(area.x, area.y);
        ctx.lineTo(area.x, area.y + area.h);
        ctx.lineTo(area.x + area.w, area.y + area.h);
        ctx.stroke();

        const categories = data.data.map((row) => String(row[0]));
        ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
        ctx.font = `${CONFIG.CHART_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const step = area.w / categories.length;
        for (let i = 0; i < categories.length; i++) {
            ctx.fillText(String(categories[i]), area.x + step * i + step / 2, area.y + area.h + 6 * pixelRatio);
        }

        const yTicks = yScale.ticks;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";

        for (const val of yTicks) {
            const y = area.y + area.h - ((val - yScale.min) / (yScale.max - yScale.min)) * area.h;
            ctx.fillText(this.formatNumber(val), area.x - 6 * pixelRatio, y);
        }

        if (style?.xAxisLabel) {
            ctx.textAlign = "end";
            ctx.textBaseline = "top";
            ctx.fillText(style.xAxisLabel, area.x + area.w, area.y + area.h + 22 * pixelRatio);
        }

        if (style?.yAxisLabel) {
            ctx.save();
            ctx.textAlign = "left";
            ctx.textBaseline = "bottom";
            ctx.font = `${CONFIG.CHART_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
            ctx.fillText(style.yAxisLabel, area.x + 8 * pixelRatio, area.y - 6 * pixelRatio);
            ctx.restore();
        }

        ctx.restore();
    }

    static renderTitle(ctx: CanvasRenderingContext2D, title: string, area: PlotArea, pixelRatio: number = 1): void {
        ctx.save();
        ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
        ctx.font = `bold ${CONFIG.CHART_TITLE_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(title, area.x + area.w / 2, 10 * pixelRatio);
        ctx.restore();
    }

    static renderLegend(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, pixelRatio: number = 1): void {
        const seriesNames = data.headers.slice(1);
        ctx.save();
        ctx.font = `${CONFIG.CHART_LEGEND_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;

        const itemWidth = CONFIG.CHART_LEGEND_ITEM_WIDTH * pixelRatio;
        const totalWidth = seriesNames.length * itemWidth;
        let startX = area.x + (area.w - totalWidth) / 2;
        const y = area.y + area.h + CONFIG.CHART_LEGEND_OFFSET_Y * pixelRatio;

        for (let i = 0; i < seriesNames.length; i++) {
            ctx.fillStyle = style.colors![i % style.colors!.length];
            ctx.fillRect(startX, y - 5 * pixelRatio, CONFIG.CHART_LEGEND_ITEM_SIZE * pixelRatio, CONFIG.CHART_LEGEND_ITEM_SIZE * pixelRatio);

            ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(String(seriesNames[i]), startX + 16 * pixelRatio, y + 1);

            startX += itemWidth;
        }

        ctx.restore();
    }

    static getYMin(data: ChartData): number {
        let min = Infinity;
        for (const row of data.data) {
            for (let c = 1; c < row.length; c++) {
                const v = Number(row[c]);
                if (!isNaN(v) && v < min) min = v;
            }
        }
        return min === Infinity ? 0 : min;
    }

    static getYMax(data: ChartData): number {
        let max = -Infinity;
        for (const row of data.data) {
            for (let c = 1; c < row.length; c++) {
                const v = Number(row[c]);
                if (!isNaN(v) && v > max) max = v;
            }
        }
        return max === -Infinity ? 1 : max;
    }

    static buildYScale(data: ChartData, chartType: string): YScale {
        const dataMin = this.getYMin(data);

        let minValue: number;
        if (dataMin >= 0) {
            minValue = 0;
        } else if (chartType === "bar") {
            minValue = 0;
        } else {
            minValue = dataMin;
        }

        const ticks = this.calcYTicks(data, 5, minValue);
        return {
            min: ticks[0],
            max: ticks[ticks.length - 1],
            ticks,
        };
    }

    static calcYTicks(data: ChartData, count: number, minValue?: number): number[] {
        const yMin = minValue !== undefined ? minValue : this.getYMin(data);
        const yMax = this.getYMax(data);
        const range = yMax - yMin || 1;
        const rawStep = range / count;

        const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const normStep = rawStep / mag;

        let step: number;
        if (normStep <= 1.5) step = mag;
        else if (normStep <= 3) step = 2 * mag;
        else if (normStep <= 7) step = 5 * mag;
        else step = 10 * mag;

        const start = Math.floor(yMin / step) * step;
        const end = Math.ceil(yMax / step) * step;
        const ticks: number[] = [];
        for (let v = start; v <= end + step * 0.01; v += step) {
            ticks.push(Math.round(v * 1e10) / 1e10);
        }

        return ticks;
    }

    static formatNumber(val: number): string {
        if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + "M";
        if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(1) + "K";
        return String(val);
    }

    static pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx: number, yy: number;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;

        return Math.sqrt(dx * dx + dy * dy);
    }
}

NativeChartRenderer.init();