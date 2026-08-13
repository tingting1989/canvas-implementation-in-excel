/**
 * @fileoverview 饼图渲染策略实现
 * @description 负责饼图/环形图的 Canvas 渲染、点击检测和 Tooltip 格式化。
 *              使用扇形区域展示各部分占总体的比例，适用于构成分析场景。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module strategies/PieStrategy
 * @see {@link BaseChartStrategy} 基类定义
 */

import { BaseChartStrategy } from "../BaseChartStrategy.js";
import { CONFIG } from "../../../constants/config.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

/**
 * 饼图策略类
 *
 * @class PieStrategy
 * @extends BaseChartStrategy
 * @description 实现饼图的完整渲染逻辑，包括：
 *
 * **核心特性：**
 * - ✅ 扇形区域绘制（使用 arc() 方法）
 * - ✅ 百分比标签显示（位于扇形中心 65% 处）
 * - ✅ 角度碰撞检测（极坐标转换）
 * - ✅ 自动计算占比（基于数值总和）
 * - ✅ 无坐标轴设计（isAxisFree() = true）
 *
 * **数据格式要求：**
 * ```
 * data = {
 *   headers: ["类别", "数值"],  // 只取第二列作为数值
 *   data: [
 *     ["A", 100],  // 第一行数据
 *     ["B", 200],  // 第二行数据
 *     ["C", 150],  // 第三行数据
 *   ]
 * }
 * ```
 *
 * **适用场景：**
 * - 市场份额分布（各品牌占比）
 * - 销售构成分析（各产品线贡献）
 * - 用户来源统计（各渠道流量）
 * - 费用结构展示（各项支出比例）
 *
 * **视觉特性：**
 * - 圆心位置：(cx, cy) = 绘制区域中心
 * - 半径大小：r = min(width, height) / 2 - 10px
 * - 起始角度：-π/2（12点钟方向）
 * - 标签位置：半径的 65% 处
 * - 边框样式：CONFIG.CHART_TOOLTIP_BORDER + CONFIG.CHART_TOOLTIP_BORDER_WIDTH
 *
 * **数学公式：**
 * ```
 * 扇形角度 = (数值 / 总和) × 2π
 * 百分比标签 = (数值 / 总和) × 100%
 * 角度范围判定：atan2(dy, dx) → 归一化到 [-π/2, 3π/2]
 * ```
 *
 * **交互特性：**
 * - 支持点击扇形区域显示 Tooltip
 * - 点击位置自动定位到扇形中心（60% 半径处）
 * - 精确的角度范围检测算法
 *
 * **注意事项：**
 * - 仅支持单系列数据（取第一列数值）
 * - 总和为 0 时不会渲染任何内容
 * - 所有数值必须为非负数
 *
 * @example
 * // 创建饼图实例
 * const pieStrategy = new PieStrategy();
 * console.log(pieStrategy.type);  // "pie"
 * console.log(pieStrategy.name);  // "饼图"
 */
export class PieStrategy extends BaseChartStrategy {
    /**
     * 创建饼图策略实例
     *
     * @constructor
     * @description 初始化策略类型和名称。
     *              类型标识符为 "pie"，用于在 NativeChartRenderer 中查找该策略。
     */
    constructor() {
        super("pie", "饼图");
    }

    /**
     * 判断是否为无坐标轴图表
     *
     * @method isAxisFree
     * @returns {boolean} 始终返回 true（饼图不需要坐标轴）
     *
     * @description 重写基类方法，告知 NativeChartRenderer：
     * - 不需要绘制 X/Y 坐标轴
     * - 不需要绘制网格线
     * - 不需要计算 Y 轴刻度
     * - 整个绘图区域可用于绘制饼图本身
     *
     * @example
     * if (strategy.isAxisFree()) {
     *     // 直接渲染，跳过坐标轴相关逻辑
     *     strategy.render(ctx, data, area, style);
     * }
     */
    isAxisFree() {
        return true;
    }

