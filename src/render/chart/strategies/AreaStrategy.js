/**
 * @fileoverview 面积图渲染策略实现
 * @description 负责面积图/区域图的 Canvas 渲染、点击检测和 Tooltip 格式化。
 *              继承自折线图策略，在折线下方填充半透明区域，适用于展示数据累积趋势。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module strategies/AreaStrategy
 * @see {@link LineStrategy} 父类（折线图策略）
 * @see {@link BaseChartStrategy} 基类定义
 */

import { LineStrategy } from "./LineStrategy.js";
import { CONFIG } from "../../../constants/config.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

/**
 * 面积图策略类
 *
 * @class AreaStrategy
 * @extends LineStrategy
 * @description 实现面积图的完整渲染逻辑，继承折线图的所有特性并添加：
 *
 * **核心特性：**
 * - ✅ 半透明区域填充（颜色 + "40" 表示 25% 不透明度）
 * - ✅ 折线边框绘制（与父类相同的线条样式）
 * - ✅ 多系列堆叠显示（从后向前绘制避免遮挡）
 * - ✅ 继承父类的点击检测逻辑（圆点 + 线段吸附）
 * - ✅ 继承父类的 Y 轴范围计算方法
 *
 * **与父类 LineStrategy 的区别：**
 * | 特性 | LineStrategy | AreaStrategy |
 * |------|-------------|--------------|
 * | **填充** | 无 | 半透明区域 |
 * | **绘制顺序** | 从前向后 | 从后向前 |
 * | **路径构建** | 单线条 | 封闭多边形 |
 * | **线宽** | 自适应 | 固定值 |
 * | **hitTest** | 自身实现 | 继承父类 |
 *
 * **数据格式要求：**
 * ```
 * data = {
 *   headers: ["时间", "系列1", "系列2", ...],
 *   data: [
 *     ["1月", 100, 200],
 *     ["2月", 150, 180],
 *     ["3月", 180, 220],
 *   ]
 * }
 * ```
 *
 * **适用场景：**
 * - 时间序列趋势分析（带面积强调）
 * - 数据量变化对比（突出总量）
 * - 多系列叠加展示（如收入+成本）
 * - 波动性可视化（面积大小直观反映）
 *
 * **视觉特性：**
 * - 填充颜色：原色 + "40"（25% 不透明度，如 "#5470c640"）
 * - 边框颜色：纯色（如 "#5470c6"）
 * - 边框宽度：CONFIG.CHART_AREA_LINE_WIDTH
 * - 填充路径：封闭多边形（包含基线）
 *
 * **数学公式：**
 * ```
 * 填充区域 = [起点] → [所有数据点] → [终点在基线上投影] → closePath()
 * 基线位置 = area.y + area.h (底部)
 *
 * 面积计算（视觉上）= ∫(y(t) - baseline) dt
 * ```
 *
 * **继承关系：**
 * ```
 * BaseChartStrategy
 *     └── LineStrategy (折线图)
 *             └── AreaStrategy (面积图) ← 当前类
 * ```
 *
 * **性能优化：**
 * - 复用父类的 hitTest 方法（无需重写）
 * - 复用父类的 getYMin/getYMax 方法
 * - 从后向前绘制避免前面的系列被遮挡
 *
 * @example
 * // 创建面积图实例
 * const areaStrategy = new AreaStrategy();
 * console.log(areaStrategy.type);  // "area"
 * console.log(areaStrategy.name);  // "面积图"
 */
export class AreaStrategy extends LineStrategy {
    /**
     * 创建面积图策略实例
     *
     * @constructor
     * @description 初始化策略类型和名称。
     *              类型标识符为 "area"，用于在 NativeChartRenderer 中查找该策略。
     *              调用父类构造函数传入类型和名称。
     */
    constructor() {
        super("area", "面积图");
    }

