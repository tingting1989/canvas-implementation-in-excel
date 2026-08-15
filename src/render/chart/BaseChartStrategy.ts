/**
 * @fileoverview 图表渲染策略基类
 * @description 所有图表类型（柱状图、折线图、饼图等）的渲染策略均继承自此类。
 *              提供渲染、命中测试、Tooltip 格式化等核心方法的默认实现，
 *              子类按需覆写以实现特定图表类型的绘制逻辑。
 * @module render/chart/BaseChartStrategy
 */

import type { ChartData, PlotArea, YScale, ChartStyle, HitInfo } from "./types";

/** 默认命中检测半径（像素），用于折线图/散点图等点状元素的点击判定 */
const HIT_RADIUS = 12;
export { HIT_RADIUS };

export class BaseChartStrategy {
    /** 图表类型标识，如 "bar"、"line"、"pie" */
    type: string;
    /** 图表显示名称，如 "柱状图"、"折线图" */
    name: string;
    /** 当前像素比，由 renderWithPixelRatio 设置，用于高清导出 */
    protected _pixelRatio?: number;

    constructor(type: string, name: string) {
        this.type = type;
        this.name = name;
    }

    /** 渲染图表，子类必须覆写 */
    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: YScale | null): void {}

    /**
     * 获取当前渲染的像素比
     * 优先使用外部设置的 pixelRatio（高清导出场景），
     * 否则根据 Canvas 物理宽度与逻辑宽度自动推算。
     */
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

    /** 设置像素比（由 NativeChartRenderer.renderWithPixelRatio 调用） */
    setPixelRatio(ratio: number): void {
        this._pixelRatio = ratio;
    }

    /** 清除像素比（渲染完成后恢复默认） */
    clearPixelRatio(): void {
        this._pixelRatio = undefined;
    }

    /** 命中测试：判断坐标 (px, py) 是否落在图表元素上，子类按需覆写 */
    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: YScale | null): HitInfo | null {
        return null;
    }

    /**
     * 是否为无坐标轴图表（饼图、仪表盘、漏斗图等）
     * 返回 true 时 NativeChartRenderer 将跳过网格线和坐标轴的绘制
     */
    isAxisFree(): boolean {
        return false;
    }

    /**
     * 格式化 Tooltip 文本行
     * 默认输出 [分类名, 系列名: 值] 格式，子类可覆写以自定义
     */
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

    /** 格式化详细信息的文本行，供 K线、仪表盘等复杂数据使用 */
    formatDetail(detail: Record<string, unknown>): string[] {
        return [String(detail.value ?? detail)];
    }

    /** 获取数据中所有系列的最小值（跳过首列分类标签） */
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

    /** 获取数据中所有系列的最大值（跳过首列分类标签） */
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

    /**
     * 计算点 (px, py) 到线段 (x1,y1)-(x2,y2) 的最短距离
     * 使用向量投影法，先求垂足参数 t，再钳位到 [0,1] 得到线段上最近点
     */
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