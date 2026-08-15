/**
 * @fileoverview 散点图渲染策略
 * @description 绘制散点图，以第一列为 X 值、其余列为 Y 值，
 *              支持命中检测（圆形范围判定）。
 * @module render/chart/strategies/ScatterStrategy
 */

import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, YScale, ChartStyle, HitInfo } from "../types";

/**
 * 散点图渲染策略
 *
 * 绘制散点图，以第一列数据作为 X 轴值，其余列作为各系列的 Y 轴值。
 * 自动计算 X/Y 轴范围，将数据点映射到绘图区域。
 * 命中检测使用圆形范围判定（距离 ≤ dotR）。
 *
 * @class ScatterStrategy
 * @extends BaseChartStrategy
 */
export class ScatterStrategy extends BaseChartStrategy {
    /**
     * 构造散点图策略
     *
     * 传入类型标识 "scatter" 和显示名称 "散点图"。
     */
    constructor() {
        super("scatter", "散点图");
    }

    /**
     * 渲染散点图
     *
     * 绘制流程：
     * 1. 提取所有 X 值和 Y 值，计算 X/Y 轴范围
     * 2. 逐系列逐数据点：将 (xVal, yVal) 映射到绘图区坐标
     * 3. 绘制圆形数据点
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param data - 图表数据，第一列为 X 值，其余列为各系列 Y 值
     * @param area - 绘图区域矩形
     * @param style - 图表样式配置
     * @param yScale - Y 轴刻度信息，为 null 时自动从数据中计算
     */
    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: YScale | null): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Scatter 开始渲染`);

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        // 提取所有 X 值和 Y 值，计算轴范围
        const allX = data.data.map((row) => Number(row[0]) || 0);
        const allY = data.data.flatMap((row) => row.slice(1).map((v) => Number(v) || 0));
        const xMin = Math.min(...allX);
        const xMax = Math.max(...allX);
        const yMin = yScale ? yScale.min : Math.min(...allY);
        const yMax = yScale ? yScale.max : Math.max(...allY);
        const xRange = xMax - xMin || 1;
        const yRange = yMax - yMin || 1;

        for (let s = 0; s < seriesCount; s++) {
            ctx.fillStyle = style.colors![s % style.colors!.length];

            for (let i = 0; i < catCount; i++) {
                const xVal = Number(data.data[i][0]) || 0;
                const yVal = Number(data.data[i][s + 1]) || 0;
                // 将数据值映射到绘图区坐标
                const x = area.x + ((xVal - xMin) / xRange) * area.w;
                const y = area.y + area.h - ((yVal - yMin) / yRange) * area.h;

                ctx.beginPath();
                ctx.arc(x, y, CONFIG.CHART_SCATTER_DOT_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /**
     * 散点图命中检测
     *
     * 遍历所有数据点，判断点击位置到数据点中心的距离是否 ≤ dotR。
     * 返回第一个命中的数据点信息。
     *
     * @param px - 点击位置的 X 坐标（Canvas 像素）
     * @param py - 点击位置的 Y 坐标（Canvas 像素）
     * @param data - 图表数据
     * @param area - 绘图区域矩形
     * @param seriesCount - 系列数量
     * @param catCount - 分类数量
     * @param yScale - Y 轴刻度信息
     * @returns 命中信息对象，未命中返回 null
     */
    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: YScale | null): HitInfo | null {
        const allX = data.data.map((row) => Number(row[0]) || 0);
        const allY = data.data.flatMap((row) => row.slice(1).map((v) => Number(v) || 0));
        const xMin = Math.min(...allX);
        const xMax = Math.max(...allX);
        const yMin = yScale ? yScale.min : Math.min(...allY);
        const yMax = yScale ? yScale.max : Math.max(...allY);
        const xRange = xMax - xMin || 1;
        const yRange = yMax - yMin || 1;
        // 命中半径：取配置值和 HIT_RADIUS 中较大的
        const dotR = Math.max(CONFIG.CHART_SCATTER_DOT_RADIUS, HIT_RADIUS);

        for (let s = 0; s < seriesCount; s++) {
            for (let i = 0; i < catCount; i++) {
                const xVal = Number(data.data[i][0]) || 0;
                const yVal = Number(data.data[i][s + 1]) || 0;
                const dx = area.x + ((xVal - xMin) / xRange) * area.w;
                const dy = area.y + area.h - ((yVal - yMin) / yRange) * area.h;

                // 圆形范围判定：距离² ≤ 半径²
                if ((px - dx) * (px - dx) + (py - dy) * (py - dy) <= dotR * dotR) {
                    return {
                        category: String(xVal),
                        seriesName: String(data.headers[s + 1] || ""),
                        value: yVal,
                        pointX: dx,
                        pointY: dy,
                    };
                }
            }
        }
        return null;
    }
}
