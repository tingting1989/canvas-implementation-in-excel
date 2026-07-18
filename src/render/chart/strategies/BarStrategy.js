/**
 * @fileoverview 柱状图渲染策略实现
 * @description 负责柱状图/条形图的 Canvas 渲染、点击检测和 Tooltip 格式化。
 *              支持多系列分组显示，自动计算柱宽和间距，适用于类别数据对比分析。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module strategies/BarStrategy
 * @see {@link BaseChartStrategy} 基类定义
 * @see {@link NativeChartRenderer} 门面类
 */

import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy.js";
import { CONFIG } from "../../../constants/config.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

/**
 * 柱状图策略类
 *
 * @class BarStrategy
 * @extends BaseChartStrategy
 * @description 实现柱状图的完整渲染逻辑，包括：
 *
 * **核心特性：**
 * - ✅ 多系列分组显示（支持并列柱状图）
 * - ✅ 自动柱宽和间距计算
 * - ✅ Y轴数值映射（支持负数）
 * - ✅ 边框描边效果
 * - ✅ 精确的点击检测（矩形区域判定）
 *
 * **数据格式要求：**
 * ```
 * data = {
 *   headers: ["类别", "系列1", "系列2", ...],
 *   data: [
 *     ["A", 100, 200],  // 第一行数据
 *     ["B", 150, 180],  // 第二行数据
 *   ]
 * }
 * ```
 *
 * **适用场景：**
 * - 产品销量对比
 * - 季度业绩对比
 * - 部门绩效排名
 * - 类别数据分布
 *
 * **视觉特性：**
 * - 柱宽占比：70%（groupWidth * 0.7 / seriesCount）
 * - 柱间距：30% 均匀分配
 * - 边框颜色：CONFIG.CHART_BAR_BORDER_COLOR
 * - 边框宽度：CONFIG.CHART_GRID_LINE_WIDTH
 *
 * @example
 * // 创建柱状图实例
 * const barStrategy = new BarStrategy();
 * console.log(barStrategy.type);  // "bar"
 * console.log(barStrategy.name);  // "柱状图"
 */
export class BarStrategy extends BaseChartStrategy {
    /**
     * 创建柱状图策略实例
     *
     * @constructor
     * @description 初始化策略类型和名称，注册到策略注册表。
     *              类型标识符为 "bar"，用于在 NativeChartRenderer 中查找该策略。
     */
    constructor() {
        super("bar", "柱状图");
    }

