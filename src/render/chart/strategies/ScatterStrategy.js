/**
 * @fileoverview 散点图渲染策略实现
 * @description 负责散点图/气泡图的 Canvas 渲染、点击检测和 Tooltip 格式化。
 *              使用圆点展示二维数据分布，适用于相关性分析和数据聚类场景。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module strategies/ScatterStrategy
 * @see {@link BaseChartStrategy} 基类定义
 */

import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy.js";
import { CONFIG } from "../../../constants/config.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

/**
 * 散点图策略类
 * 
 * @class ScatterStrategy
 * @extends BaseChartStrategy
 * @description 实现散点图的完整渲染逻辑，包括：
 * 
 * **核心特性：**
 * - ✅ 双轴数据映射（X轴和Y轴都使用数值）
 * - ✅ 圆点标记绘制（使用 arc() 方法）
 * - ✅ 自动计算 X/Y 轴范围（基于数据极值）
 * - ✅ 多系列支持（不同颜色区分）
 * - ✅ 精确的圆形点击检测
 * 
 * **与其他图表的关键区别：**
 * | 图表类型 | X轴数据 | Y轴数据 | 数据映射 |
 * |---------|--------|--------|----------|
 * | **柱状图** | 类别索引 | 数值 | X=类别位置, Y=数值 |
 * | **折线图** | 类别索引 | 数值 | X=类别位置, Y=数值 |
 * | **散点图** | 数值 | 数值 | X=X数值, Y=Y数值 |
 * 
 * **数据格式要求：**
 * ```
 * data = {
 *   headers: ["X轴", "系列1", "系列2", ...],
 *   data: [
 *     [1.5, 100, 200],  // 第一行：(x=1.5, y1=100, y2=200)
 *     [2.3, 150, 180],  // 第二行：(x=2.3, y1=150, y2=180)
 *     [3.7, 180, 220],  // 第三行：(x=3.7, y1=180, y2=220)
 *   ]
 * }
 * ```
 * 
 * **适用场景：**
 * - 相关性分析（身高 vs 体重、价格 vs 销量等）
 * - 数据聚类观察（用户分群、产品分类等）
 * - 异常值检测（离群点识别）
 * - 分布趋势探索（正态分布、偏态分布等）
 * 
 * **视觉特性：**
 * - 点半径：CONFIG.CHART_SCATTER_DOT_RADIUS（默认4px）
 * - 点形状：实心圆（fill() 填充）
 * - 颜色分配：按系列循环使用 style.colors
 * - 点击容差：max(dotR, HIT_RADIUS)（12px）
 * 
 * **数学公式：**
 * ```
 * X坐标 = area.x + ((xVal - xMin) / xRange) × area.w    // X轴归一化
 * Y坐标 = area.y + area.h - ((yVal - yMin) / yRange) × area.h  // Y轴归一化+翻转
 
 * 轴范围计算：
 * xMin = min(所有行的第一列)
 * xMax = max(所有行的第一列)
 * yMin = min(所有Y值列) 或 yScale.min
 * yMax = max(所有Y值列) 或 yScale.max
 * ```
 * 
 * **性能优化：**
 * - 单次遍历完成所有点的绘制
 * - 提前终止点击检测（找到第一个命中即返回）
 * - 使用距离平方比较避免开方运算
 * 
 * @example
 * // 创建散点图实例
 * const scatterStrategy = new ScatterStrategy();
 * console.log(scatterStrategy.type);  // "scatter"
 * console.log(scatterStrategy.name);  // "散点图"
 */
export class ScatterStrategy extends BaseChartStrategy {
    /**
     * 创建散点图策略实例
     *
     * @constructor
     * @description 初始化策略类型和名称。
     *              类型标识符为 "scatter"，用于在 NativeChartRenderer 中查找该策略。
     */
    constructor() {
        super("scatter", "散点图");
    }

