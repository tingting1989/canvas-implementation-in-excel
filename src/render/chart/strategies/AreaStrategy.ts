/**
 * @fileoverview 面积图渲染策略
 * @description 继承 LineStrategy，在折线图基础上增加半透明填充区域，
 *              支持平滑曲线模式。系列从后向前绘制以保证层叠顺序正确。
 * @module render/chart/strategies/AreaStrategy
 */

import { LineStrategy } from "./LineStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, YScale, ChartStyle } from "../types";

/**
 * 面积图渲染策略
 *
 * 在折线图基础上绘制半透明填充区域，形成面积图效果。
 * 系列从后向前（s = seriesCount-1 → 0）绘制，保证前面的系列覆盖在后面之上。
 * 支持平滑曲线（style.smooth）和直线两种模式。
 *
 * @class AreaStrategy
 * @extends LineStrategy
 */
export class AreaStrategy extends LineStrategy {
    /**
     * 构造面积图策略
     *
     * 调用父类 LineStrategy 构造器，传入类型标识 "area" 和显示名称 "面积图"。
     */
    constructor() {
        super("area", "面积图");
    }

    /**
     * 渲染面积图
     *
     * 绘制流程：
     * 1. 计算系列数、分类数、Y 轴范围、步进宽度
     * 2. 从最后一个系列向前绘制（保证层叠顺序）
     * 3. 每个系列：先绘制填充区域（从基线到数据点的闭合路径），再绘制边框线
     * 4. 若 style.smooth 为 true 且点数 > 2，使用贝塞尔曲线平滑
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param data - 图表数据，headers 为列标题，data 为数据行
     * @param area - 绘图区域矩形（已扣除坐标轴/图例/内边距）
     * @param style - 图表样式配置
     * @param yScale - Y 轴刻度信息，为 null 时自动从数据中计算
     */
    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: YScale | null): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Area 开始渲染`);

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        // 计算 Y 轴范围：优先使用外部传入的 yScale，否则从数据中推算
        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;
        const stepX = area.w / catCount;
        const pixelRatio = this.getPixelRatio(ctx, area);

        ctx.lineWidth = CONFIG.CHART_AREA_LINE_WIDTH * pixelRatio;

        // 从后向前绘制系列，保证前面的系列视觉上覆盖后面的
        for (let s = seriesCount - 1; s >= 0; s--) {
            const color = style.colors![s % style.colors!.length];
            // 填充色：原色 + 40（25% 不透明度）
            ctx.fillStyle = color + "40";
            ctx.strokeStyle = color;

            // 基线 Y 坐标（绘图区域底部）
            const baseline = area.y + area.h;
            const points: { x: number; y: number }[] = [];

            // 计算每个分类对应的数据点坐标
            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const x = area.x + stepX * i + stepX / 2;
                const y = area.y + area.h - ((val - yMin) / yRange) * area.h;
                points.push({ x, y });
            }

            // ---- 绘制填充区域 ----
            ctx.beginPath();
            ctx.moveTo(points[0].x, baseline);

            if (style.smooth && points.length > 2) {
                // 平滑模式：先从基线连到第一个点，再绘制平滑曲线
                ctx.lineTo(points[0].x, points[0].y);
                this.drawSmoothCurve(ctx, points);
            } else {
                // 直线模式：依次连接所有数据点
                for (const pt of points) {
                    ctx.lineTo(pt.x, pt.y);
                }
            }

            // 从最后一个点回到基线，闭合路径形成填充区域
            ctx.lineTo(points[points.length - 1].x, baseline);
            ctx.closePath();
            ctx.fill();

            // ---- 绘制边框线 ----
            ctx.beginPath();
            if (style.smooth && points.length > 2) {
                ctx.moveTo(points[0].x, points[0].y);
                this.drawSmoothCurve(ctx, points);
            } else {
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
            }
            ctx.stroke();
        }
    }
}
