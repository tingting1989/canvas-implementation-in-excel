/**
 * @fileoverview 漏斗图渲染策略
 * @description 绘制漏斗图，各阶段从上到下依次收窄，
 *              支持命中检测和转化率 Tooltip。
 * @module render/chart/strategies/FunnelStrategy
 */

import { BaseChartStrategy } from "../BaseChartStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, ChartStyle, HitInfo } from "../types";

/**
 * 漏斗图渲染策略
 *
 * 绘制从上到下逐级收窄的漏斗形状，每层的宽度与数值成正比。
 * 最后一层收窄为尖端形状。每层绘制名称标签。
 * 属于无坐标轴图表（isAxisFree = true）。
 *
 * @class FunnelStrategy
 * @extends BaseChartStrategy
 */
export class FunnelStrategy extends BaseChartStrategy {
    /**
     * 构造漏斗图策略
     *
     * 传入类型标识 "funnel" 和显示名称 "漏斗图"。
     */
    constructor() {
        super("funnel", "漏斗图");
    }

    /**
     * 判断是否为无坐标轴图表
     *
     * 漏斗图不依赖 X/Y 坐标轴，返回 true 以跳过网格线和坐标轴绘制。
     *
     * @returns 始终返回 true
     */
    isAxisFree(): boolean {
        return true;
    }

