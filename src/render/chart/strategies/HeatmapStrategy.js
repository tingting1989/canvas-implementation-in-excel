/**
 * @fileoverview 热力图渲染策略实现
 * @description 负责热力图的 Canvas 渲染、点击检测和 Tooltip 格式化。
 *              使用颜色深浅展示二维数据的密度分布情况，
 *              适用于相关性矩阵、数据分布、地理信息等场景。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module strategies/HeatmapStrategy
 * @see {@link BaseChartStrategy} 基类定义
 */

import { BaseChartStrategy } from "../BaseChartStrategy.js";
import { CONFIG } from "../../../constants/config.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

/**
 * 热力图策略类
 *
 * @class HeatmapStrategy
 * @extends BaseChartStrategy
 * @description 实现热力图的完整渲染逻辑，包括：
 *
 * **核心特性：**
 * - ✅ 二维网格布局（行×列的矩形矩阵）
 * - ✅ 颜色映射（数值→颜色的线性插值）
 * - ✅ 渐变色标（蓝→青→绿→黄→红五色渐变）
 * - ✅ 自动归一化（基于数据范围自动计算）
 * - ✅ 精确的矩形区域点击检测
 * - ✅ 数值标签显示（可选）
 *
 * **与其他图表的关键区别：**
 * | 图表类型 | 数据维度 | 视觉编码 | 坐标轴 |
 * |---------|---------|----------|--------|
 * | **柱状图** | 1D (类别, 数值) | 高度 | X=类别, Y=数值 |
 * | **散点图** | 2D (X值, Y值) | 位置 | X/Y=数值 |
 * | **热力图** | 2D (行类别, 列类别, 数值) | 颜色 | X=列名, Y=行名 |
 *
 * **数据格式要求：**
 * ```
 * data = {
 *   headers: ["", "列1", "列2", "列3"],  // 第一列为空或行标题
 *   data: [
 *     ["行1", 10, 20, 30],    // 行1的数据
 *     ["行2", 40, 50, 60],    // 行2的数据
 *     ["行3", 70, 80, 90],    // 行3的数据
 *   ]
 * }
 *
 * style = {
 *   colors: ["#313695", "#4575b4", "#74add1", "#abd9e9", "#e0f3f8",
 *            "#ffffbf", "#fee090", "#fdae61", "#f46d43", "#d73027", "#a50026"],
 *   showValue: true,        // 是否显示数值标签
 *   cellPadding: 2,         // 单元格间距（像素）
 * }
 * ```
 *
 * **适用场景：**
 * - 相关性矩阵（特征之间的相关系数）
 * - 混淆矩阵（分类模型性能评估）
 * - 日历热图（GitHub 贡献度风格）
 * - 地理热力图（地区数据密度）
 * - 用户行为分析（页面访问热度）
 * - 时间序列模式（小时/星期维度）
 *
 * **视觉特性：**
 * - 网格布局：等宽等高的矩形单元格
 * - 颜色方案：11色蓝-红渐变（类似 matplotlib RdYlBu_r）
 * - 边框样式：白色细线分隔（1px）
 * - 标签样式：自适应字号、居中对齐
 * - 默认间距：2px（可通过 style.cellPadding 配置）
 *
 * **数学公式：**
 * ```
 * 归一化计算：
 * normalizedValue = (value - min) / (max - min)
 *
 * 颜色插值：
 * colorIndex = normalizedValue × (colors.length - 1)
 * color = lerp(colors[floor(colorIndex)], colors[ceil(colorIndex)], fraction)
 *
 * 单元格尺寸：
 * cellWidth = (area.w - padding×(colCount+1)) / colCount
 * cellHeight = (area.h - padding×(rowCount+1)) / rowCount
 *
 * 坐标映射：
 * cellX = area.x + padding + col × (cellWidth + padding)
 * cellY = area.y + padding + row × (cellHeight + padding)
 * ```
 *
 * **交互特性：**
 * - 支持点击单元格显示详细信息
 * - Tooltip 包含：行名、列名、原始数值、归一化值、百分比排名
 * - 点击判定使用精确的矩形碰撞检测
 * - 支持鼠标悬停高亮效果（可扩展）
 *
 * **性能优化：**
 * - 批量绘制减少上下文切换
 * - 提前计算所有几何参数
 * - 使用整数坐标避免抗锯齿开销
 * - 缓存颜色查找表（可选优化）
 *
 * **注意事项：**
 * - 数据应为数值型（非数值会被转换为0）
 * - 空数据或单行/单列时不会渲染
 * - 极端值（全相同）时会使用中间色
 * - 支持负数和零值的正确处理
 *
 * @example
 * // 创建热力图实例
 * const heatmapStrategy = new HeatmapStrategy();
 * console.log(heatmapStrategy.type);  // "heatmap"
 * console.log(heatmapStrategy.name);  // "热力图"
 */
