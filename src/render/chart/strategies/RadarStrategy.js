/**
 * @fileoverview 雷达图渲染策略实现
 * @description 负责雷达图的 Canvas 渲染、点击检测和 Tooltip 格式化。
 *              使用多边形网格和多维数据映射展示多个指标的对比情况，
 *              适用于能力评估、性能分析等场景。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module strategies/RadarStrategy
 * @see {@link BaseChartStrategy} 基类定义
 */

import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy.js";
import { CONFIG } from "../../../constants/config.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

/**
 * 雷达图策略类
 * 
 * @class RadarStrategy
 * @extends BaseChartStrategy
 * @description 实现雷达图的完整渲染逻辑，包括：
 * 
 * **核心特性：**
 * - ✅ 多边形网格（5层同心多边形，从中心向外扩展）
 * - ✅ 多维度支持（3个及以上维度/指标）
 * - ✅ 多系列对比（不同颜色区分不同数据系列）
 * - ✅ 极坐标映射（角度→维度，半径→数值）
 * - ✅ 半透明填充 + 边框描边
 * - ✅ 数据点标记（圆点标记每个顶点）
 * - ✅ 无坐标轴设计（isAxisFree() = true）
 * 
 * **数据格式要求：**
 * ```
 * data = {
 *   headers: ["维度", "系列1", "系列2"],
 *   data: [
 *     ["速度", 85, 90],    // 维度1的值
 *     ["力量", 70, 65],    // 维度2的值
 *     ["耐力", 90, 80],    // 维度3的值
 *     ["敏捷", 75, 85],    // 维度4的值
 *     ["智力", 95, 88],    // 维度5的值
 *   ]
 * }
 * 
 * style = {
 *   indicators: [
 *     { max: 100 },  // 每个系列的最大值（可选）
 *   ]
 * }
 * ```
 * 
 * **适用场景：**
 * - 能力雷达图（游戏角色属性对比）
 * - 产品竞争力分析（多维度评分）
 * - 团队成员能力评估（技能矩阵）
 * - KPI 综合评价（多维绩效）
 * - 学生综合素质分析（德智体美劳）
 * 
 * **视觉特性：**
 * - 圆心位置：(cx, cy) = (区域中心X, 区域中心Y)
 * - 最大半径：radius = min(width, height) × 38%
 * - 网格层数：5层同心多边形
 * - 角度步长：angleStep = 2π / dimCount（均匀分布）
 * - 起始角度：-π/2（12点钟方向）
 * - 颜色方案：6色循环（#5470c6, #91cc75, #fac858, ...）
 * - 填充透明度：15%（globalAlpha = 0.15）
 * - 边框宽度：2px
 * - 数据点半径：4px
 * 
 * **数学公式：**
 * ```
 * 角度计算：
 * angle(i) = -π/2 + i × angleStep  // 从12点钟方向顺时针旋转
 
 * 坐标映射：
 * x(i) = cx + radius × ratio × cos(angle(i))
 * y(i) = cy + radius × ratio × sin(angle(i))
 * 
 * 归一化比例：
 * ratio = clamp(value / maxValue, 0, 1.2)  // 允许超限20%
 * ```
 * 
 * **交互特性：**
 * - 支持点击数据点显示详细信息
 * - 使用极坐标转换进行命中检测
 * - 自动计算百分比和最大值
 * - 缓存渲染数据用于 hitTest 复用
 * 
 * **注意事项：**
 * - 至少需要3个维度才能形成有效多边形
 * - 数值超过最大值的点会超出最外层网格
 * - 使用私有字段 #lastRenderData 缓存渲染状态
 * - 点击检测范围：距离圆心 [5, radius+10] 像素内
 * 
 * @example
 * // 创建雷达图实例
 * const radarStrategy = new RadarStrategy();
 * console.log(radarStrategy.type);  // "radar"
 * console.log(radarStrategy.name);  // "雷达图"
 */
export class RadarStrategy extends BaseChartStrategy {
    /**
     * 创建雷达图策略实例
     *
     * @constructor
     * @description 初始化策略类型和名称。
     *              类型标识符为 "radar"，用于在 NativeChartRenderer 中查找该策略。
     */
    constructor() {
        super("radar", "雷达图");
    }

    /**
     * 判断是否为无坐标轴图表
     *
     * @method isAxisFree
     * @returns {boolean} 始终返回 true（雷达图不需要坐标轴）
     */
    isAxisFree() {
        return true;
    }