    /**
     * 渲染柱状图到 Canvas 上下文
     *
     * @method render
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {Object} data - 图表数据对象
     * @param {string[]} data.headers - 列标题数组（第一列为类别名，后续为系列名）
     * @param {Array<Array<number|string>>} data.data - 二维数据数组
     * @param {Object} area - 绑制区域坐标
     * @param {number} area.x - 区域左上角 X 坐标
     * @param {number} area.y - 区域左上角 Y 坐标
     * @param {number} area.w - 区域宽度
     * @param {number} area.h - 区域高度
     * @param {Object} style - 样式配置
     * @param {string[]} style.colors - 颜色数组（每个系列一个颜色）
     * @param {Object} [yScale] - Y轴刻度信息（由 buildYScale 生成）
     * @param {number} yScale.min - Y轴最小值
     * @param {number} yScale.max - Y轴最大值
     *
     * @description 渲染流程：
     *
     * **Step 1: 数据验证**
     * - 检查 seriesCount 和 catCount 是否有效
     * - 无效时直接返回（不绘制）
     *
     * **Step 2: 计算布局参数**
     * ```
     * groupWidth = area.w / catCount          // 每组宽度
     * barWidth = (groupWidth * 0.7) / seriesCount  // 单个柱宽
     * barGap = (groupWidth * 0.3) / (seriesCount + 1)  // 柱间距
     * ```
     *
     * **Step 3: 绘制柱体**
     * - 外层循环：遍历系列（s）
     * - 内层循环：遍历类别（i）
     * - 计算：`val → barH` 映射（Y轴归一化）
     * - 绘制：fillRect + strokeRect
     *
     * **数学公式：**
     * ```
     * x = area.x + i * groupWidth + barGap + s * (barWidth + barGap)
     * y = area.y + area.h - ((val - yMin) / yRange) * area.h
     * ```
     *
     * @example
     * // 典型调用方式（由 NativeChartRenderer.render 调用）
     * const strategy = new BarStrategy();
     * strategy.render(ctx, {
     *   headers: ["产品", "Q1", "Q2"],
     *   data: [["A", 100, 200], ["B", 150, 180]]
     * }, {x:50, y:50, w:400, h:300}, {colors: ['#5470c6', '#91cc75']}, yScale);
     */
    render(ctx, data, area, style, yScale) {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Bar 开始渲染`, { dataLength: data.data?.length });

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const pixelRatio = this.getPixelRatio(ctx, area);
        const groupWidth = area.w / catCount;
        const barWidth = (groupWidth * 0.7) / seriesCount;
        const barGap = (groupWidth * 0.3) / (seriesCount + 1);
        const yMin = yScale.min;
        const yMax = yScale.max;
        const yRange = yMax - yMin || 1;

        ctx.strokeStyle = CONFIG.CHART_BAR_BORDER_COLOR;
        ctx.lineWidth = CONFIG.CHART_GRID_LINE_WIDTH * pixelRatio;

        for (let s = 0; s < seriesCount; s++) {
            ctx.fillStyle = style.colors[s % style.colors.length];

            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const barH = ((val - yMin) / yRange) * area.h;
                const x = area.x + i * groupWidth + barGap + s * (barWidth + barGap);
                const y = area.y + area.h - barH;

                ctx.fillRect(x, y, barWidth, barH);
                ctx.strokeRect(x, y, barWidth, barH);
            }
        }
    }

    /**
     * 检测鼠标点击是否命中柱状图元素
     *
     * @method hitTest
     * @param {number} px - 鼠标点击的 X 坐标（相对于 Canvas）
     * @param {number} py - 鼠标点击的 Y 坐标（相对于 Canvas）
     * @param {Object} data - 图表数据对象（同 render 方法）
     * @param {Object} area - 绘制区域坐标（同 render 方法）
     * @param {number} seriesCount - 系列数量（data.headers.length - 1）
     * @param {number} catCount - 类别数量（data.data.length）
     * @param {Object} [yScale] - Y轴刻度信息
     * @returns {Object|null} 点击命中的信息对象，未命中返回 null
     * @returns {string} returns.category - 类别名（如 "产品A"）
     * @returns {string} returns.seriesName - 系列名称（如 "Q1"）
     * @returns {number} returns.value - 数值
     * @returns {number} returns.pointX - 命中点的 X 坐标（用于定位 Tooltip）
     * @returns {number} returns.pointY - 命中点的 Y 坐标（用于定位 Tooltip）
     *
     * @description 检测算法：
     *
     * **核心逻辑：**
     * 1. 遍历所有系列和类别
     * 2. 重新计算每个柱体的位置和尺寸（与 render 保持一致）
     * 3. 判断 `(px, py)` 是否落在柱体矩形内
     * 4. 返回第一个匹配的结果
     *
     * **碰撞检测公式：**
     * ```javascript
     * if (px >= bx && px <= bx + barWidth && py >= by && py <= by + barH) {
     *     return hitInfo;  // 命中！
     * }
     * ```
     *
     * **性能优化：**
     * - 使用与 render 相同的计算逻辑确保一致性
     * - 找到第一个命中即返回（不继续搜索）
     * - 时间复杂度：O(seriesCount × catCount)
     *
     * @example
     * // 典型调用方式（由 NativeChartRenderer.hitTestDataPoint 调用）
     * const hitInfo = strategy.hitTest(mouseX, mouseY, data, plotArea, seriesCount, catCount, yScale);
     * if (hitInfo) {
     *     console.log(`选中: ${hitInfo.category} - ${hitInfo.seriesName}: ${hitInfo.value}`);
     *     // 显示 Tooltip...
     * }
     */
    hitTest(px, py, data, area, seriesCount, catCount, yScale) {
        const groupWidth = area.w / catCount;
        const barWidth = (groupWidth * 0.7) / seriesCount;
        const barGap = (groupWidth * 0.3) / (seriesCount + 1);
        const yMin = yScale.min;
        const yMax = yScale.max;
        const yRange = yMax - yMin || 1;

        for (let s = 0; s < seriesCount; s++) {
            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const barH = ((val - yMin) / yRange) * area.h;
                const bx = area.x + i * groupWidth + barGap + s * (barWidth + barGap);
                const by = area.y + area.h - barH;

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