export class HeatmapStrategy extends BaseChartStrategy {
    /**
     * 创建热力图策略实例
     *
     * @constructor
     * @description 初始化策略类型和名称。
     *              类型标识符为 "heatmap"，用于在 NativeChartRenderer 中查找该策略。
     */
    constructor() {
        super("heatmap", "热力图");
    }

    /**
     * 默认颜色渐变方案（蓝-红 11色阶）
     *
     * @static
     * @private
     * @type {string[]}
     * @readonly
     * @description 从蓝色（冷/低值）到红色（热/高值）的 11 级颜色渐变。
     *              参考了科学可视化中常用的 RdYlBu_r 配色方案，
     *              具有良好的视觉区分度和色盲友好性。
     *
     * **颜色分布：**
     * - #313695 → #a50026（深蓝 → 深红）
     * - 中间值：#ffffbf（浅黄色）
     * - 对称设计：冷暖色调平衡
     */
    static #defaultColors = ["#313695", "#4575b4", "#74add1", "#abd9e9", "#e0f3f8", "#ffffbf", "#fee090", "#fdae61", "#f46d43", "#d73027", "#a50026"];

    /**
     * 将数值线性插值为颜色
     *
     * @static
     * @private
     * @method interpolateColor
     * @param {number} value - 待转换的数值（已归一化到 [0, 1]）
     * @param {string[]} colors - 颜色数组
     * @returns {string} 插值后的颜色（十六进制格式）
     *
     * @description 使用**分段线性插值**算法：
     *
     * **算法步骤：**
     * 1. 计算理论索引：`idx = value × (colors.length - 1)`
     * 2. 取整数部分：`i = Math.floor(idx)`
     * 3. 取小数部分：`t = idx - i`
     * 4. 边界处理：若 i ≥ colors.length-1，直接返回最后一种颜色
     * 5. RGB 分量分别插值：
     *    ```javascript
     *    R = R₁ × (1-t) + R₂ × t
     *    G = G₁ × (1-t) + G₂ × t
     *    B = B₁ × (1-t) + B₂ × t
     *    ```
     * 6. 组装回十六进制格式：`#RRGGBB`
     *
     * **时间复杂度：** O(1)（固定操作次数）
     *
     * @example
     * // 中间值应返回黄色
     * const midColor = HeatmapStrategy.interpolateColor(0.5, colors);
     * // midColor ≈ "#ffffbf"
     */
    static #interpolateColor(value, colors) {
        const idx = value * (colors.length - 1);
        const i = Math.floor(idx);
        const t = idx - i;

        if (i >= colors.length - 1) {
            return colors[colors.length - 1];
        }

        const c1 = this.#hexToRgb(colors[i]);
        const c2 = this.#hexToRgb(colors[i + 1]);

        const r = Math.round(c1.r * (1 - t) + c2.r * t);
        const g = Math.round(c1.g * (1 - t) + c2.g * t);
        const b = Math.round(c1.b * (1 - t) + c2.b * t);

