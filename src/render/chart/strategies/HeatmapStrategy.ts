/**
 * @fileoverview 热力图渲染策略
 * @description 绘制热力图矩阵，通过颜色插值映射数值大小，
 *              支持单元格内数值显示、命中检测和排名 Tooltip。
 * @module render/chart/strategies/HeatmapStrategy
 */

import { BaseChartStrategy } from "../BaseChartStrategy";
import { CONFIG } from "../../../constants/config";
import { errorHandler } from "../../../core/ErrorHandler";
import { ERROR_CODE } from "../../../constants/errorCodes";
import type { ChartData, PlotArea, ChartStyle, HitInfo, RgbColor } from "../types";

/**
 * 热力图渲染策略
 *
 * 以矩阵形式绘制热力图，每个单元格的颜色由数值在 [minVal, maxVal] 范围内的
 * 比例决定，通过颜色插值（线性渐变）映射到色阶。
 * 支持在单元格内显示数值（根据背景亮度自动选择黑/白文字）。
 *
 * @class HeatmapStrategy
 * @extends BaseChartStrategy
 */
export class HeatmapStrategy extends BaseChartStrategy {
    /**
     * @static @private 静态私有字段 - 默认色阶（11色，蓝→黄→红）
     *
     * 从冷色（深蓝）到暖色（深红）的渐变色阶，
     * 用于数值到颜色的线性插值映射。
     */
    static #defaultColors: string[] = [
        "#313695",
        "#4575b4",
        "#74add1",
        "#abd9e9",
        "#e0f3f8",
        "#ffffbf",
        "#fee090",
        "#fdae61",
        "#f46d43",
        "#d73027",
        "#a50026",
    ];

    /**
     * 构造热力图策略
     *
     * 传入类型标识 "heatmap" 和显示名称 "热力图"。
     */
    constructor() {
        super("heatmap", "热力图");
    }

    /**
     * @static @private 静态私有方法 - 颜色插值
     *
     * 根据归一化值 value（0~1）在色阶数组中进行线性插值，
     * 返回插值后的十六进制颜色字符串。
     *
     * @param value - 归一化值，范围 [0, 1]
     * @param colors - 色阶字符串数组
     * @returns 插值后的十六进制颜色字符串（如 "#ff8800"）
     */
    static #interpolateColor(value: number, colors: string[]): string {
        const idx = value * (colors.length - 1);
        const i = Math.floor(idx);
        const t = idx - i;

        // 超出范围时返回最后一个颜色
        if (i >= colors.length - 1) {
            return colors[colors.length - 1];
        }

        // 对相邻两个颜色进行 RGB 线性插值
        const c1 = HeatmapStrategy.#hexToRgb(colors[i]);
        const c2 = HeatmapStrategy.#hexToRgb(colors[i + 1]);

        const r = Math.round(c1.r * (1 - t) + c2.r * t);
        const g = Math.round(c1.g * (1 - t) + c2.g * t);
        const b = Math.round(c1.b * (1 - t) + c2.b * t);

        return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    }

    /**
     * @static @private 静态私有方法 - 十六进制颜色转 RGB
     *
     * 将 "#rrggbb" 格式的十六进制颜色字符串解析为 { r, g, b } 对象。
     * 解析失败时返回 { r: 0, g: 0, b: 0 }。
     *
     * @param hex - 十六进制颜色字符串（如 "#ff8800"）
     * @returns RGB 颜色对象
     */
    static #hexToRgb(hex: string): RgbColor {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? {
                  r: parseInt(result[1], 16),
                  g: parseInt(result[2], 16),
                  b: parseInt(result[3], 16),
              }
            : { r: 0, g: 0, b: 0 };
    }

    /**
     * 渲染热力图
     *
     * 绘制流程：
     * 1. 校验数据至少 2 行 2 列
     * 2. 计算数值范围 [minVal, maxVal] 和每个单元格尺寸
     * 3. 逐单元格：计算颜色 → 填充矩形 → 可选显示数值
     * 4. 数值文字颜色根据背景亮度自动选择黑/白
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param data - 图表数据，首列为行标签，其余列为数值
     * @param area - 绘图区域矩形
     * @param style - 图表样式配置（colors, cellPadding, showValue）
     * @param yScale - Y 轴刻度（热力图未使用）
     */
    render(ctx: CanvasRenderingContext2D, data: ChartData, area: PlotArea, style: ChartStyle, yScale?: unknown): void {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Heatmap 开始渲染`);

        if (!data.data || data.data.length < 2) {
            errorHandler.warn(ERROR_CODE.CHART_DATA_EMPTY, `Heatmap 数据不足（至少需要2行2列）`);
            return;
        }

        const rowCount = data.data.length;
        const colCount = data.headers.length - 1;
        if (colCount < 2) {
            errorHandler.warn(ERROR_CODE.CHART_DATA_EMPTY, `Heatmap 列数不足（至少需要2列数据）`);
            return;
        }

        // 提取数值矩阵并计算范围
        const values = data.data.map((row) => row.slice(1).map((v) => Number(v) || 0));
        const flatValues = values.flat();
        const minVal = Math.min(...flatValues);
        const maxVal = Math.max(...flatValues);
        const range = maxVal - minVal || 1;

        // 色阶：优先使用用户自定义，否则使用默认 11 色色阶
        const colors = style?.colors || HeatmapStrategy.#defaultColors;
        const padding = style?.cellPadding ?? 2;
        const showValue = style?.showValue !== false;

        // 计算单元格尺寸（扣除所有内边距）
        const totalPaddingX = padding * (colCount + 1);
        const totalPaddingY = padding * (rowCount + 1);
        const cellWidth = (area.w - totalPaddingX) / colCount;
        const cellHeight = (area.h - totalPaddingY) / rowCount;

        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.8)";

        for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col < colCount; col++) {
                const value = values[row][col];
                // 归一化到 [0, 1] 后插值颜色
                const ratio = (value - minVal) / range;
                const color = HeatmapStrategy.#interpolateColor(ratio, colors);

                const x = area.x + padding + col * (cellWidth + padding);
                const y = area.y + padding + row * (cellHeight + padding);

                // 填充单元格
                ctx.fillStyle = color;
                ctx.fillRect(x, y, cellWidth, cellHeight);
                ctx.strokeRect(x, y, cellWidth, cellHeight);

                // 在单元格内显示数值（仅当单元格足够大时）
                if (showValue && cellWidth > 20 && cellHeight > 20) {
                    // 根据背景亮度选择黑/白文字
                    const brightness = this.getColorBrightness(color);
                    ctx.fillStyle = brightness > 128 ? "#333" : "#fff";
                    const fontSize = Math.min(12, cellHeight * 0.4, cellWidth * 0.3);
                    ctx.font = `${fontSize}px ${CONFIG.CHART_FONT_FAMILY}`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";

                    // 整数不显示小数位，浮点数保留 1 位
                    const displayVal = Number.isInteger(value) ? String(value) : value.toFixed(1);
                    ctx.fillText(displayVal, x + cellWidth / 2, y + cellHeight / 2);
                }
            }
        }

        errorHandler.debug(ERROR_CODE.CHART_STRATEGY_DEBUG, `Heatmap 渲染完成`, {
            rowCount,
            colCount,
            minVal,
            maxVal,
            range,
        });
    }

    /**
     * @private 私有方法 - 计算颜色的感知亮度
     *
     * 使用 ITU-R BT.601 加权公式计算灰度值，
     * 用于判断应使用黑色还是白色文字以保证可读性。
     *
     * @param hex - 十六进制颜色字符串
     * @returns 感知亮度值（0-255），>128 为浅色背景
     */
    private getColorBrightness(hex: string): number {
        const rgb = HeatmapStrategy.#hexToRgb(hex);
        return Math.round(0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
    }

    /**
     * 热力图命中检测
     *
     * 根据点击坐标反算行列索引，判断是否落在某个单元格内。
     * 命中后返回包含行列标签、数值和排名百分比的 HitInfo。
     *
     * @param px - 点击位置的 X 坐标（Canvas 像素）
     * @param py - 点击位置的 Y 坐标（Canvas 像素）
     * @param data - 图表数据
     * @param area - 绘图区域矩形
     * @param seriesCount - 系列数量（热力图未使用）
     * @param catCount - 分类数量（热力图未使用）
     * @param yScale - Y 轴刻度（热力图未使用）
     * @returns 命中信息对象（含排名百分比详情），未命中返回 null
     */
    hitTest(px: number, py: number, data: ChartData, area: PlotArea, seriesCount: number, catCount: number, yScale?: unknown): HitInfo | null {
        if (!data.data || data.data.length < 2) return null;

        const rowCount = data.data.length;
        const colCount = data.headers.length - 1;
        if (colCount < 2) return null;

        const padding = 2;
        const totalPaddingX = padding * (colCount + 1);
        const totalPaddingY = padding * (rowCount + 1);
        const cellWidth = (area.w - totalPaddingX) / colCount;
        const cellHeight = (area.h - totalPaddingY) / rowCount;

        // 将点击坐标转换为相对于绘图区左上角的偏移
        const relX = px - area.x - padding;
        const relY = py - area.y - padding;

        if (relX < 0 || relY < 0) return null;

        // 反算行列索引
        const col = Math.floor(relX / (cellWidth + padding));
        const row = Math.floor(relY / (cellHeight + padding));

        if (col < 0 || col >= colCount || row < 0 || row >= rowCount) return null;

        // 精确判断是否在单元格矩形内（排除间距区域）
        const cellX = area.x + padding + col * (cellWidth + padding);
        const cellY = area.y + padding + row * (cellHeight + padding);

        if (px >= cellX && px <= cellX + cellWidth && py >= cellY && py <= cellY + cellHeight) {
            const value = Number(data.data[row][col + 1]) || 0;
            const rowLabel = String(data.data[row][0] || `Row${row}`);
            const colLabel = String(data.headers[col + 1] || `Col${col}`);

            // 计算排名百分比
            const allValues = data.data.flatMap((r) => r.slice(1).map((v) => Number(v) || 0));
            const minVal = Math.min(...allValues);
            const maxVal = Math.max(...allValues);
            const percentage = maxVal !== minVal ? (((value - minVal) / (maxVal - minVal)) * 100).toFixed(1) : "50.0";

            return {
                category: rowLabel,
                seriesName: colLabel,
                value: value,
                pointX: cellX + cellWidth / 2,
                pointY: cellY + cellHeight / 2,
                detail: {
                    type: "热力图",
                    row: rowLabel,
                    col: colLabel,
                    value: value,
                    min: minVal,
                    max: maxVal,
                    percentage: `${percentage}%`,
                },
            };
        }

        return null;
    }

    /**
     * 格式化热力图 Tooltip 详细信息
     *
     * 输出包含行列标签、数值、范围和排名百分比的多行文本。
     *
     * @param detail - 命中检测返回的 detail 对象
     * @returns 格式化后的文本行数组
     */
    formatDetail(detail: Record<string, unknown>): string[] {
        return [
            `📊 ${detail.type || ""}`,
            `─────────`,
            `行: ${detail.row}`,
            `列: ${detail.col}`,
            `数值: ${detail.value ?? "N/A"}`,
            `范围: ${detail.min ?? "N/A"} - ${detail.max ?? "N/A"}`,
            `排名: ${detail.percentage ?? "N/A"}`,
        ];
    }
}
