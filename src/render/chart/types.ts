/**
 * @fileoverview 图表模块公共类型定义
 * @description 集中定义图表渲染管线中所有共享的数据结构、接口和类型别名，
 *              供 NativeChartRenderer、各策略类、缓存管理器及数据提取器统一引用。
 * @module render/chart/types
 */

import type { Rect } from "../../model/types";

/** 绘图区域矩形（逻辑像素，已扣除坐标轴/图例/内边距） */
export type PlotArea = Rect;

/** 图表数据对象，headers 为列标题行，data 为数据行（首列为分类标签） */
export interface ChartData {
    headers: string[];
    data: (string | number)[][];
}

/** Y 轴刻度信息，包含最小值、最大值和所有刻度值 */
export interface YScale {
    min: number;
    max: number;
    ticks: number[];
}

/** 图表样式配置 */
export interface ChartStyle {
    /** 图表标题文本 */
    title?: string;
    /** 是否显示图例，默认 true */
    showLegend?: boolean;
    /** 是否显示网格线，默认 true */
    showGrid?: boolean;
    /** 是否显示 Tooltip，默认 true */
    showTooltip?: boolean;
    /** 系列颜色列表 */
    colors?: string[];
    /** 是否忽略隐藏行/列的数据 */
    ignoreHiddenData?: boolean;
    /** 是否填充区域（面积图等） */
    fill?: boolean;
    /** 是否使用平滑曲线（折线图/面积图） */
    smooth?: boolean;
    /** X 轴标签文本 */
    xAxisLabel?: string;
    /** Y 轴标签文本 */
    yAxisLabel?: string;
    /** 自定义最小值（仪表盘等） */
    min?: number;
    /** 自定义最大值（仪表盘等） */
    max?: number;
    /** 雷达图各维度指标配置 */
    indicators?: IndicatorConfig[];
    /** 是否在单元格内显示数值（热力图等） */
    showValue?: boolean;
    /** 单元格内边距（热力图等） */
    cellPadding?: number;
}

/** 雷达图指标配置，可指定各维度的最大值 */
export interface IndicatorConfig {
    max?: number;
}

/** 命中测试返回信息，描述用户点击/悬停位置对应的图表元素 */
export interface HitInfo {
    /** 分类标签（X 轴类别名） */
    category: string;
    /** 系列名称 */
    seriesName: string;
    /** 数据值 */
    value: number | string;
    /** 命中点在 Canvas 上的 X 坐标 */
    pointX: number;
    /** 命中点在 Canvas 上的 Y 坐标 */
    pointY: number;
    /** 图表类型标识，用于 Tooltip 格式化时查找对应策略 */
    chartType?: string;
    /** 详细信息（K线、仪表盘、热力图等复杂数据） */
    detail?: Record<string, unknown>;
}

/** 图表数据提取结果，source 标识提取方式 */
export interface ExtractResult {
    headers: unknown[];
    data: unknown[][];
    source: "sync" | "async-chunked" | "worker" | "none";
}

/** 缓存条目，持有离屏 Canvas 及其 2D 上下文 */
export interface CacheEntry {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
}

/** 雷达图渲染缓存数据，保存最近一次渲染的几何信息供 hitTest 使用 */
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

/** RGB 颜色对象，用于热力图颜色插值计算 */
export interface RgbColor {
    r: number;
    g: number;
    b: number;
}
