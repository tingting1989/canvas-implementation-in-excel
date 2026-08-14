import { BaseChartStrategy } from "../BaseChartStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, ChartStyle, HitInfo, RgbColor } from "../types";

export class HeatmapStrategy extends BaseChartStrategy {
    static #defaultColors: string[] = [
        "#313695",
        "#4575b4",
        "#74add1",
        "#abd9e9",
        "#e0f3f8",
        "#ffffbf",
        "#fee090",
        "#fdae61",
        "#f46d43",
        "#d73027",
        "#a50026",
    ];

    constructor() {
        super("heatmap", "热力图");
    }

    static #interpolateColor(value: number, colors: string[]): string {
        const idx = value * (colors.length - 1);
        const i = Math.floor(idx);
        const t = idx - i;

        if (i >= colors.length - 1) {
            return colors[colors.length - 1];
        }

        const c1 = HeatmapStrategy.#hexToRgb(colors[i]);
        const c2 = HeatmapStrategy.#hexToRgb(colors[i + 1]);

        const r = Math.round(c1.r * (1 - t) + c2.r * t);
        const g = Math.round(c1.g * (1 - t) + c2.g * t);
        const b = Math.round(c1.b * (1 - t) + c2.b * t);

        return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    }

    static #hexToRgb(hex: string): RgbColor {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? {
                  r: parseInt(result[1], 16),
                  g: parseInt(result[2], 16),
                  b: parseInt(result[3], 16),
              }
            : { r: 0, g: 0, b: 0 };
    }

    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: unknown): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Heatmap 开始渲染`);

        if (!data.data || data.data.length < 2) {
            errorHandler.warn(ERROR_CODE.CHART_DATA_EMPTY, `Heatmap 数据不足（至少需要2行2列）`);
            return;
        }

        const rowCount = data.data.length;
        const colCount = data.headers.length - 1;
        if (colCount < 2) {
            errorHandler.warn(ERROR_CODE.CHART_DATA_EMPTY, `Heatmap 列数不足（至少需要2列数据）`);
            return;
        }

        const values = data.data.map((row) => row.slice(1).map((v) => Number(v) || 0));
        const flatValues = values.flat();
        const minVal = Math.min(...flatValues);
        const maxVal = Math.max(...flatValues);
        const range = maxVal - minVal || 1;

        const colors = style?.colors || HeatmapStrategy.#defaultColors;
        const padding = style?.cellPadding ?? 2;
        const showValue = style?.showValue !== false;

        const totalPaddingX = padding * (colCount + 1);
        const totalPaddingY = padding * (rowCount + 1);
        const cellWidth = (area.w - totalPaddingX) / colCount;
        const cellHeight = (area.h - totalPaddingY) / rowCount;

        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.8)";

        for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col < colCount; col++) {
                const value = values[row][col];
                const ratio = (value - minVal) / range;
                const color = HeatmapStrategy.#interpolateColor(ratio, colors);

                const x = area.x + padding + col * (cellWidth + padding);
                const y = area.y + padding + row * (cellHeight + padding);

                ctx.fillStyle = color;
                ctx.fillRect(x, y, cellWidth, cellHeight);
                ctx.strokeRect(x, y, cellWidth, cellHeight);

                if (showValue && cellWidth > 20 && cellHeight > 20) {
                    const brightness = this.getColorBrightness(color);
                    ctx.fillStyle = brightness > 128 ? "#333" : "#fff";
                    const fontSize = Math.min(12, cellHeight * 0.4, cellWidth * 0.3);
                    ctx.font = `${fontSize}px ${CONFIG.CHART_FONT_FAMILY}`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";

                    const displayVal = Number.isInteger(value) ? String(value) : value.toFixed(1);
                    ctx.fillText(displayVal, x + cellWidth / 2, y + cellHeight / 2);
                }
            }
        }

        errorHandler.debug(ERROR_CODE.CHART_STRATEGY_DEBUG, `Heatmap 渲染完成`, {
            rowCount,
            colCount,
            minVal,
            maxVal,
            range,
        });
    }

    private getColorBrightness(hex: string): number {
        const rgb = HeatmapStrategy.#hexToRgb(hex);
        return Math.round(0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
    }

    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: unknown): HitInfo | null {
        if (!data.data || data.data.length < 2) return null;

        const rowCount = data.data.length;
        const colCount = data.headers.length - 1;
        if (colCount < 2) return null;

        const padding = 2;
        const totalPaddingX = padding * (colCount + 1);
        const totalPaddingY = padding * (rowCount + 1);
        const cellWidth = (area.w - totalPaddingX) / colCount;
        const cellHeight = (area.h - totalPaddingY) / rowCount;

        const relX = px - area.x - padding;
        const relY = py - area.y - padding;

        if (relX < 0 || relY < 0) return null;

        const col = Math.floor(relX / (cellWidth + padding));
        const row = Math.floor(relY / (cellHeight + padding));

        if (col < 0 || col >= colCount || row < 0 || row >= rowCount) return null;

        const cellX = area.x + padding + col * (cellWidth + padding);
        const cellY = area.y + padding + row * (cellHeight + padding);

        if (px >= cellX && px <= cellX + cellWidth && py >= cellY && py <= cellY + cellHeight) {
            const value = Number(data.data[row][col + 1]) || 0;
            const rowLabel = String(data.data[row][0] || `Row${row}`);
            const colLabel = String(data.headers[col + 1] || `Col${col}`);

            const allValues = data.data.flatMap((r) => r.slice(1).map((v) => Number(v) || 0));
            const minVal = Math.min(...allValues);
            const maxVal = Math.max(...allValues);
            const percentage = maxVal !== minVal ? (((value - minVal) / (maxVal - minVal)) * 100).toFixed(1) : "50.0";

            return {
                category: rowLabel,
                seriesName: colLabel,
                value: value,
                pointX: cellX + cellWidth / 2,
                pointY: cellY + cellHeight / 2,
                detail: {
                    type: "热力图",
                    row: rowLabel,
                    col: colLabel,
                    value: value,
                    min: minVal,
                    max: maxVal,
                    percentage: `${percentage}%`,
                },
            };
        }

        return null;
    }

    formatDetail(detail: Record<string, unknown>): string[] {
        return [
            `📊 ${detail.type || ""}`,
            `─────────`,
            `行: ${detail.row}`,
            `列: ${detail.col}`,
            `数值: ${detail.value ?? "N/A"}`,
            `范围: ${detail.min ?? "N/A"} - ${detail.max ?? "N/A"}`,
            `排名: ${detail.percentage ?? "N/A"}`,
        ];
    }
}
