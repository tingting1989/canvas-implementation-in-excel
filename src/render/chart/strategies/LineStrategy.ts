/**
 * @fileoverview 折线图渲染策略
 * @description 绘制折线图，支持平滑曲线、数据点圆点、
 *              命中检测（点优先 + 线段吸附）和 Y 轴范围自动计算。
 * @module render/chart/strategies/LineStrategy
 */

import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, YScale, ChartStyle, HitInfo } from "../types";

/**
 * 折线图渲染策略
 *
 * 绘制多系列折线图，每个系列用不同颜色绘制。
 * 支持平滑曲线模式（style.smooth，基于 Catmull-Rom 张力 0.3 的贝塞尔曲线）。
 * 命中检测优先匹配数据点圆点，其次吸附到线段附近。
 *
 * 注意：AreaStrategy 继承此类以复用平滑曲线和 Y 轴计算逻辑。
 *
 * @class LineStrategy
 * @extends BaseChartStrategy
 */
export class LineStrategy extends BaseChartStrategy {
    /**
     * 构造折线图策略
     *
     * @param type - 图表类型标识，默认 "line"（子类可覆盖，如 AreaStrategy 传 "area"）
     * @param name - 图表显示名称，默认 "折线图"
     */
    constructor(type: string = "line", name: string = "折线图") {
        super(type, name);
    }

    /**
     * 渲染折线图
     *
     * 绘制流程：
     * 1. 计算系列数、分类数、Y 轴范围、步进宽度
     * 2. 逐系列：计算数据点坐标 → 绘制折线/平滑曲线 → 绘制数据点圆点
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param data - 图表数据，headers 为列标题，data 为数据行
     * @param area - 绘图区域矩形（已扣除坐标轴/图例/内边距）
     * @param style - 图表样式配置
     * @param yScale - Y 轴刻度信息，为 null 时自动从数据中计算
     */
    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: YScale | null): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Line 开始渲染`);

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        // 计算 Y 轴范围：优先使用外部传入的 yScale，否则从数据中推算
        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;
        const stepX = area.w / catCount;
        const pixelRatio = this.getPixelRatio(ctx, area);

        for (let s = 0; s < seriesCount; s++) {
            ctx.strokeStyle = style.colors![s % style.colors!.length];
            ctx.fillStyle = style.colors![s % style.colors!.length];
            ctx.lineWidth = (CONFIG.CHART_LINE_DOT_RADIUS > 3 ? 2 : CONFIG.CHART_TOOLTIP_BORDER_WIDTH) * pixelRatio;

            const points: { x: number; y: number }[] = [];

            // 计算每个分类对应的数据点坐标
            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const x = area.x + stepX * i + stepX / 2;
                const y = area.y + area.h - ((val - yMin) / yRange) * area.h;
                points.push({ x, y });
            }

            // ---- 绘制折线/平滑曲线 ----
            ctx.beginPath();

            if (style.smooth && points.length > 2) {
                this.drawSmoothCurve(ctx, points);
            } else {
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
            }

            ctx.stroke();

            // ---- 绘制数据点圆点 ----
            for (const pt of points) {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, CONFIG.CHART_LINE_DOT_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /**
     * @protected 受保护方法 - 绘制平滑曲线
     *
     * 使用 Catmull-Rom 样条转贝塞尔曲线算法，张力系数为 0.3。
     * 对每个线段，取前后相邻点作为控制点参考，生成平滑的贝塞尔曲线。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param points - 数据点坐标数组
     */
    protected drawSmoothCurve(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]): void {
        const tension = 0.3;
        const n = points.length;

        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 0; i < n - 1; i++) {
            // 取前后相邻点用于计算控制点方向
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(n - 1, i + 2)];

            // 根据张力系数计算两个贝塞尔控制点
            const cp1x = p1.x + (p2.x - p0.x) * tension;
            const cp1y = p1.y + (p2.y - p0.y) * tension;
            const cp2x = p2.x - (p3.x - p1.x) * tension;
            const cp2y = p2.y - (p3.y - p1.y) * tension;

            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
    }

    /**
     * 折线图命中检测
     *
     * 检测策略（优先级从高到低）：
     * 1. 数据点圆点命中：距离 ≤ dotR 时直接返回
     * 2. 线段吸附：点到线段距离 ≤ lineSnapDist 时，取最近端点返回
     * 找到第一个命中即停止搜索。
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
        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;
        const stepX = area.w / catCount;
        // 命中半径：取配置值和 HIT_RADIUS 中较大的
        const dotR = Math.max(CONFIG.CHART_LINE_DOT_RADIUS || 4, HIT_RADIUS);
        // 线段吸附距离
        const lineSnapDist = 10;

        let closestHit: HitInfo | null = null;
        let minDistSq = dotR * dotR;

        for (let s = 0; s < seriesCount; s++) {
            const points: { x: number; y: number; val: number; idx: number }[] = [];

            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const dx = area.x + stepX * i + stepX / 2;
                const dy = area.y + area.h - ((val - yMin) / yRange) * area.h;
                points.push({ x: dx, y: dy, val, idx: i });

                // ---- 优先级 1：数据点圆点命中 ----
                const distSq = (px - dx) * (px - dx) + (py - dy) * (py - dy);

                if (distSq <= dotR * dotR && distSq < minDistSq) {
                    minDistSq = distSq;
                    closestHit = {
                        category: String(data.data[i][0]),
                        seriesName: String(data.headers[s + 1] || ""),
                        value: val,
                        pointX: dx,
                        pointY: dy,
                    };
                }
            }

            // ---- 优先级 2：线段吸附（仅在未命中数据点时）----
            if (!closestHit && points.length > 1) {
                for (let i = 0; i < points.length - 1; i++) {
                    const p1 = points[i];
                    const p2 = points[i + 1];

                    const dist = this.pointToSegmentDistance(px, py, p1.x, p1.y, p2.x, p2.y);

                    if (dist <= lineSnapDist) {
                        // 取距离较近的端点
                        const distToP1 = Math.sqrt((px - p1.x) ** 2 + (py - p1.y) ** 2);
                        const distToP2 = Math.sqrt((px - p2.x) ** 2 + (py - p2.y) ** 2);
                        const nearestPoint = distToP1 <= distToP2 ? p1 : p2;

                        closestHit = {
                            category: String(data.data[nearestPoint.idx][0]),
                            seriesName: String(data.headers[s + 1] || ""),
                            value: nearestPoint.val,
                            pointX: nearestPoint.x,
                            pointY: nearestPoint.y,
                        };

                        break;
                    }
                }
            }

            // 找到命中即停止搜索后续系列
            if (closestHit) break;
        }

        return closestHit;
    }

    /**
     * @protected 受保护方法 - 获取数据中所有系列的最小值
     *
     * 遍历所有数据行，跳过首列（分类标签），返回数值列中的最小值。
     *
     * @param data - 图表数据
     * @returns 数值列最小值，无有效数据时返回 0
     */
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

    /**
     * @protected 受保护方法 - 获取数据中所有系列的最大值
     *
     * 遍历所有数据行，跳过首列（分类标签），返回数值列中的最大值。
     *
     * @param data - 图表数据
     * @returns 数值列最大值，无有效数据时返回 1
     */
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
}