    /**
     * 渲染漏斗图
     *
     * 绘制流程：
     * 1. 从数据中提取各阶段名称和数值
     * 2. 计算每层宽度（与数值占最大值的比例成正比，最小宽度为 15%）
     * 3. 逐层绘制梯形（当前层上边 → 下层下边），最后一层绘制三角形尖端
     * 4. 在每层中心绘制名称标签
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param data - 图表数据，每行 [阶段名称, 数值]
     * @param area - 绘图区域矩形
     * @param style - 图表样式配置
     */
    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle): void {
        if (!data.data || data.data.length === 0) {
            errorHandler.warn(ERROR_CODE.CHART_DATA_EMPTY, `Funnel 数据为空`);
            return;
        }

        // 提取各阶段的名称和数值
        const items = data.data.map((row) => ({
            name: String(row?.[0] || ""),
            value: Number(row?.[1]) || 0,
        }));

        if (items.length === 0) return;

        const maxValue = Math.max(...items.map((item) => item.value), 1);
        // 漏斗图专用配色（9色）
        const colors = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc"];

        const cx = area.x + area.w / 2;
        // 顶部 Y 坐标：有标题时下移 30px，否则下移 10px
        const topY = area.y + (style.title ? 30 : 10);
        const bottomY = area.y + area.h - 20;
        const totalHeight = bottomY - topY;
        const itemHeight = totalHeight / items.length;

        // 漏斗最大宽度为绘图区的 85%，最小宽度为 15%
        const maxWidth = area.w * 0.85;
        const minWidth = area.w * 0.15;
        const widthRange = maxWidth - minWidth;

        items.forEach((item, index) => {
            // 当前层宽度 = 最小宽度 + (最大宽度 - 最小宽度) × 数值占比
            const ratio = item.value / maxValue;
            const currentWidth = minWidth + widthRange * ratio;

            const y1 = topY + index * itemHeight;
            // 层间留 4px 间距
            const y2 = topY + (index + 1) * itemHeight - 4;

            const color = colors[index % colors.length];

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(cx - currentWidth / 2, y1);
            ctx.lineTo(cx + currentWidth / 2, y1);

            if (index < items.length - 1) {
                // 非最后一层：下边为下一层的宽度（梯形）
                const nextItem = items[index + 1];
                const nextRatio = nextItem.value / maxValue;
                const nextWidth = minWidth + widthRange * nextRatio;
                ctx.lineTo(cx + nextWidth / 2, y2);
                ctx.lineTo(cx - nextWidth / 2, y2);
            } else {
                // 最后一层：收窄为尖端（三角形）
                const tipWidth = currentWidth * 0.15;
                ctx.lineTo(cx + tipWidth / 2, y2 + itemHeight * 0.5);
                ctx.lineTo(cx - tipWidth / 2, y2 + itemHeight * 0.5);
            }

            ctx.closePath();
            ctx.fill();

            // 绘制层间白色分隔线
            const pixelRatio = this.getPixelRatio(ctx, area);
            ctx.strokeStyle = "rgba(255,255,255,0.7)";
            ctx.lineWidth = 1.5 * pixelRatio;
            ctx.stroke();

            // 绘制阶段名称标签
            ctx.fillStyle = "#fff";
            ctx.font = `bold ${Math.min(14, itemHeight * 0.35) * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const textY = (y1 + y2) / 2;
            ctx.fillText(item.name, cx, textY);
        });
    }

    /**
     * 漏斗图命中检测
     *
     * 判断点击位置落在哪一层漏斗区域内。
     * 命中后返回包含阶段名称、数值、转化率和总体占比的 HitInfo。
     *
     * @param px - 点击位置的 X 坐标（Canvas 像素）
     * @param py - 点击位置的 Y 坐标（Canvas 像素）
     * @param data - 图表数据
     * @param area - 绘图区域矩形
     * @param seriesCount - 系列数量（漏斗图未使用）
     * @param catCount - 分类数量（漏斗图未使用）
     * @param yScale - Y 轴刻度（漏斗图未使用）
     * @returns 命中信息对象（含转化率详情），未命中返回 null
     */
    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: unknown): HitInfo | null {
        if (!data.data || data.data.length === 0) return null;

        const items = data.data.map((row) => ({
            name: String(row?.[0] || ""),
            value: Number(row?.[1]) || 0,
        }));

        if (items.length === 0) return null;

        const maxValue = Math.max(...items.map((item) => item.value), 1);

        const cx = area.x + area.w / 2;
        const topY = area.y + 30;
        const bottomY = area.y + area.h - 20;
        const totalHeight = bottomY - topY;
        const itemHeight = totalHeight / items.length;

        const maxWidth = area.w * 0.85;
        const minWidth = area.w * 0.15;
        const widthRange = maxWidth - minWidth;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const ratio = item.value / maxValue;
            const currentWidth = minWidth + widthRange * ratio;

            const y1 = topY + i * itemHeight;
            let y2: number;
            if (i < items.length - 1) {
                y2 = topY + (i + 1) * itemHeight - 4;
            } else {
                // 最后一层包含尖端延伸区域
                y2 = topY + (i + 1) * itemHeight - 4 + itemHeight * 0.5;
            }

            // 先判断 Y 坐标是否在层范围内
            if (py >= y1 && py <= y2) {
                const nextItem = items[i + 1];
                let nextWidth: number;
                if (nextItem) {
                    const nextRatio = nextItem.value / maxValue;
                    nextWidth = minWidth + widthRange * nextRatio;
                } else {
                    nextWidth = currentWidth * 0.15;
                }

                // 再判断 X 坐标是否在漏斗宽度范围内（取上下边中较宽的）
                const leftX = Math.min(cx - currentWidth / 2, cx - nextWidth / 2);
                const rightX = Math.max(cx + currentWidth / 2, cx + nextWidth / 2);

                if (px >= leftX && px <= rightX) {
                    // 计算转化率：相对上一阶段的转化率
                    const prevValue = i > 0 ? items[i - 1].value : item.value;
                    const conversionRate = prevValue > 0 ? ((item.value / prevValue) * 100).toFixed(1) : "N/A";
                    // 计算总体占比：相对第一阶段的占比
                    const totalRate = ((item.value / items[0].value) * 100).toFixed(1);

                    return {
                        category: item.name,
                        seriesName: "Funnel",
                        value: item.value,
                        pointX: cx,
                        pointY: (y1 + y2) / 2,
                        detail: {
                            type: "漏斗图",
                            stage: item.name,
                            value: item.value,
                            conversionRate: `${conversionRate}%`,
                            totalRate: `${totalRate}%`,
                        },
                    };
                }
            }
        }

        return null;
    }

    /**
     * 格式化漏斗图 Tooltip 详细信息
     *
     * 输出包含阶段名称、数值、转化率和总体占比的多行文本。
     *
     * @param detail - 命中检测返回的 detail 对象
     * @returns 格式化后的文本行数组
     */
    formatDetail(detail: Record<string, unknown>): string[] {
        return [`─────────`, `阶段: ${detail.stage}`, `数值: ${detail.value}`, `转化率: ${detail.conversionRate}`, `总体占比: ${detail.totalRate}`];
    }
}