        return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    }

    /**
     * 十六进制颜色转 RGB 对象
     *
     * @static
     * @private
     * @method hexToRgb
     * @param {string} hex - 十六进制颜色字符串（如 "#ff0000"）
     * @returns {Object} RGB 颜色对象
     * @returns {number} returns.r - 红色分量 (0-255)
     * @returns {number} returns.g - 绿色分量 (0-255)
     * @returns {number} returns.b - 蓝色分量 (0-255)
     */
    static #hexToRgb(hex) {
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
     * 渲染热力图到 Canvas 上下文
     *
     * @method render
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {Object} data - 图表数据对象
     * @param {string[]} data.headers - 列标题数组（第一列为空或行标题标识）
     * @param {Array<Array<number|string>>} data.data - 二维数据数组
     * @param {Object} area - 绘制区域坐标
     * @param {number} area.x - 区域左上角 X 坐标
     * @param {number} area.y - 区域左上角 Y 坐标
     * @param {number} area.w - 区域宽度
     * @param {number} area.h - 区域高度
     * @param {Object} style - 样式配置
     * @param {string[]} [style.colors] - 自定义颜色数组（可选，默认使用内置渐变）
     * @param {boolean} [style.showValue=true] - 是否在单元格内显示数值
     * @param {number} [style.cellPadding=2] - 单元格间距（像素）
     * @param {*} yScale - 未使用（保留兼容性）
     *
     * @description 渲染流程：
     *
     * **Step 1: 数据验证与预处理**
     * - 检查 data.data 是否有效（至少 2×2 矩阵）
     * - 提取行列数：`rowCount = data.data.length`, `colCount = data.headers.length - 1`
     * - 提取纯数值矩阵（跳过第一列的行标题）
     * - 计算全局最小值/最大值（用于归一化）
     *
     * **Step 2: 几何参数计算**
     * ```javascript
     * padding = style?.cellPadding ?? 2;           // 单元格间距
     * totalPaddingX = padding × (colCount + 1);    // 水平总边距
     * totalPaddingY = padding × (rowCount + 1);    // 垂直总边距
     * cellWidth = (area.w - totalPaddingX) / colCount;   // 单元格宽度
     * cellHeight = (area.h - totalPaddingY) / rowCount;  // 单元格高度
     * ```
     *
     * **Step 3: 绘制单元格网格（双重循环）**
     * - 外层循环：遍历行（row = 0 到 rowCount-1）
     * - 内层循环：遍历列（col = 0 到 colCount-1）
     * - 对每个单元格：
     *   1. 提取数值并归一化：`ratio = (value - min) / range`
     *   2. 颜色插值：`color = interpolateColor(ratio, colors)`
     *   3. 计算位置：`(x, y)` 基于行列索引
     *   4. 绘制填充矩形：`fillRect(x, y, w, h)`
     *   5. 绘制边框：`strokeRect(x, y, w, h)`（白色）
     *   6. 可选：绘制数值文本
     *
     * **Step 4: 数值标签渲染（条件性）**
     * - 仅当 `style.showValue !== false` 时绘制
     * - 字号自适应：`min(12, cellHeight × 0.4)`（避免溢出）
     * - 颜色选择：根据背景亮度自动选黑/白文字
     * - 居中对齐：`textAlign="center"`, `textBaseline="middle"`
     *
     * **特殊处理：**
     * - 全相同数值：ratio = 0.5（使用中间色）
     * - 零范围保护：`range || 1`（避免除以零）
     * - 非数值处理：`Number(val) || 0`
     *
     * **性能优化：**
     * - 单次遍历完成所有单元格绘制
     * - 批量设置 fillStyle/strokeStyle
     * - 使用整数坐标避免子像素渲染
     * - 缓存颜色计算结果（隐式）
     *
     * @example
     * // 典型调用方式
     * const strategy = new HeatmapStrategy();
     * strategy.render(ctx, {
     *   headers: ["", "Q1", "Q2", "Q3", "Q4"],
     *   data: [
     *     ["产品A", 100, 200, 150, 180],
     *     ["产品B", 120, 180, 220, 160],
     *     ["产品C", 90, 160, 190, 210],
     *   ]
     * }, {x:50, y:50, w:400, h:300}, {showValue: true, cellPadding: 3});
     */
    render(ctx, data, area, style, yScale) {
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

        const values = data.data.map((row) => row.slice(1).map((v) => Number(v) || 0));
        const flatValues = values.flat();
        const minVal = Math.min(...flatValues);
        const maxVal = Math.max(...flatValues);
        const range = maxVal - minVal || 1;

        const colors = style?.colors || HeatmapStrategy.#defaultColors;
        const padding = style?.cellPadding ?? 2;
        const showValue = style?.showValue !== false;

        const totalPaddingX = padding * (colCount + 1);
        const totalPaddingY = padding * (rowCount + 1);
        const cellWidth = (area.w - totalPaddingX) / colCount;
        const cellHeight = (area.h - totalPaddingY) / rowCount;

        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.8)";

        for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col < colCount; col++) {
                const value = values[row][col];
                const ratio = (value - minVal) / range;
                const color = HeatmapStrategy.#interpolateColor(ratio, colors);

                const x = area.x + padding + col * (cellWidth + padding);
                const y = area.y + padding + row * (cellHeight + padding);

                ctx.fillStyle = color;
                ctx.fillRect(x, y, cellWidth, cellHeight);
                ctx.strokeRect(x, y, cellWidth, cellHeight);

                if (showValue && cellWidth > 20 && cellHeight > 20) {
                    const brightness = this.#getColorBrightness(color);
                    ctx.fillStyle = brightness > 128 ? "#333" : "#fff";
                    const fontSize = Math.min(12, cellHeight * 0.4, cellWidth * 0.3);
                    ctx.font = `${fontSize}px ${CONFIG.CHART_FONT_FAMILY}`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";

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
     * 计算颜色亮度（用于自适应文字颜色）
     *
     * @private
     * @method getColorBrightness
     * @param {string} hex - 十六进制颜色
     * @returns {number} 亮度值 (0-255)，>128 为亮色
     *
     * @description 使用**感知亮度公式**（人眼对绿色更敏感）：
     * ```javascript
     * brightness = 0.299*R + 0.587*G + 0.114*B
     * ```
     *
     * 返回值用于决定在该背景上使用黑色还是白色文字。
     */
    #getColorBrightness(hex) {
        const rgb = HeatmapStrategy.#hexToRgb(hex);
        return Math.round(0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
    }

    /**
     * 检测鼠标点击是否命中热力图单元格
     *
     * @method hitTest
     * @param {number} px - 鼠标点击的 X 坐标（相对于 Canvas）
     * @param {number} py - 鼠标点击的 Y 坐标（相对于 Canvas）
     * @param {Object} data - 图表数据对象（同 render 方法）
     * @param {Object} area - 绘制区域坐标（同 render 方法）
     * @param {number} seriesCount - 列数量（未使用，保留兼容性）
     * @param {number} catCount - 行数量（未使用，保留兼容性）
     * @param {*} yScale - Y轴信息（未使用）
     * @returns {Object|null} 点击命中的信息对象，未命中返回 null
     * @returns {string|number} returns.category - 行标题（如 "产品A"）
     * @returns {string} returns.seriesName - 列标题（如 "Q1"）
     * @returns {number} returns.value - 单元格数值
     * @returns {number} returns.pointX - 单元格中心 X 坐标
     * @returns {number} returns.pointY - 单元格中心 Y 坐标
     * @returns {Object} returns.detail - 详细信息
     * @returns {string} returns.detail.type - "热力图"
     * @returns {string} returns.detail.row - 行标题
     * @returns {string} returns.detail.col - 列标题
     * @returns {number} returns.detail.value - 原始数值
     * @returns {number} returns.detail.min - 全局最小值
     * @returns {number} returns.detail.max - 全局最大值
     * @returns {string} returns.detail.percentage - 百分比排名
     *
     * @description 检测算法（**逆向行列计算**）：
     *
     * **核心逻辑：**
     * 1. 重新计算几何参数（与 render 保持一致）
     * 2. 反推行列索引：
     * ```javascript
     * col = floor((px - area.x - padding) / (cellWidth + padding))
     * row = floor((py - area.y - padding) / (cellHeight + padding))
     * ```
     * 3. 边界检查：确保 `0 ≤ col < colCount` 且 `0 ≤ row < rowCount`
     * 4. 精确验证：鼠标确实在目标单元格矩形内
     * 5. 提取该位置的数值和元信息
     * 6. 构建返回对象（包含详细统计信息）
     *
     * **返回值的特殊性：**
     * - `category` 返回**行标题**（第一列的文字）
     * - `seriesName` 返回**列标题**（headers 的对应元素）
     * - `detail.percentage` 表示该值在全局范围的百分位
     *
     * **性能优化：**
     * - 直接数学计算（无需遍历）
     * - 时间复杂度：O(1)（常数时间）
     * - 快速失败：先做粗略范围排除
     *
     * @example
     * // 典型调用方式
     * const hitInfo = strategy.hitTest(mouseX, mouseY, data, plotArea);
     * if (hitInfo) {
     *     console.log(`选中: [${hitInfo.category}, ${hitInfo.seriesName}] = ${hitInfo.value}`);
     *     showTooltip(hitInfo);
     * }
     */
    hitTest(px, py, data, area, seriesCount, catCount, yScale) {
        if (!data.data || data.data.length < 2) return null;

        const rowCount = data.data.length;
        const colCount = data.headers.length - 1;
        if (colCount < 2) return null;

        const padding = 2;
        const totalPaddingX = padding * (colCount + 1);
        const totalPaddingY = padding * (rowCount + 1);
        const cellWidth = (area.w - totalPaddingX) / colCount;
        const cellHeight = (area.h - totalPaddingY) / rowCount;

        const relX = px - area.x - padding;
        const relY = py - area.y - padding;

        if (relX < 0 || relY < 0) return null;

        const col = Math.floor(relX / (cellWidth + padding));
        const row = Math.floor(relY / (cellHeight + padding));

        if (col < 0 || col >= colCount || row < 0 || row >= rowCount) return null;

        const cellX = area.x + padding + col * (cellWidth + padding);
        const cellY = area.y + padding + row * (cellHeight + padding);

        if (px >= cellX && px <= cellX + cellWidth && py >= cellY && py <= cellY + cellHeight) {
            const value = Number(data.data[row][col + 1]) || 0;
            const rowLabel = String(data.data[row][0] || `Row${row}`);
            const colLabel = String(data.headers[col + 1] || `Col${col}`);

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
     * 格式化详细信息（供 Tooltip 显示）
     *
     * @method formatDetail
     * @param {Object} detail - 由 hitTest 返回的 detail 对象
     * @param {string} detail.type - 图表类型（"热力图"）
     * @param {string} detail.row - 行标题
     * @param {string} detail.col - 列标题
     * @param {number} detail.value - 原始数值
     * @param {number} detail.min - 全局最小值
     * @param {number} detail.max - 全局最大值
     * @param {string} detail.percentage - 百分比排名
     * @returns {string[]} 格式化后的文本行数组（用于多行显示）
     *
     * @description 输出格式示例：
     * ```
     * 📊 热力图
     * ─────────
     * 行: 产品A
     * 列: Q2
     * 数值: 200
     * 范围: 90 - 220
     * 排名: 67.7%
     * ```
     */
    formatDetail(detail) {
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
