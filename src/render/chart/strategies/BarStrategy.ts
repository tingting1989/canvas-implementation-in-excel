/**
 * @fileoverview 柱状图渲染策略
 * @description 绘制分组柱状图，支持多系列并排显示，
 *              包含渲染和命中检测逻辑。
 * @module render/chart/strategies/BarStrategy
 */

import { BaseChartStrategy } from "../BaseChartStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, YScale, ChartStyle, HitInfo } from "../types";

/**
 * 柱状图渲染策略
 *
 * 绘制分组柱状图，每个分类下多个系列并排排列。
 * 柱体宽度占分组宽度的 70%，间距占 30%。
 * 支持 Y 轴刻度缩放和命中检测。
 *
 * @class BarStrategy
 * @extends BaseChartStrategy
 */
export class BarStrategy extends BaseChartStrategy {
    /**
     * 构造柱状图策略
     *
     * 传入类型标识 "bar" 和显示名称 "柱状图"。
     */
    constructor() {
        super("bar", "柱状图");
    }

    /**
     * 渲染柱状图
     *
     * 绘制流程：
     * 1. 计算系列数、分类数、像素比
     * 2. 将每个分类的宽度分为 70% 柱体 + 30% 间距
     * 3. 逐系列逐分类绘制填充矩形和边框
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param data - 图表数据，headers 为列标题，data 为数据行
     * @param area - 绘图区域矩形（已扣除坐标轴/图例/内边距）
     * @param style - 图表样式配置
     * @param yScale - Y 轴刻度信息（必须提供）
     */
    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: YScale | null): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Bar 开始渲染`, { dataLength: data.data?.length });

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const pixelRatio = this.getPixelRatio(ctx, area);
        // 每个分类占用的总宽度
        const groupWidth = area.w / catCount;
        // 柱体宽度：分组宽度的 70% 均分给各系列
        const barWidth = (groupWidth * 0.7) / seriesCount;
        // 系列间距：分组宽度的 30% 均分给 seriesCount+1 个间隔
        const barGap = (groupWidth * 0.3) / (seriesCount + 1);
        const yMin = yScale!.min;
        const yMax = yScale!.max;
        const yRange = yMax - yMin || 1;

        ctx.strokeStyle = CONFIG.CHART_BAR_BORDER_COLOR;
        ctx.lineWidth = CONFIG.CHART_GRID_LINE_WIDTH * pixelRatio;

        for (let s = 0; s < seriesCount; s++) {
            ctx.fillStyle = style.colors![s % style.colors!.length];

            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                // 柱体高度：值在 Y 轴范围内的比例 × 绘图区高度
                const barH = ((val - yMin) / yRange) * area.h;
                // 柱体左上角坐标
                const x = area.x + i * groupWidth + barGap + s * (barWidth + barGap);
                const y = area.y + area.h - barH;

                ctx.fillRect(x, y, barWidth, barH);
                ctx.strokeRect(x, y, barWidth, barH);
            }
        }
    }

    /**
     * 柱状图命中检测
     *
     * 遍历所有柱体矩形，判断点击坐标是否落在某个柱体内。
     * 返回第一个命中的柱体信息。
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
        const groupWidth = area.w / catCount;
        const barWidth = (groupWidth * 0.7) / seriesCount;
        const barGap = (groupWidth * 0.3) / (seriesCount + 1);
        const yMin = yScale!.min;
        const yMax = yScale!.max;
        const yRange = yMax - yMin || 1;

        for (let s = 0; s < seriesCount; s++) {
            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const barH = ((val - yMin) / yRange) * area.h;
                const bx = area.x + i * groupWidth + barGap + s * (barWidth + barGap);
                const by = area.y + area.h - barH;

                // 矩形包含检测
                if (px >= bx && px <= bx + barWidth && py >= by && py <= by + barH) {
                    return {
                        category: String(data.data[i][0]),
                        seriesName: String(data.headers[s + 1] || ""),
                        value: val,
                        pointX: bx + barWidth / 2,
                        pointY: by,
                    };
                }
            }
        }
        return null;
    }
}
