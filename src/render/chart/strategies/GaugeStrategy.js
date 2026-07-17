/**
 * @fileoverview 仪表盘渲染策略实现
 * @description 负责仪表盘/速度计的 Canvas 渲染、点击检测和 Tooltip 格式化。
 *              使用半圆形弧线和指针展示单一数值在范围内的位置，
 *              适用于 KPI 监控、进度展示、性能指标等场景。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module strategies/GaugeStrategy
 * @see {@link BaseChartStrategy} 基类定义
 */

import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy.js";
import { CONFIG } from "../../../constants/config.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

/**
 * 仪表盘策略类
 * 
 * @class GaugeStrategy
 * @extends BaseChartStrategy
 * @description 实现仪表盘的完整渲染逻辑，包括：
 * 
 * **核心特性：**
 * - ✅ 半圆形设计（180度弧线，从左到右）
 * - ✅ 渐变色进度条（蓝→绿→红三色渐变）
 * - ✅ 动态指针（三角形指针随数值旋转）
 * - ✅ 刻度线与刻度值（11个刻度点，主次区分）
 * - ✅ 标签与数值显示（居中显示标题和当前值）
 * - ✅ 无坐标轴设计（isAxisFree() = true）
 * 
 * **数据格式要求：**
 * ```
 * data = {
 *   headers: ["指标名称", "数值"],
 *   data: [
 *     ["CPU使用率", 75],  // 仅取第一行数据
 *   ]
 * }
 * 
 * style = {
 *   min: 0,    // 最小值（可选，默认0）
 *   max: 100,  // 最大值（可选，默认100）
 * }
 * ```
 * 
 * **适用场景：**
 * - KPI 指标监控（CPU、内存、磁盘使用率等）
 * - 进度完成度展示（项目进度、目标达成率等）
 * - 性能指标显示（速度、温度、压力等）
 * - 评分系统展示（满意度、健康指数等）
 * - 仪表板核心指标（Dashboard 关键数字）
 * 
 * **视觉特性：**
 * - 圆心位置：(cx, cy) = (区域中心X, 区域65%高度处)
 * - 弧线半径：radius = min(width, height) × 40%
 * - 角度范围：π → 2π（180度半圆，从9点钟到3点钟方向）
 * - 进度条宽度：radius × 15%
 * - 指针长度：radius × 85%
 * - 颜色方案：
 *   - 背景弧：#e0e0e0（浅灰）
 *   - 进度渐变：#5470c6(蓝) → #91cc75(绿) → #ee6666(红)
 *   - 指针/中心圆：#5470c6（蓝色）
 * 
 * **数学公式：**
 * ```
 * 百分比计算：
 * percentage = clamp((value - min) / (max - min), 0, 1)
 * 
 * 角度映射：
 * valueAngle = π + percentage × π  // [π, 2π] 范围
 
 * 刻度位置：
 * angle(i) = π + (i / (tickCount-1)) × π
 * tickValue(i) = min + (i / (tickCount-1)) × (max - min)
 * ```
 * 
 * **交互特性：**
 * - 支持点击仪表盘区域显示详细信息
 * - Tooltip 包含：数值、范围、完成百分比
 * - 点击判定范围：整个圆形区域（radius × 45%）
 * 
 * **注意事项：**
 * - 仅支持单值数据（取第一行第二列）
 * - 超出范围的值会被裁剪到 [min, max]
 * - 最小值和最大值可通过 style.min/max 自定义
 * 
 * @example
 * // 创建仪表盘实例
 * const gaugeStrategy = new GaugeStrategy();
 * console.log(gaugeStrategy.type);  // "gauge"
 * console.log(gaugeStrategy.name);  // "仪表盘"
 */
export class GaugeStrategy extends BaseChartStrategy {
    /**
     * 创建仪表盘策略实例
     *
     * @constructor
     * @description 初始化策略类型和名称。
     *              类型标识符为 "gauge"，用于在 NativeChartRenderer 中查找该策略。
     */
    constructor() {
        super("gauge", "仪表盘");
    }

    /**
     * 判断是否为无坐标轴图表
     *
     * @method isAxisFree
     * @returns {boolean} 始终返回 true（仪表盘不需要坐标轴）
     */
    isAxisFree() {
        return true;
    }

