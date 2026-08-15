/**
 * @fileoverview 雷达图渲染策略
 * @description 绘制雷达图（蜘蛛图），包含多边形网格、轴线、
 *              多系列数据区域和命中检测，支持维度占比 Tooltip。
 * @module render/chart/strategies/RadarStrategy
 */

import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, ChartStyle, HitInfo, RadarRenderData } from "../types";

/**
 * 雷达图渲染策略
 *
 * 绘制雷达图（蜘蛛图），至少需要 3 个维度。
 * 包含：多边形网格线（5 层）→ 轴线 → 维度标签 → 多系列数据区域（半透明填充 + 描边 + 数据点）。
 * 使用 #lastRenderData 缓存渲染几何信息以供命中检测使用。
 * 属于无坐标轴图表（isAxisFree = true）。
 *
 * @class RadarStrategy
 * @extends BaseChartStrategy
 */
export class RadarStrategy extends BaseChartStrategy {
    /**
     * @private 私有字段 - 最近一次渲染的几何数据缓存
     *
     * 保存渲染时计算的维度、数值、中心坐标、半径、角度步进等信息，
     * 供 hitTest 使用，避免重复计算。
     */
    #lastRenderData: RadarRenderData | null = null;

    /**
     * 构造雷达图策略
     *
     * 传入类型标识 "radar" 和显示名称 "雷达图"。
     */
    constructor() {
        super("radar", "雷达图");
    }

    /**
     * 判断是否为无坐标轴图表
     *
     * 雷达图不依赖 X/Y 坐标轴，返回 true 以跳过网格线和坐标轴绘制。
     *
     * @returns 始终返回 true
     */
    isAxisFree(): boolean {
        return true;
    }

    /**
     * 渲染雷达图
     *
     * 绘制流程：
     * 1. 校验维度数 ≥ 3，提取维度标签和数值矩阵
     * 2. 计算各系列的最大值（用于归一化），优先使用 style.indicators 配置
     * 3. 绘制 5 层多边形网格线
     * 4. 绘制从中心到各维度的轴线
     * 5. 绘制维度标签
     * 6. 逐系列绘制数据区域（半透明填充 + 描边 + 数据点圆点）
     * 7. 缓存渲染数据供 hitTest 使用
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param data - 图表数据，首列为维度标签，其余列为各系列数值
     * @param area - 绘图区域矩形
     * @param style - 图表样式配置（indicators 可指定各维度最大值）
     */
    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Radar 开始渲染`);

        const dimCount = data.data.length;
        const seriesCount = data.headers.length - 1;
        // 雷达图至少需要 3 个维度
        if (dimCount < 3 || seriesCount <= 0) return;

        // 提取维度标签和数值矩阵
        const indicators = data.data.map((row) => String(row?.[0] || ""));
        const values = data.data.map((row) => row.slice(1).map((v) => Number(v) || 0));

        // 计算各系列的最大值，优先使用 style.indicators 配置
        const maxValues: number[] = [];
        for (let j = 0; j < seriesCount; j++) {
            const maxVal = Math.max(...values.map((row) => row[j]));
            maxValues[j] = (style?.indicators?.[j] as { max?: number } | undefined)?.max || (maxVal > 0 ? maxVal * 1.2 : 100);
        }

        const cx = area.x + area.w / 2;
        const cy = area.y + area.h / 2;
        const radius = Math.min(area.w, area.h) * 0.38;
        const angleStep = (Math.PI * 2) / dimCount;
        const levels = 5;

        const pixelRatio = this.getPixelRatio(ctx, area);

        // ---- 1. 绘制多边形网格线（5 层）----
        ctx.lineWidth = 1 * pixelRatio;
        ctx.strokeStyle = "#e0e0e0";
        for (let level = 1; level <= levels; level++) {
            const r = (radius * level) / levels;
            ctx.beginPath();
            for (let i = 0; i <= dimCount; i++) {
                const angle = -Math.PI / 2 + i * angleStep;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        }

        // ---- 2. 绘制轴线（中心到各维度）----
        for (let i = 0; i < dimCount; i++) {
            const angle = -Math.PI / 2 + i * angleStep;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
            ctx.stroke();
        }

        // ---- 3. 绘制维度标签 ----
        ctx.font = `${CONFIG.CHART_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.fillStyle = "#333";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < dimCount; i++) {
            const angle = -Math.PI / 2 + i * angleStep;
            const labelRadius = radius + 20 * pixelRatio;
            const x = cx + labelRadius * Math.cos(angle);
            const y = cy + labelRadius * Math.sin(angle);
            ctx.fillText(indicators[i], x, y);
        }