    /**
     * 渲染面积图到 Canvas 上下文（**重写父类 render 方法**）
     *
     * @method render
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {Object} data - 图表数据对象
     * @param {string[]} data.headers - 列标题数组
     * @param {Array<Array<number|string>>} data.data - 二维数据数组
     * @param {Object} area - 绘制区域坐标
     * @param {number} area.x - 区域左上角 X 坐标
     * @param {number} area.y - 区域左上角 Y 坐标
     * @param {number} area.w - 区域宽度
     * @param {number} area.h - 区域高度
     * @param {Object} style - 样式配置
     * @param {string[]} style.colors - 颜色数组
     * @param {Object} [yScale] - Y轴刻度信息
     * @param {number} yScale.min - Y轴最小值
     * @param {number} yScale.max - Y轴最大值
     *
     * @description 渲染流程（**与父类的关键区别**）：
     *
     * **Step 1: 数据验证（同父类）**
     * - 检查 seriesCount 和 catCount 是否有效
     * - 计算 Y 轴范围和步长 stepX
     *
     * **Step 2: 反向遍历系列（关键优化）**
     * ```javascript
     * for (let s = seriesCount - 1; s >= 0; s--)
     * // 从后向前绘制，确保前面的系列不被后面的遮挡
     * ```
     *
     * **Step 3: 构建填充路径（核心差异）**
     * ```
     * 路径构建顺序：
     * 1. moveTo(第一个点的 X, 基线 Y)       // 起点
     * 2. lineTo(每个数据点)                  // 上边界
     * 3. lineTo(最后一个点的 X, 基线 Y)      // 右下角
     * 4. closePath()                         // 回到起点（形成封闭区域）
     * 5. fill()                              // 填充半透明颜色
     * ```
     *
     * **Step 4: 绘制边框线条（复用父类逻辑）**
     * - 第二次 beginPath 构建线条路径
     * - 只绘制数据点之间的连线（不含基线）
     * - stroke() 描边
     *
     * **坐标映射公式：**
     * ```javascript
     * x = area.x + stepX * i + stepX / 2        // 居中对齐
     * y = area.y + area.h - ((val - yMin) / yRange) * area.h  // Y轴翻转
     * baseline = area.y + area.h               // 基线位置（底部）
     * ```
     *
     * **颜色处理：**
     * ```javascript
     * ctx.fillStyle = color + "40";  // 如 "#5470c6" → "#5470c640" (25%不透明度)
     * ctx.strokeStyle = color;       // 边框使用纯色
     * ```
     *
     * **性能考虑：**
     * - 每个系列需要两次 beginPath（填充 + 线条）
     * - 但避免了复杂的 clip 操作
     * - 反向遍历确保正确的层叠效果
     *
     * @example
     * // 典型调用方式
     * const strategy = new AreaStrategy();
     * strategy.render(ctx, {
     *   headers: ["月份", "销售额", "利润"],
     *   data: [["1月", 100, 20], ["2月", 150, 30]]
     * }, {x:50, y:50, w:400, h:300}, {colors: ['#5470c6', '#91cc75']}, yScale);
     */
    render(ctx, data, area, style, yScale) {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Area 开始渲染`);

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;
        const stepX = area.w / catCount;

        ctx.lineWidth = CONFIG.CHART_AREA_LINE_WIDTH;

        for (let s = seriesCount - 1; s >= 0; s--) {
            const color = style.colors[s % style.colors.length];
            ctx.fillStyle = color + "40";
            ctx.strokeStyle = color;

            const baseline = area.y + area.h;

            ctx.beginPath();
            ctx.moveTo(area.x + stepX / 2, baseline);

            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const x = area.x + stepX * i + stepX / 2;
                const y = area.y + area.h - ((val - yMin) / yRange) * area.h;
                ctx.lineTo(x, y);
            }

            ctx.lineTo(area.x + stepX * (catCount - 1) + stepX / 2, baseline);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            let firstPoint = true;
            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const x = area.x + stepX * i + stepX / 2;
                const y = area.y + area.h - ((val - yMin) / yRange) * area.h;

                if (firstPoint) {
                    ctx.moveTo(x, y);
                    firstPoint = false;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }
    }
}