    /**
     * 渲染仪表盘到 Canvas 上下文
     *
     * @method render
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {Object} data - 图表数据对象
     * @param {string[]} [data.headers] - 列标题数组
     * @param {Array<Array<number|string>>} data.data - 二维数据数组（仅用第一行）
     * @param {Object} area - 绘制区域坐标
     * @param {number} area.x - 区域左上角 X 坐标
     * @param {number} area.y - 区域左上角 Y 坐标
     * @param {number} area.w - 区域宽度
     * @param {number} area.h - 区域高度
     * @param {Object} style - 样式配置
     * @param {number} [style.min=0] - 最小值
     * @param {number} [style.max=100] - 最大值
     * @param {*} yScale - 未使用（保留兼容性）
     *
     * @description 渲染流程：
     *
     * **Step 1: 数据提取与验证**
     * - 提取 value 和 label（第一行数据）
     * - 空数据检查并记录警告日志
     *
     * **Step 2: 计算几何参数**
     * ```javascript
     * cx = area.x + area.w / 2           // 圆心 X
     * cy = area.y + area.h * 0.65        // 圆心 Y（偏下以留出空间给标签）
     * radius = min(area.w, area.h) * 0.4  // 弧线半径
     * percentage = clamp((value-min)/(max-min), 0, 1)
     * ```
     *
     * **Step 3: 绘制背景弧线**
     * - 从 π 到 2π 的半圆弧
     * - 颜色：#e0e0e0（灰色背景）
     * - 宽度：radius × 15%
     * - 线帽样式："round"（圆角端点）
     *
     * **Step 4: 绘制渐变进度弧**
     * - 使用线性渐变（水平方向）
     * - 三色渐变：蓝(#5470c6) → 绿(#91cc75) → 红(#ee6666)
     * - 终止角度根据 percentage 动态计算
     *
     * **Step 5: 绘制刻度线与标签**
     * - 11个刻度点（均匀分布在180度范围内）
     * - 主刻度（偶数索引）：较长+粗+带数值标签
     * - 次刻度（奇数索引）：较短+细
     * - 标签位于刻度外侧 radius × 8% 处
     *
     * **Step 6: 绘制指针**
     * - 使用 ctx.rotate() 旋转坐标系
     * - 绘制三角形指针（指向当前值位置）
     * - 恢复坐标系（ctx.restore()）
     *
     * **Step 7: 绘制中心圆与文本**
     * - 中心圆：半径 radius × 8%
     * - 标题文本：大写、粗体、位于圆心上方
     * - 数值文本：更大字号、位于标题下方
     * - 整数直接显示，小数保留1位
     *
     * **性能优化：**
     * - 使用 save()/restore() 保护绘图状态
     * - 单次 beginPath 完成整段弧线绘制
     * - 批量设置字体属性减少切换
     *
     * @example
     * // 典型调用方式
     * const strategy = new GaugeStrategy();
     * strategy.render(ctx, {
     *   headers: ["CPU", "Usage"],
     *   data: [["CPU使用率", 75]]
     * }, {x:50, y:50, w:400, h:300}, {min: 0, max: 100});
     */
    render(ctx, data, area, style) {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Gauge 开始渲染`, { dataType: typeof data.data });

        if (!data.data || data.data.length === 0) {
            errorHandler.warn(ERROR_CODE.CHART_DATA_EMPTY, `Gauge 数据为空`);
            return;
        }

        const value = Number(data.data[0]?.[1]) || 0;
        const label = String(data.data[0]?.[0] || data.headers?.[0] || "Value");

        errorHandler.debug(ERROR_CODE.CHART_STRATEGY_DEBUG, `Gauge 数据提取`, { label, value });

        const min = style?.min ?? 0;
        const max = style?.max ?? 100;
        const safeMax = max - min || 1;
        const percentage = Math.max(0, Math.min(1, (value - min) / safeMax));

        const cx = area.x + area.w / 2;
        const cy = area.y + area.h * 0.65;
        const radius = Math.min(area.w, area.h) * 0.4;

        const startAngle = Math.PI;
        const endAngle = 2 * Math.PI;
        const valueAngle = startAngle + (endAngle - startAngle) * percentage;

        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = "#e0e0e0";
        ctx.lineWidth = radius * 0.15;
        ctx.stroke();

        const gradient = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
        gradient.addColorStop(0, "#5470c6");
        gradient.addColorStop(0.5, "#91cc75");
        gradient.addColorStop(1, "#ee6666");

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, valueAngle);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = radius * 0.15;
        ctx.stroke();

        const tickRadius = radius * 1.15;
        const tickCount = 11;
        for (let i = 0; i < tickCount; i++) {
            const angle = startAngle + ((endAngle - startAngle) / (tickCount - 1)) * i;
            const isMajor = i % 2 === 0;

            const innerR = tickRadius - (isMajor ? radius * 0.06 : radius * 0.03);
            const outerR = tickRadius;

            const x1 = cx + Math.cos(angle) * innerR;
            const y1 = cy + Math.sin(angle) * innerR;
            const x2 = cx + Math.cos(angle) * outerR;
            const y2 = cy + Math.sin(angle) * outerR;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = "#666";
            ctx.lineWidth = isMajor ? 2 : 1;
            ctx.stroke();

            if (isMajor) {
                const tickValue = min + ((max - min) / (tickCount - 1)) * i;
                const textR = tickRadius + radius * 0.08;
                const tx = cx + Math.cos(angle) * textR;
                const ty = cy + Math.sin(angle) * textR;

                ctx.fillStyle = "#666";
                ctx.font = `${radius * 0.12}px ${CONFIG.CHART_FONT_FAMILY}`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(Math.round(tickValue).toString(), tx, ty);
            }
        }

        const needleLength = radius * 0.85;
        const needleWidth = radius * 0.04;
        const needleAngle = startAngle + (endAngle - startAngle) * percentage;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(needleAngle);

        ctx.beginPath();
        ctx.moveTo(-needleWidth * 1.5, 0);
        ctx.lineTo(0, -needleLength);
        ctx.lineTo(needleWidth * 1.5, 0);
        ctx.closePath();
        ctx.fillStyle = "#5470c6";
        ctx.fill();

        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = "#5470c6";
        ctx.fill();

        ctx.fillStyle = "#333";
        ctx.font = `bold ${radius * 0.14}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label.toUpperCase(), cx, cy + radius * 0.25);