    /**
     * 渲染散点图到 Canvas 上下文
     *
     * @method render
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {Object} data - 图表数据对象
     * @param {string[]} data.headers - 列标题数组（第一列为X轴，后续为系列名）
     * @param {Array<Array<number>>} data.data - 二维数值数组（每行第一个元素为X值）
     * @param {Object} area - 绘制区域坐标
     * @param {number} area.x - 区域左上角 X 坐标
     * @param {number} area.y - 区域左上角 Y 坐标
     * @param {number} area.w - 区域宽度
     * @param {number} area.h - 区域高度
     * @param {Object} style - 样式配置
     * @param {string[]} style.colors - 颜色数组（每个系列一个颜色）
     * @param {Object} [yScale] - Y轴刻度信息（可选，若不传则自动计算）
     * @param {number} yScale.min - Y轴最小值
     * @param {number} yScale.max - Y轴最大值
     *
     * @description 渲染流程：
     *
     * **Step 1: 数据验证与范围计算**
     * - 检查 seriesCount 和 catCount 是否有效
     * - 提取所有 X 值：`allX = data.data.map(row => row[0])`
     * - 提取所有 Y 值：`allY = data.data.flatMap(row => row.slice(1))`
     * - 计算 X/Y 轴的最小值和最大值
     * - 计算轴范围：`range = max - min || 1`（避免除零）
     *
     * **Step 2: 绘制每个系列的散点**
     * - 外层循环：遍历系列（s），设置填充颜色
     * - 内层循环：遍历数据点（i）
     * - 计算每个点的屏幕坐标 (x, y)
     * - 使用 `arc()` 绘制实心圆点
     *
     * **坐标映射公式：**
     * ```javascript
     * // X轴：线性归一化到 [area.x, area.x + area.w]
     * x = area.x + ((xVal - xMin) / xRange) * area.w;
     *
     * // Y轴：线性归一化并翻转（Canvas Y轴向下为正）
     * y = area.y + area.h - ((yVal - yMin) / yRange) * area.h;
     * ```
     *
     * **特殊处理：**
     * - 无效数值处理：`Number(val) || 0`（NaN → 0）
     * - 范围保护：`xRange || 1`, `yRange || 1`（避免除以零）
     * - 支持外部传入的 yScale（与全局刻度保持一致）
     *
     * **性能考虑：**
     * - 所有点使用相同的半径（CONFIG.CHART_SCATTER_DOT_RADIUS）
     * - 不绘制边框（仅 fill()，无 stroke()）
     * - 批量操作减少上下文切换
     *
     * @example
     * // 典型调用方式
     * const strategy = new ScatterStrategy();
     * strategy.render(ctx, {
     *   headers: ["身高", "体重", "年龄"],
     *   data: [[1.70, 65, 25], [1.75, 72, 30], [1.80, 78, 35]]
     * }, {x:50, y:50, w:400, h:300}, {colors: ['#5470c6', '#91cc75']}, yScale);
     */
    render(ctx, data, area, style, yScale) {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Scatter 开始渲染`);

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const allX = data.data.map((row) => Number(row[0]) || 0);
        const allY = data.data.flatMap((row) => row.slice(1).map((v) => Number(v) || 0));
        const xMin = Math.min(...allX);
        const xMax = Math.max(...allX);
        const yMin = yScale ? yScale.min : Math.min(...allY);
        const yMax = yScale ? yScale.max : Math.max(...allY);
        const xRange = xMax - xMin || 1;
        const yRange = yMax - yMin || 1;

        for (let s = 0; s < seriesCount; s++) {
            ctx.fillStyle = style.colors[s % style.colors.length];

            for (let i = 0; i < catCount; i++) {
                const xVal = Number(data.data[i][0]) || 0;
                const yVal = Number(data.data[i][s + 1]) || 0;
                const x = area.x + ((xVal - xMin) / xRange) * area.w;
                const y = area.y + area.h - ((yVal - yMin) / yRange) * area.h;

                ctx.beginPath();
                ctx.arc(x, y, CONFIG.CHART_SCATTER_DOT_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /**
     * 检测鼠标点击是否命中散点图的数据点
     *
     * @method hitTest
     * @param {number} px - 鼠标点击的 X 坐标（相对于 Canvas）
     * @param {number} py - 鼠标点击的 Y 坐标（相对于 Canvas）
     * @param {Object} data - 图表数据对象（同 render 方法）
     * @param {Object} area - 绘制区域坐标（同 render 方法）
     * @param {number} seriesCount - 系列数量
     * @param {number} catCount - 数据点数量
     * @param {Object} [yScale] - Y轴刻度信息
     * @returns {Object|null} 点击命中的信息对象，未命中返回 null
     * @returns {string|number} returns.category - X轴数值（如 1.75）
     * @returns {string} returns.seriesName - 系列名称（如 "体重"）
     * @returns {number} returns.value - Y轴数值
     * @returns {number} returns.pointX - 命中点的 X 坐标
     * @returns {number} returns.pointY - 命中点的 Y 坐标
     *
     * @description 检测算法（**圆形区域判定**）：
     *
     * **核心逻辑：**
     * 1. 重新计算 X/Y 轴范围（与 render 保持一致）
     * 2. 遍历所有系列和数据点
     * 3. 对每个点重新计算其屏幕坐标 (dx, dy)
     * 4. 判断鼠标位置是否落在以该点为中心、dotR 为半径的圆内
     * 5. 返回第一个命中的结果
     *
     * **碰撞检测公式：**
     * ```javascript
     * // 使用距离平方避免开方运算（性能优化）
     * distSq = (px - dx)² + (py - dy)²
     * if (distSq ≤ dotR²) {
     *     return hitInfo;  // 命中！
     * }
     *
     * // dotR = max(CONFIG.CHART_SCATTER_DOT_RADIUS, HIT_RADIUS)
     * //       = max(4, 12) = 12px（增大点击容差）
     * ```
     *
     * **返回值的特殊性：**
     * - `category` 返回的是 X 轴**数值**（不是类别名）
     * - 这是因为散点图的 X 轴是连续数值，而非离散类别
     * - 例如：category = 1.75 表示 X 坐标为 1.75 的数据点
     *
     * **性能优化：**
     * - 使用距离平方比较（避免 Math.sqrt 开方）
     * - 找到第一个命中即返回（提前终止）
     * - 时间复杂度：O(seriesCount × catCount)
     *
     * @example
     * // 典型调用方式
     * const hitInfo = strategy.hitTest(mouseX, mouseY, data, plotArea, seriesCount, catCount, yScale);
     * if (hitInfo) {
     *     console.log(`选中: X=${hitInfo.category}, ${hitInfo.seriesName}=${hitInfo.value}`);
     *     showTooltip(hitInfo);
     * }
     */
    hitTest(px, py, data, area, seriesCount, catCount, yScale) {
        const allX = data.data.map((row) => Number(row[0]) || 0);
        const allY = data.data.flatMap((row) => row.slice(1).map((v) => Number(v) || 0));
        const xMin = Math.min(...allX);
        const xMax = Math.max(...allX);
        const yMin = yScale ? yScale.min : Math.min(...allY);
        const yMax = yScale ? yScale.max : Math.max(...allY);
        const xRange = xMax - xMin || 1;
        const yRange = yMax - yMin || 1;
        const dotR = Math.max(CONFIG.CHART_SCATTER_DOT_RADIUS, HIT_RADIUS);

        for (let s = 0; s < seriesCount; s++) {
            for (let i = 0; i < catCount; i++) {
                const xVal = Number(data.data[i][0]) || 0;
                const yVal = Number(data.data[i][s + 1]) || 0;
                const dx = area.x + ((xVal - xMin) / xRange) * area.w;
                const dy = area.y + area.h - ((yVal - yMin) / yRange) * area.h;

                if ((px - dx) * (px - dx) + (py - dy) * (py - dy) <= dotR * dotR) {
                    return {
                        category: String(xVal),
                        seriesName: String(data.headers[s + 1] || ""),
                        value: yVal,
                        pointX: dx,
                        pointY: dy,
                    };
                }
            }
        }
        return null;
    }
}
