/**
 * 迷你图渲染器（SparklineType）
 *
 * 将数值数组渲染为嵌入单元格的小型图表（折线图或柱状图），
 * 适合在有限空间内展示数据趋势，无需占用完整的图表区域。
 *
 * 典型应用场景：KPI 仪表盘中的趋势指示、表格行内的数据走势、
 * 股票价格波动、温度变化等时序数据的快速概览。
 *
 * ## 支持的图表类型
 *
 * | 类型   | options.type 值 | 说明                                       |
 * |--------|------------------|--------------------------------------------|
 * | 折线图 | "line"（默认）   | 带可选填充区域和数据点的折线               |
 * | 柱状图 | "bar"            | 等宽柱形，高度按数据值比例缩放             |
 *
 * ## 数据格式
 *
 * 单元格值必须为数值数组，如 `[10, 25, 18, 30, 22]`。
 * 非数组值会被视为空数组，不绘制任何内容。
 *
 * ## 自定义选项（this.options）
 *
 * | 选项            | 默认值                        | 说明                                       |
 * |-----------------|-------------------------------|--------------------------------------------|
 * | type            | "line"                        | 图表类型："line" 或 "bar"                  |
 * | lineColor       | CONFIG.SPARKLINE_LINE_COLOR   | 折线颜色                                   |
 * | fillColor       | CONFIG.SPARKLINE_FILL_COLOR   | 折线下方填充色（null 则不填充）            |
 * | lineWidth       | CONFIG.SPARKLINE_LINE_WIDTH   | 折线宽度（像素）                           |
 * | showDots        | false                         | 是否显示数据点（仅数据点 ≤ 20 时生效）     |
 * | barColor        | CONFIG.SPARKLINE_BAR_COLOR    | 柱状图填充色                               |
 *
 * ## 渲染管线
 *
 * ```
 * render()
 *   ├─ 计算绘图区域（扣除 padding）
 *   ├─ 计算数据范围（minVal / maxVal / range）
 *   ├─ type === "bar"  → #renderBarChart()
 *   └─ type === "line" → #renderLineChart()
 *                      ├─ 绘制折线路径
 *                      ├─ 填充区域（可选）
 *                      ├─ 描边折线
 *                      └─ 绘制数据点（可选，≤ 20 个）
 * ```
 *
 * @module types/renderers/SparklineType
 * @see BaseColumnType 列类型基类，定义 name、editorType、format、parse 等接口
 * @see CHART_TYPE 图表类型枚举，定义 "line"、"bar" 等常量
 */

import { BaseColumnType } from "../BaseColumnType.js";
import { CONFIG } from "../../constants/config.js";
import { CHART_TYPE } from "../../constants/enums/ChartType.js";

export class SparklineType extends BaseColumnType {
    /** @type {string} 类型名称标识 */
    get name() {
        return "sparkline";
    }

    /** @type {string} 关联的编辑器类型（迷你图数据使用文本编辑器输入） */
    get editorType() {
        return "text";
    }

    /**
     * 格式化迷你图值为显示文本
     *
     * 数组值显示为 "N 个数据点" 的摘要形式，而非原始数组内容。
     * 非数组值直接转为字符串。
     *
     * @param {*} value - 单元格值（期望为数值数组）
     * @returns {string} 格式化后的文本
     */
    format(value) {
        if (Array.isArray(value)) {
            return value.length > 0 ? `${value.length} 个数据点` : "";
        }
        return String(value ?? "");
    }

    /**
     * 自定义渲染方法：绘制迷你图
     *
     * 绘制流程：
     * 1. 解析数据数组，空数组则跳过渲染
     * 2. 计算绘图区域（单元格区域扣除 padding）
     * 3. 计算数据范围（minVal、maxVal、range），range 为 0 时强制为 1 避免除零
     * 4. 根据 chartType 委托给 #renderLineChart() 或 #renderBarChart()
     *
     * @param {import('../CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     * @param {CanvasRenderingContext2D} context.ctx - Canvas 2D 上下文
     * @param {number} context.x - 单元格左上角 X 坐标
     * @param {number} context.y - 单元格左上角 Y 坐标
     * @param {number} context.width - 单元格宽度
     * @param {number} context.height - 单元格高度
     * @param {*} context.value - 单元格值（期望为数值数组）
     */
    render(context) {
        const { ctx, x, y, width, height, value } = context;

        // 非数组值视为空数据，不绘制
        const data = Array.isArray(value) ? value : [];
        const chartType = this.options?.type || "line";
        const padding = CONFIG.SPARKLINE_PADDING;

        if (data.length === 0) return;

        // 绘图区域：单元格区域扣除四周 padding
        const chartX = x + padding;
        const chartY = y + padding;
        const chartW = width - padding * 2;
        const chartH = height - padding * 2;

        // 计算数据范围，range 为 0 时强制为 1 避免除零错误
        const minVal = Math.min(...data);
        const maxVal = Math.max(...data);
        const range = maxVal - minVal || 1;

        // 根据图表类型委托给对应的渲染方法
        if (chartType === CHART_TYPE.BAR) {
            this.#renderBarChart(ctx, data, chartX, chartY, chartW, chartH, minVal, range);
        } else {
            this.#renderLineChart(ctx, data, chartX, chartY, chartW, chartH, minVal, range);
        }
    }