        ctx.fillStyle = "#333";
        ctx.font = `bold ${radius * 0.22}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        let displayValue;
        if (Number.isInteger(value)) {
            displayValue = String(value);
        } else {
            displayValue = value.toFixed(1);
        }
        ctx.fillText(displayValue, cx, cy + radius * 0.42);
    }

    /**
     * 检测鼠标点击是否命中仪表盘区域
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
     * @returns {string} returns.category - 指标名称（如 "CPU使用率"）
     * @returns {string} returns.seriesName - 固定为 "Gauge"
     * @returns {number} returns.value - 当前数值
     * @returns {number} returns.pointX - 圆心 X 坐标
     * @returns {number} returns.pointY - 圆心 Y 坐标
     * @returns {Object} returns.detail - 详细信息
     * @returns {string} returns.detail.type - "仪表盘"
     * @returns {number} returns.detail.value - 数值
     * @returns {number} returns.detail.min - 最小值
     * @returns {number} returns.detail.max - 最大值
     * @returns {string} returns.detail.percentage - 百分比字符串
     *
     * @description 使用**圆形区域判定**算法：
     * - 计算鼠标到圆心的距离
     * - 若距离 ≤ radius × 45%，则视为命中
     * - 返回包含详细信息的对象
     */
    hitTest(px, py, data, area, seriesCount, catCount, yScale) {
        if (!data.data || data.data.length === 0) return null;

        const value = Number(data.data[0]?.[1]) || 0;
        const label = String(data.data[0]?.[0] || data.headers?.[0] || "Value");
        const cx = area.x + area.w / 2;
        const cy = area.y + area.h * 0.65;
        const radius = Math.min(area.w, area.h) * 0.45;

        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        if (dist > radius) return null;

        const min = 0;
        const max = 100;
        const percentage = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));

        return {
            category: label,
            seriesName: "Gauge",
            value: value,
            pointX: cx,
            pointY: cy,
            detail: {
                type: "仪表盘",
                value: value,
                min: min,
                max: max,
                percentage: `${(percentage * 100).toFixed(1)}%`,
            },
        };
    }

    /**
     * 格式化详细信息（供 Tooltip 显示）
     *
     * @method formatDetail
     * @param {Object} detail - detail 对象
     * @returns {string[]} 格式化后的文本行数组
     */
    formatDetail(detail) {
        return [`─────────`, `数值: ${detail.value}`, `范围: ${detail.min} - ${detail.max}`, `完成度: ${detail.percentage}`];
    }
}
