/**
 * @fileoverview K线图（蜡烛图）渲染策略实现
 * @description 负责K线图/蜡烛图的 Canvas 渲染、点击检测和 Tooltip 格式化。
 *              使用阴阳烛展示 OHLC（开盘价、最高价、最低价、收盘价）数据，
 *              适用于金融数据分析场景（股票、期货、加密货币等）。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module strategies/CandlestickStrategy
 * @see {@link BaseChartStrategy} 基类定义
 */

import { BaseChartStrategy } from "../BaseChartStrategy.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

/**
 * K线图策略类
 * 
 * @class CandlestickStrategy
 * @extends BaseChartStrategy
 * @description 实现K线图的完整渲染逻辑，包括：
 * 
 * **核心特性：**
 * - ✅ OHLC 数据可视化（Open, High, Low, Close）
 * - ✅ 阴阳烛绘制（涨跌颜色区分）
 * - ✅ 影线绘制（最高/最低价范围）
 * - ✅ 详细 Tooltip 信息（包含涨跌幅）
 * - ✅ 自适应 Y 轴范围（基于所有OHLC值）
 * 
 * **数据格式要求：**
 * ```
 * data = {
 *   headers: ["日期", "Open", "High", "Low", "Close"],  // 可选，用于显示类别名
 *   data: [
 *     [20, 34, 10, 38],  // 第一行：[open, close, low, high]
 *     [40, 35, 30, 50],  // 第二行
 *     [31, 38, 33, 44],  // 第三行
 *     [38, 15, 5, 42],   // 第四行
 *   ]
 * }
 * 
 * 注意：每行数据的顺序为 [open, close, low, high]
 * ```
 * 
 * **适用场景：**
 * - 股票价格走势分析
 * - 期货/期权交易图表
 * - 加密货币价格监控
 * - 外汇汇率波动展示
 * - 任何需要展示 OHLC 数据的场景
 * 
 * **视觉特性：**
 * - 涨（阳线）：绿色 (#00aa44) - 收盘价 ≥ 开盘价
 * - 跌（阴线）：红色 (#ff4444) - 收盘价 < 开盘价
 * - 烛体宽度：candleWidth = max((area.w / catCount) * 0.7, 4px)
 * - 影线宽度：wickWidth = 1px
 * - 最小烛体高度：1px（避免零高度导致不可见）
 * 
 * **数学公式：**
 * ```
 * 烛体位置：
 * bodyTop = min(openY, closeY)
 * bodyH = |closeY - openY| || 1  // 最小1像素
 
 * 坐标映射：
 * priceY = area.y + area.h - ((price - yMin) / yRange) * area.h
 
 * 涨跌幅计算：
 * change = close - open
 * changePercent = (change / open) × 100%
 * ```
 * 
 * **交互特性：**
 * - 支持点击K线显示详细 OHLC 信息
 * - Tooltip 包含：开盘/收盘/最高/最低 + 涨跌幅 + 方向图标
 * - 点击区域扩大（hitPaddingX/Y）提升用户体验
 * 
 * **注意事项：**
 * - 仅支持单系列数据（每行代表一个时间点的 OHLC）
 * - 数据必须包含至少4个值（O, H, L, C）
 * - 无效数据会被跳过（row.length < 4 时 continue）
 * 
 * @example
 * // 创建K线图实例
 * const candlestickStrategy = new CandlestickStrategy();
 * console.log(candlestickStrategy.type);  // "candlestick"
 * console.log(candlestickStrategy.name);  // "K线图"
 */
export class CandlestickStrategy extends BaseChartStrategy {
    /**
     * 创建K线图策略实例
     *
     * @constructor
     * @description 初始化策略类型和名称。
     *              类型标识符为 "candlestick"，用于在 NativeChartRenderer 中查找该策略。
     */
    constructor() {
        super("candlestick", "K线图");
    }

