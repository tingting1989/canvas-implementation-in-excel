import type { ChartData, PlotArea, YScale, ChartStyle, HitInfo } from "./types";

const HIT_RADIUS = 12;
export { HIT_RADIUS };

export class BaseChartStrategy {
    type: string;
    name: string;
    protected _pixelRatio?: number;

    constructor(type: string, name: string) {
        this.type = type;
        this.name = name;
    }

    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: YScale | null): void {}

    protected getPixelRatio(ctx: CanvasRenderingContext2D, area: PlotArea): number {
        if (this._pixelRatio && this._pixelRatio > 1) {
            return this._pixelRatio;
        }

        try {
            const logicalWidth = area.x + area.w + 56;
            const calculated = ctx.canvas.width / logicalWidth;

            if (calculated > 1.5) {
                return Math.round(calculated);
            }

            return 1;
        } catch {
            return 1;
        }
    }

    setPixelRatio(ratio: number): void {
        this._pixelRatio = ratio;
    }

    clearPixelRatio(): void {
        this._pixelRatio = undefined;
    }

    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: YScale | null): HitInfo | null {
        return null;
    }

    isAxisFree(): boolean {
        return false;
    }

    formatTooltip(hoverInfo: HitInfo): string[] {
        const lines = [String(hoverInfo.category)];
        let displayValue: string;

        if (typeof hoverInfo.value === "number" && !isNaN(hoverInfo.value)) {
            displayValue = Number.isInteger(hoverInfo.value) ? String(hoverInfo.value) : hoverInfo.value.toFixed(2);
        } else {
            displayValue = String(hoverInfo.value ?? "");
        }

        if (hoverInfo.detail) {
            lines.push(...this.formatDetail(hoverInfo.detail));
        } else if (hoverInfo.seriesName && hoverInfo.seriesName !== "undefined") {
            lines.push(`${hoverInfo.seriesName}: ${displayValue}`);
        } else {
            lines.push(displayValue);
        }

        return lines;
    }

    formatDetail(detail: Record<string, unknown>): string[] {
        return [String(detail.value ?? detail)];
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

    protected pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
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