    /**
     * 渲染饼图到 Canvas 上下文
     *
     * @method render
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {Object} data - 图表数据对象
     * @param {string[]} data.headers - 列标题数组（第一列为类别名，第二列为数值）
     * @param {Array<Array<number|string>>} data.data - 二维数据数组
     * @param {Object} area - 绘制区域坐标
     * @param {number} area.x - 区域左上角 X 坐标
     * @param {number} area.y - 区域左上角 Y 坐标
     * @param {number} area.w - 区域宽度
     * @param {number} area.h - 区域高度
     * @param {Object} style - 样式配置
     * @param {string[]} style.colors - 颜色数组（每个类别一个颜色）
     * @param {*} yScale - 未使用（保留参数以兼容接口）
     *
     * @description 渲染流程：
     *
     * **Step 1: 数据验证与预处理**
     * - 提取所有数值列（data.data[i][1]）
     * - 计算数值总和 total
     * - 若 total === 0 则不渲染
     *
     * **Step 2: 计算几何参数**
     * ```
     * cx = area.x + area.w / 2        // 圆心 X
     * cy = area.y + area.h / 2        // 圆心 Y
     * r = min(area.w, area.h) / 2 - 10  // 半径（留边距）
     * ```
     *
     * **Step 3: 绘制扇形（循环）**
     * - 设置填充颜色（按 colors 数组循环）
     * - 构建路径：moveTo(圆心) → arc(圆弧) → closePath()
     * - fill() 填充扇形
     * - stroke() 绘制边框
     *
     * **Step 4: 绘制百分比标签**
     * - 计算中间角度 midAngle = startAngle + sliceAngle / 2
     * - 标签位置：半径 65% 处
     * - 文本内容：百分比（保留1位小数 + "%"）
     *
     * **角度计算公式：**
     * ```javascript
     * startAngle = -Math.PI / 2;  // 从12点方向开始
     * sliceAngle = (value / total) * Math.PI * 2;
     * endAngle = startAngle + sliceAngle;
     * ```
     *
     * **性能优化：**
     * - 单次循环完成所有扇形的绘制
     * - 边框和填充在同一路径中完成
     *
     * @example
     * // 典型调用方式
     * const strategy = new PieStrategy();
     * strategy.render(ctx, {
     *   headers: ["产品", "销量"],
     *   data: [["A", 100], ["B", 200], ["C", 150]]
     * }, {x:50, y:50, w:400, h:400}, {colors: ['#5470c6', '#91cc75', '#fac858']});
     */
    render(ctx, data, area, style) {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Pie 开始渲染`);

        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const values = data.data.map((row) => Number(row[1]) || 0);
        const total = values.reduce((sum, v) => sum + v, 0);
        if (total === 0) return;

        const cx = area.x + area.w / 2;
        const cy = area.y + area.h / 2;
        const r = Math.min(area.w, area.h) / 2 - 10;

        const pixelRatio = this.getPixelRatio(ctx, area);
        ctx.strokeStyle = CONFIG.CHART_TOOLTIP_BORDER;
        ctx.lineWidth = CONFIG.CHART_TOOLTIP_BORDER_WIDTH * pixelRatio;
        ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
        ctx.font = `${CONFIG.CHART_FONT_SIZE * pixelRatio}px ${CONFIG.CHART_FONT_FAMILY}`;

        let startAngle = -Math.PI / 2;

        for (let i = 0; i < catCount; i++) {
            const sliceAngle = (values[i] / total) * Math.PI * 2;
            ctx.fillStyle = style.colors[i % style.colors.length];

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            const midAngle = startAngle + sliceAngle / 2;
            const pct = ((values[i] / total) * 100).toFixed(1) + "%";
            ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
            const labelR = r * 0.65;
            ctx.fillText(pct, cx + Math.cos(midAngle) * labelR, cy + Math.sin(midAngle) * labelR);

            startAngle += sliceAngle;
        }
    }

    /**
     * 检测鼠标点击是否命中饼图扇形区域
     *
     * @method hitTest
     * @param {number} px - 鼠标点击的 X 坐标（相对于 Canvas）
     * @param {number} py - 鼠标点击的 Y 坐标（相对于 Canvas）
     * @param {Object} data - 图表数据对象（同 render 方法）
     * @param {Object} area - 绘制区域坐标（同 render 方法）
     * @param {number} seriesCount - 系列数量（未使用，保留兼容性）
     * @param {number} catCount - 类别数量
     * @param {*} yScale - Y轴刻度信息（未使用）
     * @returns {Object|null} 点击命中的信息对象，未命中返回 null
     * @returns {string} returns.category - 类别名（如 "产品A"）
     * @returns {string} returns.seriesName - 空字符串（饼图无系列概念）
     * @returns {number} returns.value - 数值
     * @returns {number} returns.pointX - 命中点的 X 坐标（扇形中心60%半径处）
     * @returns {number} returns.pointY - 命中点的 Y 坐标（扇形中心60%半径处）
     *
     * @description 检测算法（**极坐标转换法**）：
     *
     * **Step 1: 距离预检**
     * - 计算鼠标到圆心的欧氏距离 dist
     * - 若 dist > r（超出圆外），直接返回 null
     *
     * **Step 2: 角度计算**
     * - 使用 `atan2(dy, dx)` 计算极角
     * - 将角度归一化到 [-π/2, 3π/2] 范围
     *   （因为起始角度是 -π/2，即12点钟方向）
     *
     * **Step 3: 扇形匹配**
     * - 从起始角度开始遍历所有扇形
     * - 对每个扇形判断归一化后的角度是否在其范围内
     * - 特殊处理跨越 -π/2 边界的情况（endAngle > 3π/2）
     *
     * **数学原理：**
     * ```javascript
     * // 直角坐标 → 极坐标
     * angle = atan2(py - cy, px - cx)
     *
     * // 角度归一化（确保在 [-π/2, 3π/2] 范围内）
     * if (angle < -π/2) angle += 2π
     *
     * // 扇形匹配（考虑边界情况）
     * if (startAngle ≤ endAngle) {
     *     hit = (angle >= startAngle && angle <= endAngle)
     * } else {
     *     hit = (angle >= startAngle || angle ≤ endAngle)
     * }
     * ```
     *
     * **性能优化：**
     * - 距离预检快速排除圆外的点击
     * - 找到第一个匹配即返回（提前终止）
     *
     * @example
     * // 典型调用方式
     * const hitInfo = strategy.hitTest(mouseX, mouseY, data, plotArea, seriesCount, catCount);
     * if (hitInfo) {
     *     console.log(`选中: ${hitInfo.category}: ${hitInfo.value} (${hitInfo.value/total*100}%)`);
     *     showTooltip(hitInfo);
     * }
     */
    hitTest(px, py, data, area, seriesCount, catCount, yScale) {
        const values = data.data.map((row) => Number(row[1]) || 0);
        const total = values.reduce((sum, v) => sum + v, 0);
        if (total === 0) return null;

        const cx = area.x + area.w / 2;
        const cy = area.y + area.h / 2;
        const r = Math.min(area.w, area.h) / 2 - 10;

        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) return null;

        let angle = Math.atan2(dy, dx);
        if (angle < -Math.PI / 2) angle += Math.PI * 2;

        let startAngle = -Math.PI / 2;
        for (let i = 0; i < catCount; i++) {
            const sliceAngle = (values[i] / total) * Math.PI * 2;
            let endAngle = startAngle + sliceAngle;
            if (endAngle > (Math.PI * 3) / 2) endAngle -= Math.PI * 2;

            const normalizedAngle = angle;
            if (startAngle <= endAngle) {
                if (normalizedAngle >= startAngle && normalizedAngle <= endAngle) {
                    return {
                        category: String(data.data[i][0]),
                        seriesName: "",
                        value: values[i],
                        pointX: cx + Math.cos(startAngle + sliceAngle / 2) * r * 0.6,
                        pointY: cy + Math.sin(startAngle + sliceAngle / 2) * r * 0.6,
                    };
                }
            } else {
                if (normalizedAngle >= startAngle || normalizedAngle <= endAngle) {
                    return {
                        category: String(data.data[i][0]),
                        seriesName: "",
                        value: values[i],
                        pointX: cx + Math.cos(startAngle + sliceAngle / 2) * r * 0.6,
                        pointY: cy + Math.sin(startAngle + sliceAngle / 2) * r * 0.6,
                    };
                }
            }
            startAngle += sliceAngle;
        }
        return null;
    }
}
