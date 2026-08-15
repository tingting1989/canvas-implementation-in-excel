/**
 * @fileoverview K线图（蜡烛图）渲染策略
 * @description 绘制 OHLC 蜡烛图，包含实体和影线，
 *              上涨为绿色、下跌为红色，支持命中检测和详细 Tooltip。
 * @module render/chart/strategies/CandlestickStrategy
 */

import { BaseChartStrategy } from "../BaseChartStrategy";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, YScale, ChartStyle, HitInfo } from "../types";

/**
 * K线图（蜡烛图）渲染策略
 *
 * 绘制 OHLC 蜡烛图，数据格式为每行 [开盘价, 收盘价, 最低价, 最高价]。
 * 上涨（收盘 ≥ 开盘）为绿色，下跌（收盘 < 开盘）为红色。
 * 包含实体（开盘-收盘矩形）和影线（最高-最低细线）。
 *
 * @class CandlestickStrategy
 * @extends BaseChartStrategy
 */
export class CandlestickStrategy extends BaseChartStrategy {
    /**
     * 构造 K线图策略
     *
     * 传入类型标识 "candlestick" 和显示名称 "K线图"。
     */
    constructor() {
        super("candlestick", "K线图");
    }

    /**
     * 渲染 K线图
     *
     * 绘制流程：
     * 1. 遍历每行数据，提取 OHLC 四个值
     * 2. 判断涨跌方向，确定颜色
     * 3. 绘制影线（最高价到最低价的竖线）
     * 4. 绘制实体（开盘价到收盘价的矩形，极小时用横线代替）
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param data - 图表数据，每行格式为 [开盘价, 收盘价, 最低价, 最高价]
     * @param area - 绘图区域矩形
     * @param style - 图表样式配置
     * @param yScale - Y 轴刻度信息，为 null 时自动从数据中计算
     */
    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: YScale | null): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Candlestick 开始渲染`);

        const catCount = data.data.length;
        if (catCount <= 0) return;

        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;

        // 蜡烛宽度：分类宽度的 70%，最小 4px
        const candleWidth = Math.max((area.w / catCount) * 0.7, 4);
        const wickWidth = 1;

        for (let i = 0; i < catCount; i++) {
            const row = data.data[i];
            // 数据格式：[开盘价, 收盘价, 最低价, 最高价]，至少需要 4 列
            if (!row || row.length < 4) continue;

            const open = Number(row[0]) || 0;
            const close = Number(row[1]) || 0;
            const low = Number(row[2]) || 0;
            const high = Number(row[3]) || 0;

            // 判断涨跌方向：收盘 ≥ 开盘为上涨
            const isUp = close >= open;
            // 蜡烛中心 X 坐标
            const cx = area.x + (i + 0.5) * (area.w / catCount);

            // 将 OHLC 值映射为 Canvas Y 坐标（值越大 Y 越小）
            const openY = area.y + area.h - ((open - yMin) / yRange) * area.h;
            const closeY = area.y + area.h - ((close - yMin) / yRange) * area.h;
            const lowY = area.y + area.h - ((low - yMin) / yRange) * area.h;
            const highY = area.y + area.h - ((high - yMin) / yRange) * area.h;

            // 实体顶部 Y 和高度（取开盘/收盘中较小值为顶部）
            const bodyTop = Math.min(openY, closeY);
            const bodyH = Math.abs(closeY - openY) || 1;

            const pixelRatio = this.getPixelRatio(ctx, area);
            // 上涨绿色，下跌红色
            ctx.strokeStyle = isUp ? "#00aa44" : "#ff4444";
            ctx.fillStyle = isUp ? "#00aa44" : "#ff4444";

            // ---- 绘制影线（最高价到最低价的竖线）----
            ctx.lineWidth = wickWidth * pixelRatio;
            ctx.beginPath();
            ctx.moveTo(cx, highY);
            ctx.lineTo(cx, lowY);
            ctx.stroke();

            // ---- 绘制实体 ----
            if (bodyH > 1) {
                // 正常实体：填充矩形 + 描边
                ctx.fillRect(cx - candleWidth / 2, bodyTop, candleWidth, bodyH);
                ctx.lineWidth = 1 * pixelRatio;
                ctx.strokeRect(cx - candleWidth / 2, bodyTop, candleWidth, bodyH);
            } else {
                // 十字星/极小实体：用横线表示
                ctx.beginPath();
                ctx.moveTo(cx - candleWidth / 2, bodyTop);
                ctx.lineTo(cx + candleWidth / 2, bodyTop);
                ctx.stroke();
            }
        }
    }

    /**
     * K线图命中检测
     *
     * 在每根蜡烛的影线范围内（含额外容差 padding）判断点击位置。
     * 命中后返回包含 OHLC 详细信息和涨跌幅的 HitInfo。
     *
     * @param px - 点击位置的 X 坐标（Canvas 像素）
     * @param py - 点击位置的 Y 坐标（Canvas 像素）
     * @param data - 图表数据
     * @param area - 绘图区域矩形
     * @param seriesCount - 系列数量（K线图未使用）
     * @param catCount - 分类数量
     * @param yScale - Y 轴刻度信息
     * @returns 命中信息对象（含 OHLC 详情），未命中返回 null
     */
    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: YScale | null): HitInfo | null {
        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;

        const candleWidth = Math.max((area.w / catCount) * 0.7, 4);
        // 命中容差：水平方向额外 8px，垂直方向额外 15px
        const hitPaddingX = candleWidth / 2 + 8;
        const hitPaddingY = 15;

        for (let i = 0; i < catCount; i++) {
            const row = data.data[i];
            if (!row || row.length < 4) continue;

            const open = Number(row[0]) || 0;
            const close = Number(row[1]) || 0;
            const low = Number(row[2]) || 0;
            const high = Number(row[3]) || 0;

            const cx = area.x + (i + 0.5) * (area.w / catCount);

            const highY = area.y + area.h - ((high - yMin) / yRange) * area.h;
            const lowY = area.y + area.h - ((low - yMin) / yRange) * area.h;

            // 在影线范围内（含容差）判定命中
            if (px >= cx - hitPaddingX && px <= cx + hitPaddingX && py >= highY - hitPaddingY && py <= lowY + hitPaddingY) {
                const isUp = close >= open;
                const change = close - open;
                const changePercent = open !== 0 ? ((change / open) * 100).toFixed(2) : "0.00";

                return {
                    category: String(data.headers?.[i] || `K${i + 1}`),
                    seriesName: "OHLC",
                    value: `O:${open} H:${high} L:${low} C:${close}`,
                    detail: {
                        type: "K线",
                        open,
                        high,
                        low,
                        close,
                        change: change.toFixed(2),
                        changePercent: `${changePercent}%`,
                        direction: isUp ? "上涨 📈" : "下跌 📉",
                    },
                    pointX: cx,
                    pointY: (highY + lowY) / 2,
                };
            }
        }

        return null;
    }

    /**
     * 格式化 K线图 Tooltip 详细信息
     *
     * 输出包含涨跌方向、OHLC 四值和涨跌幅的多行文本。
     *
     * @param detail - 命中检测返回的 detail 对象
     * @returns 格式化后的文本行数组
     */
    formatDetail(detail: Record<string, unknown>): string[] {
        return [
            `📊 ${detail.direction || ""}`,
            `─────────`,
            `开盘: ${detail.open ?? "N/A"}`,
            `最高: ${detail.high ?? "N/A"}`,
            `最低: ${detail.low ?? "N/A"}`,
            `收盘: ${detail.close ?? "N/A"}`,
            `─────────`,
            `涨跌: ${detail.change ?? "N/A"} (${detail.changePercent ?? "N/A"})`,
        ];
    }
}
