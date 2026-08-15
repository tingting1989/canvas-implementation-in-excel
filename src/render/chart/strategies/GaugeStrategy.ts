/**
 * @fileoverview 仪表盘渲染策略
 * @description 绘制半圆形仪表盘，包含刻度弧线、渐变进度弧、
 *              指针和数值显示，支持命中检测和完成度 Tooltip。
 * @module render/chart/strategies/GaugeStrategy
 */

import { BaseChartStrategy } from "../BaseChartStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, ChartStyle, HitInfo } from "../types";

/**
 * 仪表盘渲染策略
 *
 * 绘制半圆形仪表盘，仅使用数据第一行的第一个数值。
 * 包含：灰色背景弧线 → 渐变进度弧 → 刻度线与标签 → 三角形指针 → 中心数值。
 * 属于无坐标轴图表（isAxisFree = true）。
 *
 * @class GaugeStrategy
 * @extends BaseChartStrategy
 */
export class GaugeStrategy extends BaseChartStrategy {
    /**
     * 构造仪表盘策略
     *
     * 传入类型标识 "gauge" 和显示名称 "仪表盘"。
     */
    constructor() {
        super("gauge", "仪表盘");
    }

    /**
     * 判断是否为无坐标轴图表
     *
     * 仪表盘不依赖 X/Y 坐标轴，返回 true 以跳过网格线和坐标轴绘制。
     *
     * @returns 始终返回 true
     */
    isAxisFree(): boolean {
        return true;
    }