    /**
     * 渲染折线迷你图
     *
     * 绘制流程：
     * 1. 计算每个数据点的像素坐标（X 等间距，Y 按数据值线性映射）
     * 2. 构建折线路径
     * 3. 如果设置了 fillColor，闭合路径到底部并填充区域，然后重新构建折线路径
     * 4. 描边折线
     * 5. 如果 showDots 为 true 且数据点 ≤ 20，绘制圆形数据点
     *
     * 坐标映射公式：
     * - px = x + i × stepX（stepX = w / (data.length - 1)）
     * - py = y + h - ((val - minVal) / range) × h
     *
     * 注意：填充区域后需要重新构建折线路径，因为 closePath() 改变了当前路径。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {number[]} data - 数据数组
     * @param {number} x - 绘图区域左上角 X 坐标
     * @param {number} y - 绘图区域左上角 Y 坐标
     * @param {number} w - 绘图区域宽度
     * @param {number} h - 绘图区域高度
     * @param {number} minVal - 数据最小值
     * @param {number} range - 数据范围（maxVal - minVal，至少为 1）
     */
    #renderLineChart(ctx, data, x, y, w, h, minVal, range) {
        const lineColor = this.options?.lineColor || CONFIG.SPARKLINE_LINE_COLOR;
        const fillColor = this.options?.fillColor || CONFIG.SPARKLINE_FILL_COLOR;
        const showDots = this.options?.showDots ?? false;

        // X 方向步长：数据点之间的水平间距
        const stepX = w / (data.length - 1 || 1);

        // 第 1 步：构建折线路径
        ctx.beginPath();
        data.forEach((val, i) => {
            const px = x + i * stepX;
            const py = y + h - ((val - minVal) / range) * h;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });

        // 第 2 步：填充折线下方区域（可选）
        if (fillColor) {
            // 闭合路径到底部形成封闭区域
            ctx.lineTo(x + (data.length - 1) * stepX, y + h);
            ctx.lineTo(x, y + h);
            ctx.closePath();
            ctx.fillStyle = fillColor;
            ctx.fill();

            // 填充后重新构建折线路径（closePath 改变了当前路径）
            ctx.beginPath();
            data.forEach((val, i) => {
                const px = x + i * stepX;
                const py = y + h - ((val - minVal) / range) * h;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
        }

        // 第 3 步：描边折线
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = this.options?.lineWidth || CONFIG.SPARKLINE_LINE_WIDTH;
        ctx.stroke();

        // 第 4 步：绘制数据点（可选，仅数据点 ≤ 20 时绘制，避免密集点重叠）
        if (showDots && data.length <= 20) {
            data.forEach((val, i) => {
                const px = x + i * stepX;
                const py = y + h - ((val - minVal) / range) * h;
                ctx.beginPath();
                ctx.arc(px, py, CONFIG.SPARKLINE_DOT_RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = lineColor;
                ctx.fill();
            });
        }
    }

    /**
     * 渲染柱状迷你图
     *
     * 绘制流程：
     * 1. 计算每根柱的宽度（扣除柱间距后均分）
     * 2. 遍历数据，按数据值比例计算柱高和 Y 坐标
     * 3. 绘制填充矩形
     *
     * 柱宽计算公式：barW = (w - barGap × (data.length - 1)) / data.length
     * 柱高计算公式：barH = ((val - minVal) / range) × h
     * 柱 Y 坐标公式：barY = y + h - barH（从底部向上生长）
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {number[]} data - 数据数组
     * @param {number} x - 绘图区域左上角 X 坐标
     * @param {number} y - 绘图区域左上角 Y 坐标
     * @param {number} w - 绘图区域宽度
     * @param {number} h - 绘图区域高度
     * @param {number} minVal - 数据最小值
     * @param {number} range - 数据范围（maxVal - minVal，至少为 1）
     */
    #renderBarChart(ctx, data, x, y, w, h, minVal, range) {
        const barColor = this.options?.barColor || CONFIG.SPARKLINE_BAR_COLOR;
        const barGap = CONFIG.SPARKLINE_BAR_GAP;
        // 柱宽 = (总宽度 - 所有间距之和) / 柱数
        const barW = (w - barGap * (data.length - 1)) / data.length;

        data.forEach((val, i) => {
            const barX = x + i * (barW + barGap);
            const barH = ((val - minVal) / range) * h;
            const barY = y + h - barH;

            ctx.fillStyle = barColor;
            ctx.fillRect(barX, barY, barW, barH);
        });
    }
}