    /**
     * 渲染雷达图到 Canvas 上下文
     *
     * @method render
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {Object} data - 图表数据对象
     * @param {string[]} data.headers - 列标题数组（第一列为维度名，后续为系列名）
     * @param {Array<Array<number|string>>} data.data - 二维数据数组
     * @param {Object} area - 绘制区域坐标
     * @param {number} area.x - 区域左上角 X 坐标
     * @param {number} area.y - 区域左上角 Y 坐标
     * @param {number} area.w - 区域宽度
     * @param {number} area.h - 区域高度
     * @param {Object} style - 样式配置
     * @param {Array<Object>} [style.indicators] - 各系列的配置
     * @param {number} [style.indicators[].max] - 该系列的最大值
     * @param {*} yScale - 未使用（保留兼容性）
     *
     * @description 渲染流程：
     *
     * **Step 1: 数据预处理**
     * - 提取维度名称 indicators（每行第一个元素）
     * - 提取数值矩阵 values（每行后续元素）
     * - 计算每个系列的最大值 maxValues（用于归一化）
     * - 至少需要3个维度和1个系列才渲染
     *
     * **Step 2: 计算布局参数**
     * ```javascript
     * cx = area.x + area.w / 2           // 圆心 X
     * cy = area.y + area.h / 2           // 圆心 Y
     * radius = min(area.w, area.h) × 38%  // 最大半径
     * angleStep = 2π / dimCount          // 角度步长
     * levels = 5                         // 网格层数
     * ```
     *
     * **Step 3: 绘制背景网格（5层同心多边形）**
     * - 从 level=1 到 5 循环绘制
     * - 每层半径：`r = radius × level / 5`
     * - 连接所有顶点形成闭合多边形
     * - 灰色细线描边（#e0e0e0, lineWidth=1）
     *
     * **Step 4: 绘制轴线（从圆心到各顶点）**
     * - 共 dimCount 条轴线
     * - 起点：(cx, cy)
     * - 终点：(cx + radius×cos(angle), cy + radius×sin(angle))
     *
     * **Step 5: 绘制维度标签**
     * - 位于最外层外侧 20px 处
     * - 字体使用 CONFIG 默认设置
     * - 居中对齐
     *
     * **Step 6: 绘制数据系列（循环每个系列）**
     * - 计算该系列所有点的坐标
     * - 绘制半透明填充区域（alpha=0.15）
     * - 绘制边框线（2px 宽）
     * - 绘制数据点圆点（半径=4px）
     * - 不同系列使用不同颜色
     *
     * **Step 7: 缓存渲染数据**
     * - 将关键参数存入 #lastRenderData
     * - 用于 hitTest 方法复用
     *
     * **性能优化：**
     * - 单次遍历完成所有层的绘制
     * - 使用缓存避免重复计算
     * - 批量设置绘图属性减少切换
     *
     * @example
     * // 典型调用方式
     * const strategy = new RadarStrategy();
     * strategy.render(ctx, {
     *   headers: ["维度", "产品A", "产品B"],
     *   data: [
     *     ["性能", 9, 7],
     *     ["易用性", 8, 9],
     *     ["价格", 6, 8],
     *     ["质量", 9, 8],
     *   ]
     * }, {x:50, y:50, w:400, h:400}, {});
     */
    render(ctx, data, area, style) {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Radar 开始渲染`);

        const dimCount = data.data.length;
        const seriesCount = data.headers.length - 1;
        if (dimCount < 3 || seriesCount <= 0) return;

        const indicators = data.data.map((row) => String(row?.[0] || ""));
        const values = data.data.map((row) => row.slice(1).map((v) => Number(v) || 0));

        const maxValues = [];
        for (let j = 0; j < seriesCount; j++) {
            let maxVal = Math.max(...values.map((row) => row[j]));
            maxValues[j] = style?.indicators?.[j]?.max || (maxVal > 0 ? maxVal * 1.2 : 100);
        }

        const cx = area.x + area.w / 2;
        const cy = area.y + area.h / 2;
        const radius = Math.min(area.w, area.h) * 0.38;
        const angleStep = (Math.PI * 2) / dimCount;
        const levels = 5;

        ctx.lineWidth = 1;
        ctx.strokeStyle = "#e0e0e0";
        for (let level = 1; level <= levels; level++) {
            const r = (radius * level) / levels;
            ctx.beginPath();
            for (let i = 0; i <= dimCount; i++) {
                const angle = -Math.PI / 2 + i * angleStep;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        }

        for (let i = 0; i < dimCount; i++) {
            const angle = -Math.PI / 2 + i * angleStep;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
            ctx.stroke();
        }

        ctx.font = `${CONFIG.CHART_FONT_SIZE}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.fillStyle = "#333";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < dimCount; i++) {
            const angle = -Math.PI / 2 + i * angleStep;
            const labelRadius = radius + 20;
            const x = cx + labelRadius * Math.cos(angle);
            const y = cy + labelRadius * Math.sin(angle);
            ctx.fillText(indicators[i], x, y);
        }

        const colors = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272"];