        // ---- 4. 逐系列绘制数据区域 ----
        // 雷达图专用配色（6色）
        const colors = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272"];

        for (let j = 0; j < seriesCount; j++) {
            const color = colors[j % colors.length];
            const points: { x: number; y: number; value: number; indicator: string; seriesName: string; index: number }[] = [];

            // 计算各维度数据点坐标
            for (let i = 0; i < dimCount; i++) {
                const val = values[i][j];
                const maxVal = maxValues[j] || 100;
                // 归一化比例，允许超出 1（最大 1.2）以显示超限数据
                const ratio = Math.min(val / maxVal, 1.2);

                const angle = -Math.PI / 2 + i * angleStep;
                const r = radius * ratio;
                points.push({
                    x: cx + r * Math.cos(angle),
                    y: cy + r * Math.sin(angle),
                    value: val,
                    indicator: indicators[i],
                    seriesName: data.headers[j + 1],
                    index: i,
                });
            }

            // 半透明填充区域
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = color;
            ctx.beginPath();
            points.forEach((p, idx) => {
                if (idx === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.fill();

            // 描边
            ctx.globalAlpha = 1;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 * pixelRatio;
            ctx.beginPath();
            points.forEach((p, idx) => {
                if (idx === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.stroke();

            // 数据点圆点
            ctx.fillStyle = color;
            points.forEach((p) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // 缓存渲染数据供 hitTest 使用
        this.#lastRenderData = { indicators, values, maxValues, cx, cy, radius, angleStep, seriesCount };
    }

    /**
     * 雷达图命中检测
     *
     * 利用缓存的渲染数据，通过角度判断维度索引，通过距离判断系列。
     * 点击位置到中心的距离与数据点到中心的距离之差 < HIT_RADIUS 时命中。
     *
     * @param px - 点击位置的 X 坐标（Canvas 像素）
     * @param py - 点击位置的 Y 坐标（Canvas 像素）
     * @param data - 图表数据
     * @param area - 绘图区域矩形（雷达图未使用，依赖缓存数据）
     * @param seriesCount - 系列数量（雷达图未使用）
     * @param catCount - 分类数量（雷达图未使用）
     * @param yScale - Y 轴刻度（雷达图未使用）
     * @returns 命中信息对象（含维度占比详情），未命中返回 null
     */
    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: unknown): HitInfo | null {
        if (!this.#lastRenderData) return null;

        const { indicators, values, maxValues, cx, cy, radius, angleStep } = this.#lastRenderData;
        // 距离中心过远或过近则未命中
        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        if (dist > radius + 10 || dist < 5) return null;

        // 根据点击角度反算维度索引
        let mouseAngle = Math.atan2(py - cy, px - cx) + Math.PI / 2;
        if (mouseAngle < 0) mouseAngle += Math.PI * 2;

        const dimIndex = Math.round(mouseAngle / angleStep) % indicators.length;

        // 在该维度上检查各系列的数据点距离
        for (let j = 0; j < this.#lastRenderData.seriesCount; j++) {
            const val = values[dimIndex]?.[j];
            const maxVal = maxValues[j] || 100;
            const pointDist = radius * Math.min(val / maxVal, 1.2);

            // 点击距离与数据点距离之差在容差范围内则命中
            if (Math.abs(dist - pointDist) < HIT_RADIUS) {
                return {
                    category: indicators[dimIndex],
                    seriesName: data.headers[j + 1],
                    value: val,
                    detail: {
                        type: "radar",
                        dimension: indicators[dimIndex],
                        value: val,
                        maxValue: maxVal,
                        percentage: ((val / maxVal) * 100).toFixed(1) + "%",
                    },
                    pointX: px,
                    pointY: py,
                };
            }
        }

        return null;
    }

    /**
     * 格式化雷达图 Tooltip 详细信息
     *
     * 输出包含维度名称、数值、最大值和占比的多行文本。
     *
     * @param detail - 命中检测返回的 detail 对象
     * @returns 格式化后的文本行数组
     */
    formatDetail(detail: Record<string, unknown>): string[] {
        return [`📊 维度: ${detail.dimension}`, `─────────`, `数值: ${detail.value}`, `最大值: ${detail.maxValue}`, `占比: ${detail.percentage}`];
    }
}
