/**
 * @fileoverview 折线图渲染策略实现
 * @description 负责折线图/趋势图的 Canvas 渲染、点击检测和 Tooltip 格式化。
 *              支持多系列数据对比，包含数据点标记和线段吸附检测功能。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module strategies/LineStrategy
 * @see {@link BaseChartStrategy} 基类定义
 * @see {@link AreaStrategy} 面积图策略（继承此类）
 */

import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy.js";
import { CONFIG } from "../../../constants/config.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

/**
 * 折线图策略类
 *
 * @class LineStrategy
 * @extends BaseChartStrategy
 * @description 实现折线图的完整渲染逻辑，包括：
 *
 * **核心特性：**
 * - ✅ 多系列折线显示（支持多条曲线）
 * - ✅ 数据点标记（圆点标记每个数据点）
 * - ✅ 线段吸附检测（鼠标靠近线段时自动选中最近点）
 * - ✅ 平滑连接线绘制
 * - ✅ 自适应 Y 轴范围计算
 *
 * **数据格式要求：**
 * ```
 * data = {
 *   headers: ["时间", "系列1", "系列2", ...],
 *   data: [
 *     ["1月", 100, 200],   // 第一行数据
 *     ["2月", 150, 180],   // 第二行数据
 *     ["3月", 180, 220],   // 第三行数据
 *   ]
 * }
 * ```
 *
 * **适用场景：**
 * - 时间序列数据展示（股票走势、温度变化等）
 * - 趋势分析（销售增长、用户活跃度等）
 * - 多指标对比（多个产品销量趋势）
 * - 周期性数据观察（季节性波动）
 *
 * **视觉特性：**
 * - 线宽：根据点大小自适应（CONFIG.CHART_LINE_DOT_RADIUS > 3 ? 2 : CONFIG.CHART_TOOLTIP_BORDER_WIDTH）
 * - 点半径：CONFIG.CHART_LINE_DOT_RADIUS（默认4px）
 * - 点击容差：圆点半径 + HIT_RADIUS（12px）
 * - 线段吸附距离：10px
 *
 * **交互特性：**
 * - 支持点击数据点显示 Tooltip
 * - 支持点击线段附近区域（自动吸附到最近数据点）
 * - 双重检测机制：圆点检测 + 线段检测
 *
 * **数学算法：**
 * - 点到线段距离：使用向量投影公式
 * ```javascript
 * param = dot(A,C) + dot(B,D) / |C,D|²
 * if (param < 0) → 最近点是起点
 * if (param > 1) → 最近点是终点
 * else → 最近点是投影点
 * ```
 *
 * @example
 * // 创建折线图实例
 * const lineStrategy = new LineStrategy();
 * console.log(lineStrategy.type);  // "line"
 * console.log(lineStrategy.name);  // "折线图"
 */
export class LineStrategy extends BaseChartStrategy {
    /**
     * 创建折线图策略实例
     *
     * @constructor
     * @description 初始化策略类型和名称。
     *              类型标识符为 "line"，用于在 NativeChartRenderer 中查找该策略。
     */
    constructor(type = "line", name = "折线图") {
        super(type, name);
    }