    /**
     * 渲染仪表盘
     *
     * 绘制流程：
     * 1. 从数据第一行提取数值和标签
     * 2. 计算百分比，映射到半圆弧角度（π → 2π）
     * 3. 绘制灰色背景弧线
     * 4. 绘制蓝→绿→红渐变进度弧
     * 5. 绘制刻度线（11 个刻度，偶数位为主刻度带数值标签）
     * 6. 绘制三角形指针
     * 7. 绘制中心圆点、标签和数值
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param data - 图表数据，仅使用第一行 [标签, 数值]
     * @param area - 绘图区域矩形
     * @param style - 图表样式配置（min/max 控制量程范围）
     */
    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Gauge 开始渲染`, { dataType: typeof data.data });

        if (!data.data || data.data.length === 0) {
            errorHandler.warn(ERROR_CODE.CHART_DATA_EMPTY, `Gauge 数据为空`);
            return;
        }

        // 仅取第一行数据的数值和标签
        const value = Number(data.data[0]?.[1]) || 0;
        const label = String(data.data[0]?.[0] || data.headers?.[0] || "Value");

        errorHandler.debug(ERROR_CODE.CHART_STRATEGY_DEBUG, `Gauge 数据提取`, { label, value });

        // 量程范围：默认 0-100，可通过 style.min/max 自定义
        const min = style?.min ?? 0;
        const max = style?.max ?? 100;
        const safeMax = max - min || 1;
        // 百分比钳位到 [0, 1]
        const percentage = Math.max(0, Math.min(1, (value - min) / safeMax));

        // 仪表盘中心偏下方，使半圆弧上方有更多空间
        const cx = area.x + area.w / 2;
        const cy = area.y + area.h * 0.65;
        const radius = Math.min(area.w, area.h) * 0.4;

        // 半圆弧：从 π（左）到 2π（右）
        const startAngle = Math.PI;
        const endAngle = 2 * Math.PI;
        const valueAngle = startAngle + (endAngle - startAngle) * percentage;

        const pixelRatio = this.getPixelRatio(ctx, area);
        ctx.lineCap = "round";

        // ---- 1. 灰色背景弧线 ----
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = "#e0e0e0";
        ctx.lineWidth = radius * 0.15 * pixelRatio;
        ctx.stroke();

        // ---- 2. 渐变进度弧（蓝→绿→红）----
        const gradient = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
        gradient.addColorStop(0, "#5470c6");
        gradient.addColorStop(0.5, "#91cc75");
        gradient.addColorStop(1, "#ee6666");

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, valueAngle);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = radius * 0.15 * pixelRatio;
        ctx.stroke();

        // ---- 3. 刻度线与标签 ----
        const tickRadius = radius * 1.15;
        const tickCount = 11;
        for (let i = 0; i < tickCount; i++) {
            const angle = startAngle + ((endAngle - startAngle) / (tickCount - 1)) * i;
            // 偶数位为主刻度（更长更粗）
            const isMajor = i % 2 === 0;

            const innerR = tickRadius - (isMajor ? radius * 0.06 : radius * 0.03);
            const outerR = tickRadius;

            const x1 = cx + Math.cos(angle) * innerR;
            const y1 = cy + Math.sin(angle) * innerR;
            const x2 = cx + Math.cos(angle) * outerR;
            const y2 = cy + Math.sin(angle) * outerR;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = "#666";
            ctx.lineWidth = (isMajor ? 2 : 1) * pixelRatio;
            ctx.stroke();

            // 主刻度显示数值标签
            if (isMajor) {
                const tickValue = min + ((max - min) / (tickCount - 1)) * i;
                const textR = tickRadius + radius * 0.08;
                const tx = cx + Math.cos(angle) * textR;
                const ty = cy + Math.sin(angle) * textR;

                ctx.fillStyle = "#666";
                ctx.font = `${radius * 0.12 * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(Math.round(tickValue).toString(), tx, ty);
            }
        }

        // ---- 4. 三角形指针 ----
        const needleLength = radius * 0.85;
        const needleWidth = radius * 0.04;
        const needleAngle = startAngle + (endAngle - startAngle) * percentage;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(needleAngle);

        ctx.beginPath();
        ctx.moveTo(-needleWidth * 1.5, 0);
        ctx.lineTo(0, -needleLength);
        ctx.lineTo(needleWidth * 1.5, 0);
        ctx.closePath();
        ctx.fillStyle = "#5470c6";
        ctx.fill();

        ctx.restore();

        // ---- 5. 中心圆点 ----
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = "#5470c6";
        ctx.fill();

        // ---- 6. 标签和数值 ----
        ctx.fillStyle = "#333";
        ctx.font = `bold ${radius * 0.14 * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label.toUpperCase(), cx, cy + radius * 0.25);

        ctx.fillStyle = "#333";
        ctx.font = `bold ${radius * 0.22 * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // 整数不显示小数位，浮点数保留 1 位
        let displayValue: string;
        if (Number.isInteger(value)) {
            displayValue = String(value);
        } else {
            displayValue = value.toFixed(1);
        }
        ctx.fillText(displayValue, cx, cy + radius * 0.42);
    }

    /**
     * 仪表盘命中检测
     *
     * 判断点击位置是否在仪表盘圆形范围内（半径为绘图区短边的 45%）。
     * 命中后返回包含数值、量程范围和完成度的 HitInfo。
     *
     * @param px - 点击位置的 X 坐标（Canvas 像素）
     * @param py - 点击位置的 Y 坐标（Canvas 像素）
     * @param data - 图表数据
     * @param area - 绘图区域矩形
     * @param seriesCount - 系列数量（仪表盘未使用）
     * @param catCount - 分类数量（仪表盘未使用）
     * @param yScale - Y 轴刻度（仪表盘未使用）
     * @returns 命中信息对象（含完成度详情），未命中返回 null
     */
    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: unknown): HitInfo | null {
        if (!data.data || data.data.length === 0) return null;

        const value = Number(data.data[0]?.[1]) || 0;
        const label = String(data.data[0]?.[0] || data.headers?.[0] || "Value");
        const cx = area.x + area.w / 2;
        const cy = area.y + area.h * 0.65;
        const radius = Math.min(area.w, area.h) * 0.45;

        // 圆形范围检测
        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        if (dist > radius) return null;

        const min = 0;
        const max = 100;
        const percentage = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));

        return {
            category: label,
            seriesName: "Gauge",
            value: value,
            pointX: cx,
            pointY: cy,
            detail: {
                type: "仪表盘",
                value: value,
                min: min,
                max: max,
                percentage: `${(percentage * 100).toFixed(1)}%`,
            },
        };
    }

    /**
     * 格式化仪表盘 Tooltip 详细信息
     *
     * 输出包含数值、量程范围和完成度的多行文本。
     *
     * @param detail - 命中检测返回的 detail 对象
     * @returns 格式化后的文本行数组
     */
    formatDetail(detail: Record<string, unknown>): string[] {
        return [`─────────`, `数值: ${detail.value}`, `范围: ${detail.min} - ${detail.max}`, `完成度: ${detail.percentage}`];
    }
}