    /**
     * 渲染K线图到 Canvas 上下文
     *
     * @method render
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {Object} data - 图表数据对象
     * @param {string[]} [data.headers] - 列标题数组（可选，用于显示日期等）
     * @param {Array<Array<number>>} data.data - 二维数值数组（每行：[open, close, low, high]）
     * @param {Object} area - 绘制区域坐标
     * @param {number} area.x - 区域左上角 X 坐标
     * @param {number} area.y - 区域左上角 Y 坐标
     * @param {number} area.w - 区域宽度
     * @param {number} area.h - 区域高度
     * @param {Object} style - 样式配置
     * @param {string[]} style.colors - 颜色数组（未使用，保留兼容性）
     * @param {Object} [yScale] - Y轴刻度信息（可选，若不传则自动计算）
     * @param {number} yScale.min - Y轴最小值
     * @param {number} yScale.max - Y轴最大值
     *
     * @description 渲染流程：
     *
     * **Step 1: 数据验证与初始化**
     * - 检查 catCount 是否有效
     * - 计算 Y 轴范围和步长
     * - 计算烛体宽度和影线宽度
     *
     * **Step 2: 解析 OHLC 数据**
     * ```javascript
     * const open = Number(row[0]);   // 开盘价
     * const close = Number(row[1]);  // 收盘价
     * const low = Number(row[2]);    // 最低价
     * const high = Number(row[3]);   // 最高价
     * ```
     *
     * **Step 3: 判断涨跌方向**
     * ```javascript
     * const isUp = close >= open;  // true=阳线(绿), false=阴线(红)
     * ```
     *
     * **Step 4: 计算屏幕坐标**
     * ```javascript
     * cx = area.x + (i + 0.5) * (area.w / catCount);  // 烛体中心X
     * openY, closeY, lowY, highY → 价格转Y坐标
     * ```
     *
     * **Step 5: 绘制影线（Wick）**
     * - 从 highY 到 lowY 的垂直线
     * - 使用细线条（wickWidth = 1px）
     *
     * **Step 6: 绘制烛体（Body）**
     * - 若 bodyH > 1：绘制矩形 (fillRect + strokeRect)
     * - 若 bodyH ≤ 1：绘制水平线（十字星形态）
     *
     * **特殊处理：**
     * - 无效数据跳过：`if (!row || row.length < 4) continue`
     * - 最小高度保护：`bodyH = Math.abs(closeY - openY) || 1`
     * - 十字星处理：当 open ≈ close 时绘制横线而非矩形
     *
     * @example
     * // 典型调用方式
     * const strategy = new CandlestickStrategy();
     * strategy.render(ctx, {
     *   headers: ["1月", "2月", "3月"],
     *   data: [[20, 34, 10, 38], [40, 35, 30, 50]]
     * }, {x:50, y:50, w:400, h:300}, {colors: ['#5470c6']}, yScale);
     */
    render(ctx, data, area, style, yScale) {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Candlestick 开始渲染`);

        const catCount = data.data.length;
        if (catCount <= 0) return;

        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;

        const candleWidth = Math.max((area.w / catCount) * 0.7, 4);
        const wickWidth = 1;

        for (let i = 0; i < catCount; i++) {
            const row = data.data[i];
            if (!row || row.length < 4) continue;

            const open = Number(row[0]) || 0;
            const close = Number(row[1]) || 0;
            const low = Number(row[2]) || 0;
            const high = Number(row[3]) || 0;

            const isUp = close >= open;
            const cx = area.x + (i + 0.5) * (area.w / catCount);

            const openY = area.y + area.h - ((open - yMin) / yRange) * area.h;
            const closeY = area.y + area.h - ((close - yMin) / yRange) * area.h;
            const lowY = area.y + area.h - ((low - yMin) / yRange) * area.h;
            const highY = area.y + area.h - ((high - yMin) / yRange) * area.h;

            const bodyTop = Math.min(openY, closeY);
            const bodyH = Math.abs(closeY - openY) || 1;

            const pixelRatio = this.getPixelRatio(ctx, area);
            ctx.strokeStyle = isUp ? "#00aa44" : "#ff4444";
            ctx.fillStyle = isUp ? "#00aa44" : "#ff4444";

            ctx.lineWidth = wickWidth * pixelRatio;
            ctx.beginPath();
            ctx.moveTo(cx, highY);
            ctx.lineTo(cx, lowY);
            ctx.stroke();

            if (bodyH > 1) {
                ctx.fillRect(cx - candleWidth / 2, bodyTop, candleWidth, bodyH);
                ctx.lineWidth = 1 * pixelRatio;
                ctx.strokeRect(cx - candleWidth / 2, bodyTop, candleWidth, bodyH);
            } else {
                ctx.beginPath();
                ctx.moveTo(cx - candleWidth / 2, bodyTop);
                ctx.lineTo(cx + candleWidth / 2, bodyTop);
                ctx.stroke();
            }
        }
    }

    /**
     * 检测鼠标点击是否命中K线元素
     *
     * @method hitTest
     * @param {number} px - 鼠标点击的 X 坐标（相对于 Canvas）
     * @param {number} py - 鼠标点击的 Y 坐标（相对于 Canvas）
     * @param {Object} data - 图表数据对象（同 render 方法）
     * @param {Object} area - 绘制区域坐标（同 render 方法）
     * @param {number} seriesCount - 系列数量（未使用，保留兼容性）
     * @param {number} catCount - K线数量（时间点数）
     * @param {Object} [yScale] - Y轴刻度信息
     * @returns {Object|null} 点击命中的信息对象，未命中返回 null
     * @returns {string} returns.category - 类别名（如 "1月" 或 "K1"）
     * @returns {string} returns.seriesName - 固定为 "OHLC"
     * @returns {string} returns.value - 格式化的OHLC字符串："O:x H:x L:x C:x"
     * @returns {Object} returns.detail - 详细信息对象
     * @returns {string} returns.detail.type - 图表类型标识："K线"
     * @returns {number} returns.detail.open - 开盘价
     * @returns {number} returns.detail.high - 最高价
     * @returns {number} returns.detail.low - 最低价
     * @returns {number} returns.detail.close - 收盘价
     * @returns {string} returns.detail.change - 涨跌额（如 "+14.00"）
     * @returns {string} returns.detail.changePercent - 涨跌幅百分比（如 "+70.00%"）
     * @returns {string} returns.detail.direction - 方向描述（"上涨 📈" 或 "下跌 📉"）
     * @returns {number} returns.pointX - 命中点 X 坐标（K线中心）
     * @returns {number} returns.pointY - 命中点 Y 坐标（影线中点）
     *
     * @description 检测算法（**扩展矩形区域判定**）：
     *
     * **核心逻辑：**
     * 1. 遍历所有 K 线数据
     * 2. 对每个 K 线计算其包围盒（含影线）
     * 3. 判断鼠标是否落在扩展后的包围盒内
     * 4. 返回详细的 OHLC 信息对象
     *
     * **点击区域计算：**
     * ```javascript
     * hitPaddingX = candleWidth / 2 + 8   // 左右各扩展8px
     * hitPaddingY = 15                    // 上下各扩展15px
     *
     * 判定条件：
     * px ∈ [cx - hitPaddingX, cx + hitPaddingX]
     * py ∈ [highY - hitPaddingY, lowY + hitPaddingY]
     * ```
     *
     * **返回值的特殊性：**
     * - `value` 字段返回格式化字符串（非数值），便于直接显示
     * - `detail` 对象包含完整的 OHLC 数值和衍生指标
     * - `changePercent` 自动计算并格式化为百分比
     * - `direction` 包含 emoji 图标增强可读性
     *
     * **性能优化：**
     * - 扩大点击区域提升用户体验（无需精确点击）
     * - 找到第一个命中即返回（提前终止）
     * - 时间复杂度：O(catCount)
     *
     * @example
     * // 典型调用方式
     * const hitInfo = strategy.hitTest(mouseX, mouseY, data, plotArea, seriesCount, catCount, yScale);
     * if (hitInfo) {
     *     console.log(`选中: ${hitInfo.category}`);
     *     console.log(`OHLC: ${hitInfo.value}`);
     *     console.log(`详情:`, hitInfo.detail);
     *     showTooltip(hitInfo);  // 显示详细提示框
     * }
     */
    hitTest(px, py, data, area, seriesCount, catCount, yScale) {
        const yMin = yScale ? yScale.min : this.getYMin(data);
        const yMax = yScale ? yScale.max : this.getYMax(data);
        const yRange = yMax - yMin || 1;

        const candleWidth = Math.max((area.w / catCount) * 0.7, 4);
        const hitPaddingX = candleWidth / 2 + 8;
        const hitPaddingY = 15;

        for (let i = 0; i < catCount; i++) {
            const row = data.data[i];
            if (!row || row.length < 4) continue;

            const open = Number(row[0]) || 0;
            const close = Number(row[1]) || 0;
            const low = Number(row[2]) || 0;
            const high = Number(row[3]) || 0;

            const cx = area.x + (i + 0.5) * (area.w / catCount);

            const highY = area.y + area.h - ((high - yMin) / yRange) * area.h;
            const lowY = area.y + area.h - ((low - yMin) / yRange) * area.h;

            if (px >= cx - hitPaddingX && px <= cx + hitPaddingX && py >= highY - hitPaddingY && py <= lowY + hitPaddingY) {
                const isUp = close >= open;
                const change = close - open;
                const changePercent = open !== 0 ? ((change / open) * 100).toFixed(2) : "0.00";

                return {
                    category: String(data.headers?.[i] || `K${i + 1}`),
                    seriesName: "OHLC",
                    value: `O:${open} H:${high} L:${low} C:${close}`,
                    detail: {
                        type: "K线",
                        open,
                        high,
                        low,
                        close,
                        change: change.toFixed(2),
                        changePercent: `${changePercent}%`,
                        direction: isUp ? "上涨 📈" : "下跌 📉",
                    },
                    pointX: cx,
                    pointY: (highY + lowY) / 2,
                };
            }
        }

        return null;
    }

    /**
     * 格式化详细信息（供 Tooltip 显示使用）
     *
     * @method formatDetail
     * @param {Object} detail - 由 hitTest 返回的 detail 对象
     * @param {string} detail.type - 图表类型（"K线"）
     * @param {number} detail.open - 开盘价
     * @param {number} detail.high - 最高价
     * @param {number} detail.low - 最低价
     * @param {number} detail.close - 收盘价
     * @param {string} detail.change - 涨跌额
     * @param {string} detail.changePercent - 涨跌幅
     * @param {string} detail.direction - 方向描述
     * @returns {string[]} 格式化后的文本行数组（用于多行显示）
     *
     * @description 将 detail 对象转换为用户友好的多行文本，
     *              用于在 Tooltip 中展示完整的 K 线信息。
     *
     * **输出格式示例：**
     * ```
     * 📊 上涨 📈
     * ─────────
     * 开盘: 20
     * 最高: 38
     * 最低: 10
     * 收盘: 34
     * ─────────
     * 涨跌: 14.00 (+70.00%)
     * ```
     *
     * **设计考虑：**
     * - 使用 emoji 增强视觉吸引力（📊📈📉）
     * - 使用分隔线增强层次感（─────────）
     * - 数值对齐便于快速阅读
     * - 处理空值情况（N/A 占位符）
     *
     * @example
     * // 在 NativeChartRenderer.renderTooltip 中调用
     * const lines = strategy.formatDetail(hitInfo.detail);
     * lines.forEach((line, i) => {
     *     ctx.fillText(line, tipX + padding.x, tipY + padding.y + i * lineHeight);
     * });
     */
    formatDetail(detail) {
        return [
            `📊 ${detail.direction || ""}`,
            `─────────`,
            `开盘: ${detail.open ?? "N/A"}`,
            `最高: ${detail.high ?? "N/A"}`,
            `最低: ${detail.low ?? "N/A"}`,
            `收盘: ${detail.close ?? "N/A"}`,
            `─────────`,
            `涨跌: ${detail.change ?? "N/A"} (${detail.changePercent ?? "N/A"})`,
        ];
    }

    /**
     * 计算数据中的最小 Y 值（基于 OHLC 所有字段）
     *
     * @method getYMin
     * @param {Object} data - 图表数据对象
     * @returns {number} 最小数值（基于 Open, High, Low, Close 的最小值）
     *
     * @description 遍历所有行的前4列（O, H, L, C），
     *              返回最小的数值。确保 Y 轴能完整显示所有价格。
     *
     * @example
     * const minVal = strategy.getYMin({data: [[20, 34, 10, 38], [40, 35, 30, 50]]});
     * console.log(minVal);  // 10 (来自第一行的Low值)
     */
    getYMin(data) {
        let min = Infinity;
        for (const row of data.data) {
            for (const v of [row[0], row[1], row[2], row[3]]) {
                const numV = Number(v);
                if (!isNaN(numV) && numV < min) min = numV;
            }
        }
        return min === Infinity ? 0 : min;
    }

    /**
     * 计算数据中的最大 Y 值（基于 OHLC 所有字段）
     *
     * @method getYMax
     * @param {Object} data - 图表数据对象
     * @returns {number} 最大数值（基于 Open, High, Low, Close 的最大值）
     *
     * @description 遍历所有行的前4列（O, H, L, C），
     *              返回最大的数值。确保 Y 轴能完整显示所有价格。
     *
     * @example
     * const maxVal = strategy.getYMax({data: [[20, 34, 10, 38], [40, 35, 30, 50]]});
     * console.log(maxVal);  // 50 (来自第二行的High值)
     */
    getYMax(data) {
        let max = -Infinity;
        for (const row of data.data) {
            for (const v of [row[0], row[1], row[2], row[3]]) {
                const numV = Number(v);
                if (!isNaN(numV) && numV > max) max = numV;
            }
        }
        return max === -Infinity ? 1 : max;
    }
}