    /**
     * 渲染折线图到 Canvas 上下文
     *
     * @method render
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {Object} data - 图表数据对象
     * @param {string[]} data.headers - 列标题数组（第一列为类别名，后续为系列名）
     * @param {Array<Array<number|string>>} data.data - 二维数据数组
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
     * **Step 1: 数据验证与初始化**
     * - 检查 seriesCount 和 catCount 是否有效
     * - 计算 Y 轴范围（使用传入的 yScale 或自动计算）
     * - 计算步长 stepX = area.w / catCount
     *
     * **Step 2: 绘制每条折线（外层循环）**
     * - 设置线条颜色和填充颜色（相同颜色）
     * - 根据点大小自适应设置线宽
     *
     * **Step 3: 构建路径（内层循环）**
     * - 计算每个数据点的坐标 `(x, y)`
     * - 使用 `moveTo` 和 `lineTo` 连接所有点
     * - 将坐标存入 points 数组供后续绘制圆点
     *
     * **Step 4: 绘制线条和数据点**
     * - `ctx.stroke()` 绘制连接线
     * - 循环调用 `arc()` 绘制每个数据点的圆点标记
     *
     * **坐标映射公式：**
     * ```
     * x = area.x + stepX * i + stepX / 2        // 居中对齐
     * y = area.y + area.h - ((val - yMin) / yRange) * area.h  // Y轴翻转
     * ```
     *
     * **性能优化：**
     * - 单次 beginPath 完成整条线的路径构建
     * - 批量绘制圆点（减少上下文切换）
     *
     * @example
     * // 典型调用方式（由 NativeChartRenderer.render 调用）
     * const strategy = new LineStrategy();
     * strategy.render(ctx, {
     *   headers: ["月份", "销售额", "利润"],
     *   data: [["1月", 100, 20], ["2月", 150, 30]]
     * }, {x:50, y:50, w:400, h:300}, {colors: ['#5470c6', '#91cc75']}, yScale);
     */
    render(ctx, data, area, style, yScale) {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Line 开始渲染`);

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;
        const stepX = area.w / catCount;

        for (let s = 0; s < seriesCount; s++) {
            ctx.strokeStyle = style.colors[s % style.colors.length];
            ctx.fillStyle = style.colors[s % style.colors.length];
            ctx.lineWidth = CONFIG.CHART_LINE_DOT_RADIUS > 3 ? 2 : CONFIG.CHART_TOOLTIP_BORDER_WIDTH;

            ctx.beginPath();
            let firstPoint = true;
            const points = [];

            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const x = area.x + stepX * i + stepX / 2;
                const y = area.y + area.h - ((val - yMin) / yRange) * area.h;
                points.push({ x, y });

                if (firstPoint) {
                    ctx.moveTo(x, y);
                    firstPoint = false;
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.stroke();

            for (const pt of points) {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, CONFIG.CHART_LINE_DOT_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /**
     * 检测鼠标点击是否命中折线图元素（双重检测机制）
     *
     * @method hitTest
     * @param {number} px - 鼠标点击的 X 坐标（相对于 Canvas）
     * @param {number} py - 鼠标点击的 Y 坐标（相对于 Canvas）
     * @param {Object} data - 图表数据对象（同 render 方法）
     * @param {Object} area - 绘制区域坐标（同 render 方法）
     * @param {number} seriesCount - 系列数量
     * @param {number} catCount - 类别数量
     * @param {Object} [yScale] - Y轴刻度信息
     * @returns {Object|null} 点击命中的信息对象，未命中返回 null
     * @returns {string} returns.category - 类别名（如 "1月"）
     * @returns {string} returns.seriesName - 系列名称（如 "销售额"）
     * @returns {number} returns.value - 数值
     * @returns {number} returns.pointX - 命中点的 X 坐标
     * @returns {number} returns.pointY - 命中点的 Y 坐标
     *
     * @description 检测算法（**双重检测机制**）：
     *
     * **第一层：圆点精确检测**
     * - 遍历所有数据点
     * - 计算鼠标到每个点的欧氏距离平方
     * - 若距离 ≤ dotR² 且比之前的最小距离更小，则记录该命中点
     * - 选择距离最近的命中点作为最终结果
     *
     * **第二层：线段吸附检测（仅在未命中圆点时触发）**
     * - 遍历相邻的两个点组成的线段
     * - 使用向量投影计算点到线段的垂直距离
     * - 若距离 ≤ lineSnapDist（10px），则吸附到较近的端点
     *
     * **优先级规则：**
     * 1. 圆点检测优先（更精确）
     * 2. 线段检测兜底（提升用户体验）
     * 3. 多个候选时选择距离最近的
     * 4. 找到第一个有效结果即停止搜索（按系列顺序）
     *
     * **数学公式（点到线段距离）：**
     * ```javascript
     * 向量 A = (px - x1, py - y1)
     * 向量 C = (x2 - x1, y2 - y1)
     * 投影参数 t = (A·C) / |C|²
     *
     * if (t < 0) → 最近点 = P1 (起点)
     * if (t > 1) → 最近点 = P2 (终点)
     * else → 最近点 = P1 + t * C (投影点)
     * ```
     *
     * **性能优化：**
     * - 提前终止：找到第一个命中即返回
     * - 距离比较使用平方避免开方运算（dotR * dotR vs Math.sqrt）
     * - 线段检测仅在前一层无结果时执行
     *
     * @example
     * // 典型调用方式
     * const hitInfo = strategy.hitTest(mouseX, mouseY, data, plotArea, seriesCount, catCount, yScale);
     * if (hitInfo) {
     *     console.log(`选中: ${hitInfo.category} - ${hitInfo.seriesName}: ${hitInfo.value}`);
     *     showTooltip(hitInfo);  // 显示提示框
     * }
     */
    hitTest(px, py, data, area, seriesCount, catCount, yScale) {
        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;
        const stepX = area.w / catCount;
        const dotR = Math.max(CONFIG.CHART_LINE_DOT_RADIUS || 4, HIT_RADIUS);
        const lineSnapDist = 10;

        let closestHit = null;
        let minDistSq = dotR * dotR;

        for (let s = 0; s < seriesCount; s++) {
            const points = [];

            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const dx = area.x + stepX * i + stepX / 2;
                const dy = area.y + area.h - ((val - yMin) / yRange) * area.h;
                points.push({ x: dx, y: dy, val, idx: i });

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

            if (!closestHit && points.length > 1) {
                for (let i = 0; i < points.length - 1; i++) {
                    const p1 = points[i];
                    const p2 = points[i + 1];

                    const dist = this.pointToSegmentDistance(px, py, p1.x, p1.y, p2.x, p2.y);

                    if (dist <= lineSnapDist) {
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

            if (closestHit) break;
        }

        return closestHit;
    }

    /**
     * 计算数据中的最小 Y 值
     *
     * @method getYMin
     * @param {Object} data - 图表数据对象
     * @returns {number} 最小数值，若无有效数据则返回 0
     *
     * @description 遍历所有数据列（跳过类别列 index=0），
     *              返回最小的数值。用于自适应 Y 轴范围。
     *
     * @example
     * const minVal = strategy.getYMin({data: [["A", 10, 20], ["B", 5, 15]]});
     * console.log(minVal);  // 5
     */
    getYMin(data) {
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
     * 计算数据中的最大 Y 值
     *
     * @method getYMax
     * @param {Object} data - 图表数据对象
     * @returns {number} 最大数值，若无有效数据则返回 1
     *
     * @description 遍历所有数据列（跳过类别列 index=0），
     *              返回最大的数值。用于自适应 Y 轴范围。
     *
     * @example
     * const maxVal = strategy.getYMax({data: [["A", 10, 20], ["B", 5, 15]]});
     * console.log(maxVal);  // 20
     */
    getYMax(data) {
        let max = -Infinity;
        for (const row of data.data) {
            for (let c = 1; c < row.length; c++) {
                const v = Number(row[c]);
                if (!isNaN(v) && v > max) max = v;
            }
        }
        return max === -Infinity ? 1 : max;
    }

    /**
     * 计算点到线段的最短距离（向量投影法）
     *
     * @method pointToSegmentDistance
     * @param {number} px - 点的 X 坐标
     * @param {number} py - 点的 Y 坐标
     * @param {number} x1 - 线段起点的 X 坐标
     * @param {number} y1 - 线段起点的 Y 坐标
     * @param {number} x2 - 线段终点的 X 坐标
     * @param {number} y2 - 线段终点的 Y 坐标
     * @returns {number} 点到线段的最短欧氏距离
     *
     * @description 使用向量投影算法计算点到线段的最短距离：
     *
     * **算法步骤：**
     * 1. 构建向量：A=(px-x1, py-y1), C=(x2-x1, y2-y1)
     * 2. 计算投影参数：t = (A·C) / |C|²
     * 3. 根据 t 的位置确定最近点：
     *    - t < 0: 最近点是线段起点 P1
     *    - t > 1: 最近点是线段终点 P2
     *    - 0≤t≤1: 最近点是投影点 P1 + t*C
     * 4. 计算点到最近点的欧氏距离
     *
     * **数学原理：**
     * 该方法基于向量投影定理，将问题转化为求参数 t，
     * 再通过分类讨论确定最近点的位置，最后计算距离。
     *
     * **应用场景：**
     * - 线段吸附检测（hitTest 中使用）
     * - 几何碰撞检测
     * - 路径规划算法
     *
     * **时间复杂度：** O(1)（常数时间）
     *
     * @example
     * // 计算点(5,5)到线段(0,0)-(10,0)的距离
     * const dist = strategy.pointToSegmentDistance(5, 5, 0, 0, 10, 0);
     * console.log(dist);  // 5.0 (垂直距离)
     *
     * @example
     * // 计算点(-1,0)到线段(0,0)-(10,0)的距离（在线段外）
     * const dist = strategy.pointToSegmentDistance(-1, 0, 0, 0, 10, 0);
     * console.log(dist);  // 1.0 (到起点的距离)
     */
    pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;

        return Math.sqrt(dx * dx + dy * dy);
    }
}
