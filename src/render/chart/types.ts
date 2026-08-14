import type { Rect } from "../../model/types";

/** 绘图区域矩形（逻辑像素，已扣除坐标轴/图例/内边距） */
export type PlotArea = Rect;

/** 图表数据对象 */
export interface ChartData {
    headers: string[];
    data: (string | number)[][];
}

/** Y 轴刻度信息 */
export interface YScale {
    min: number;
    max: number;
    ticks: number[];
}

/** 图表样式配置 */
export interface ChartStyle {
    title?: string;
    showLegend?: boolean;
    showGrid?: boolean;
    showTooltip?: boolean;
    colors?: string[];
    ignoreHiddenData?: boolean;
    fill?: boolean;
    smooth?: boolean;
    xAxisLabel?: string;
    yAxisLabel?: string;
    min?: number;
    max?: number;
    indicators?: IndicatorConfig[];
    showValue?: boolean;
    cellPadding?: number;
}

/** 雷达图指标配置 */
export interface IndicatorConfig {
    max?: number;
}

/** 命中测试返回信息 */
export interface HitInfo {
    category: string;
    seriesName: string;
    value: number | string;
    pointX: number;
    pointY: number;
    chartType?: string;
    detail?: Record<string, unknown>;
}

/** 图表数据提取结果 */
export interface ExtractResult {
    headers: unknown[];
    data: unknown[][];
    source: "sync" | "async-chunked" | "worker" | "none";
}

/** 缓存条目 */
export interface CacheEntry {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
}

/** 雷达图渲染缓存数据 */
export interface RadarRenderData {
    indicators: string[];
    values: number[][];
    maxValues: number[];
    cx: number;
    cy: number;
    radius: number;
    angleStep: number;
    seriesCount: number;
}

/** RGB 颜色对象 */
export interface RgbColor {
    r: number;
    g: number;
    b: number;
}