        for (let j = 0; j < seriesCount; j++) {
            const color = colors[j % colors.length];
            const points = [];

            for (let i = 0; i < dimCount; i++) {
                const val = values[i][j];
                const maxVal = maxValues[j] || 100;
                const ratio = Math.min(val / maxVal, 1.2);

                const angle = -Math.PI / 2 + i * angleStep;
                const r = radius * ratio;
                points.push({
                    x: cx + r * Math.cos(angle),
                    y: cy + r * Math.sin(angle),
                    value: val,
                    indicator: indicators[i],
                    seriesName: data.headers[j + 1],
                    index: i,
                });
            }

            ctx.globalAlpha = 0.15;
            ctx.fillStyle = color;
            ctx.beginPath();
            points.forEach((p, idx) => {
                if (idx === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.fill();

            ctx.globalAlpha = 1;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            points.forEach((p, idx) => {
                if (idx === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.stroke();

            ctx.fillStyle = color;
            points.forEach((p) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        this.#lastRenderData = { indicators, values, maxValues, cx, cy, radius, angleStep, seriesCount };
    }

    /**
     * 上一次渲染的数据缓存（私有字段）
     *
     * @private
     * @type {Object|null}
     * @property {string[]} indicators - 维度名称数组
     * @property {number[][]} values - 数值矩阵
     * @property {number[]} maxValues - 各系列最大值
     * @property {number} cx - 圆心 X 坐标
     * @property {number} cy - 圆心 Y 坐标
     * @property {number} radius - 最大半径
     * @property {number} angleStep - 角度步长
     * @property {number} seriesCount - 系列数量
     */
    #lastRenderData = null;

    /**
     * 检测鼠标点击是否命中雷达图数据点
     *
     * @method hitTest
     * @param {number} px - 鼠标点击的 X 坐标
     * @param {number} py - 鼠标点击的 Y 坐标
     * @param {Object} data - 图表数据对象
     * @param {Object} area - 绘制区域坐标
     * @param {number} seriesCount - 系列数量（未使用）
     * @param {number} catCount - 类别数量（未使用）
     * @param {*} yScale - Y轴信息（未使用）
     * @returns {Object|null} 点击命中的信息对象
     * @returns {string} returns.category - 维度名称（如 "速度"）
     * @returns {string} returns.seriesName - 系列名称
     * @returns {number} returns.value - 当前数值
     * @returns {Object} returns.detail - 详细信息
     * @returns {string} returns.detail.type - "radar"
     * @returns {string} returns.detail.dimension - 维度名称
     * @returns {number} returns.detail.value - 数值
     * @returns {number} returns.detail.maxValue - 最大值
     * @returns {string} returns.detail.percentage - 百分比字符串
     *
     * @description 使用**极坐标转换+距离检测**算法：
     *
     * **Step 1: 范围预检**
     * - 计算鼠标到圆心的距离 dist
     * - 若 dist ∉ [5, radius+10]，直接返回 null
     *
     * **Step 2: 角度匹配**
     * - 计算 mouseAngle = atan2(py-cy, px-cx) + π/2
     * - 归一化到 [0, 2π) 范围
     * - 找到最近的维度索引：dimIndex = round(mouseAngle / angleStep)
     *
     * **Step 3: 距离检测**
     * - 遍历所有系列
     * - 计算理论数据点距离：pointDist = radius × (value/maxValue)
     * - 若 |dist - pointDist| < HIT_RADIUS，则视为命中
     *
     * **性能优化：**
     * - 使用缓存的 #lastRenderData 避免重复计算
     * - 先做快速范围排除再精确匹配
     */
    hitTest(px, py, data, area, seriesCount, catCount, yScale) {
        if (!this.#lastRenderData) return null;

        const { indicators, values, maxValues, cx, cy, radius, angleStep } = this.#lastRenderData;
        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        if (dist > radius + 10 || dist < 5) return null;

        let mouseAngle = Math.atan2(py - cy, px - cx) + Math.PI / 2;
        if (mouseAngle < 0) mouseAngle += Math.PI * 2;

        const dimIndex = Math.round(mouseAngle / angleStep) % indicators.length;
        const normalizedAngle = (dimIndex * angleStep) % (Math.PI * 2);

        for (let j = 0; j < this.#lastRenderData.seriesCount; j++) {
            const val = values[dimIndex]?.[j];
            const maxVal = maxValues[j] || 100;
            const pointDist = radius * Math.min(val / maxVal, 1.2);

            if (Math.abs(dist - pointDist) < HIT_RADIUS) {
                return {
                    category: indicators[dimIndex],
                    seriesName: data.headers[j + 1],
                    value: val,
                    detail: {
                        type: "radar",
                        dimension: indicators[dimIndex],
                        value: val,
                        maxValue: maxVal,
                        percentage: ((val / maxVal) * 100).toFixed(1) + "%",
                    },
                    pointX: px,
                    pointY: py,
                };
            }
        }

        return null;
    }

    /**
     * 格式化详细信息（供 Tooltip 显示）
     *
     * @method formatDetail
     * @param {Object} detail - detail 对象
     * @returns {string[]} 格式化后的文本行数组
     */
    formatDetail(detail) {
        return [`📊 维度: ${detail.dimension}`, `─────────`, `数值: ${detail.value}`, `最大值: ${detail.maxValue}`, `占比: ${detail.percentage}`];
    }
}
