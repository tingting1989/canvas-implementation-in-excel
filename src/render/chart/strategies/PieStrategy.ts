/**
 * @fileoverview 饼图渲染策略
 * @description 绘制饼图，每个分类对应一个扇形，
 *              支持命中检测（角度+距离判定）和百分比标签。
 * @module render/chart/strategies/PieStrategy
 */

import { BaseChartStrategy } from "../BaseChartStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, ChartStyle, HitInfo } from "../types";

/**
 * 饼图渲染策略
 *
 * 绘制饼图，每个分类对应一个扇形，扇形角度与数值成正比。
 * 在每个扇形中心位置显示百分比标签。
 * 属于无坐标轴图表（isAxisFree = true）。
 *
 * @class PieStrategy
 * @extends BaseChartStrategy
 */
export class PieStrategy extends BaseChartStrategy {
    /**
     * 构造饼图策略
     *
     * 传入类型标识 "pie" 和显示名称 "饼图"。
     */
    constructor() {
        super("pie", "饼图");
    }

    /**
     * 判断是否为无坐标轴图表
     *
     * 饼图不依赖 X/Y 坐标轴，返回 true 以跳过网格线和坐标轴绘制。
     *
     * @returns 始终返回 true
     */
    isAxisFree(): boolean {
        return true;
    }

    /**
     * 渲染饼图
     *
     * 绘制流程：
     * 1. 提取每个分类的数值，计算总和
     * 2. 以绘图区中心为圆心，短边一半为半径
     * 3. 逐分类绘制扇形（从 -π/2 开始顺时针）
     * 4. 在每个扇形中心位置绘制百分比标签
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param data - 图表数据，每行 [分类名称, 数值]
     * @param area - 绘图区域矩形
     * @param style - 图表样式配置
     */
    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Pie 开始渲染`);

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        // 提取每个分类的数值（取第二列）
        const values = data.data.map((row) => Number(row[1]) || 0);
        const total = values.reduce((sum, v) => sum + v, 0);
        if (total === 0) return;

        const cx = area.x + area.w / 2;
        const cy = area.y + area.h / 2;
        // 半径：取宽高较小值的一半，留 10px 边距
        const r = Math.min(area.w, area.h) / 2 - 10;

        const pixelRatio = this.getPixelRatio(ctx, area);
        ctx.strokeStyle = CONFIG.CHART_TOOLTIP_BORDER;
        ctx.lineWidth = CONFIG.CHART_TOOLTIP_BORDER_WIDTH * pixelRatio;
        ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
        ctx.font = `${CONFIG.CHART_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;

        // 起始角度：从正上方（-π/2）开始
        let startAngle = -Math.PI / 2;

        for (let i = 0; i < catCount; i++) {
            // 扇形角度 = (数值 / 总和) × 2π
            const sliceAngle = (values[i] / total) * Math.PI * 2;
            ctx.fillStyle = style.colors![i % style.colors!.length];

            // 绘制扇形路径：中心 → 弧 → 中心
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 在扇形中心位置绘制百分比标签
            const midAngle = startAngle + sliceAngle / 2;
            const pct = ((values[i] / total) * 100).toFixed(1) + "%";
            ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
            const labelR = r * 0.65;
            ctx.fillText(pct, cx + Math.cos(midAngle) * labelR, cy + Math.sin(midAngle) * labelR);

            startAngle += sliceAngle;
        }
    }

    /**
     * 饼图命中检测
     *
     * 通过计算点击位置到圆心的距离和角度，判断落在哪个扇形内。
     * 距离超过半径则未命中；角度匹配到某个扇形范围则命中。
     *
     * @param px - 点击位置的 X 坐标（Canvas 像素）
     * @param py - 点击位置的 Y 坐标（Canvas 像素）
     * @param data - 图表数据
     * @param area - 绘图区域矩形
     * @param seriesCount - 系列数量（饼图未使用）
     * @param catCount - 分类数量
     * @param yScale - Y 轴刻度（饼图未使用）
     * @returns 命中信息对象，未命中返回 null
     */
    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: unknown): HitInfo | null {
        const values = data.data.map((row) => Number(row[1]) || 0);
        const total = values.reduce((sum, v) => sum + v, 0);
        if (total === 0) return null;

        const cx = area.x + area.w / 2;
        const cy = area.y + area.h / 2;
        const r = Math.min(area.w, area.h) / 2 - 10;

        // 计算点击位置到圆心的距离
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // 超出半径则未命中
        if (dist > r) return null;

        // 计算点击角度（atan2 返回 -π ~ π）
        let angle = Math.atan2(dy, dx);
        // 将角度规范化到与起始角度 -π/2 对齐的范围
        if (angle < -Math.PI / 2) angle += Math.PI * 2;

        let startAngle = -Math.PI / 2;
        for (let i = 0; i < catCount; i++) {
            const sliceAngle = (values[i] / total) * Math.PI * 2;
            let endAngle = startAngle + sliceAngle;
            // 处理跨越 2π 边界的情况
            if (endAngle > (Math.PI * 3) / 2) endAngle -= Math.PI * 2;

            const normalizedAngle = angle;
            // 判断角度是否在扇形范围内（分正常和跨越边界两种情况）
            if (startAngle <= endAngle) {
                if (normalizedAngle >= startAngle && normalizedAngle <= endAngle) {
                    return {
                        category: String(data.data[i][0]),
                        seriesName: "",
                        value: values[i],
                        pointX: cx + Math.cos(startAngle + sliceAngle / 2) * r * 0.6,
                        pointY: cy + Math.sin(startAngle + sliceAngle / 2) * r * 0.6,
                    };
                }
            } else {
                // 跨越边界：角度在 startAngle 之后或在 endAngle 之前
                if (normalizedAngle >= startAngle || normalizedAngle <= endAngle) {
                    return {
                        category: String(data.data[i][0]),
                        seriesName: "",
                        value: values[i],
                        pointX: cx + Math.cos(startAngle + sliceAngle / 2) * r * 0.6,
                        pointY: cy + Math.sin(startAngle + sliceAngle / 2) * r * 0.6,
                    };
                }
            }
            startAngle += sliceAngle;
        }
        return null;
    }
}
