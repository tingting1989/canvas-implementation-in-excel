/**
 * @fileoverview 漏斗图渲染策略实现
 * @description 负责漏斗图的 Canvas 渲染、点击检测和 Tooltip 格式化。
 *              使用倒梯形展示流程各阶段的转化情况，适用于用户行为分析场景。
 *
 * @author Canvas-Sheet Team
 * @version 2.0.0
 * @since 2024-01-15
 * @license Apache-2.0
 *
 * @module strategies/FunnelStrategy
 * @see {@link BaseChartStrategy} 基类定义
 */

import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy.js";
import { CONFIG } from "../../../constants/config.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

/**
 * 漏斗图策略类
 *
 * @class FunnelStrategy
 * @extends BaseChartStrategy
 * @description 实现漏斗图的完整渲染逻辑，包括：
 *
 * **核心特性：**
 * - ✅ 倒梯形设计（上宽下窄，体现递减趋势）
 * - ✅ 多阶段支持（每个阶段一个梯形层）
 * - ✅ 宽度映射（根据数值动态计算宽度）
 * - ✅ 转化率计算（相邻阶段间的转化比例）
 * - ✅ 标签显示（居中显示阶段名称）
 * - ✅ 无坐标轴设计（isAxisFree() = true）
 *
 * **数据格式要求：**
 * ```
 * data = {
 *   headers: ["阶段", "数值"],
 *   data: [
 *     ["访问", 1000],    // 第一阶段（最宽）
 *     ["浏览", 600],      // 第二阶段
 *     ["加购", 300],      // 第三阶段
 *     ["下单", 150],      // 第四阶段
 *     ["支付", 80],       // 第五阶段（最窄）
 *   ]
 * }
 * ```
 *
 * **适用场景：**
 * - 用户转化漏斗（访问→浏览→下单→支付）
 * - 销售漏斗（线索→商机→报价→成交）
 * - 渠道流量分析（各渠道来源占比）
 * - 流程效率监控（审批流、生产流等）
 * - 内容消费分析（曝光→点击→阅读→分享）
 *
 * **视觉特性：**
 * - 最大宽度：area.w × 85%（顶部）
 * - 最小宽度：area.w × 15%（底部）
 * - 颜色方案：9色循环（#5470c6, #91cc75, #fac858, ...）
 * - 边框样式：白色半透明边框（rgba(255,255,255,0.7)）
 * - 文本样式：白色粗体、居中对齐
 *
 * **数学公式：**
 * ```
 * 宽度计算：
 * currentWidth = minWidth + (maxWidth - minWidth) × (value / maxValue)
 *
 * 转化率：
 * conversionRate = (当前阶段数值 / 上一阶段数值) × 100%
 * totalRate = (当前阶段数值 / 第一阶段数值) × 100%
 *
 * 坐标映射：
 * y1 = topY + index × itemHeight        // 层顶 Y
 * y2 = topY + (index + 1) × itemHeight  // 层底 Y
 * x_left = cx - currentWidth / 2         // 左边界 X
 * x_right = cx + currentWidth / 2        // 右边界 X
 * ```
 *
 * **交互特性：**
 * - 支持点击梯形层显示详细信息
 * - Tooltip 包含：阶段名称、数值、转化率、总体占比
 * - 点击判定使用扩展矩形区域（包含斜边的包围盒）
 *
 * **注意事项：**
 * - 数据应按从大到小排列（体现漏斗递减特性）
 * - 数值越大，梯形越宽（视觉上位于上方）
 * - 最后一个阶段底部收窄为尖角（15%宽度）
 * - 空数据时不会渲染任何内容
 *
 * @example
 * // 创建漏斗图实例
 * const funnelStrategy = new FunnelStrategy();
 * console.log(funnelStrategy.type);  // "funnel"
 * console.log(funnelStrategy.name);  // "漏斗图"
 */
export class FunnelStrategy extends BaseChartStrategy {
    /**
     * 创建漏斗图策略实例
     *
     * @constructor
     * @description 初始化策略类型和名称。
     *              类型标识符为 "funnel"，用于在 NativeChartRenderer 中查找该策略。
     */
    constructor() {
        super("funnel", "漏斗图");
    }

    /**
     * 判断是否为无坐标轴图表
     *
     * @method isAxisFree
     * @returns {boolean} 始终返回 true（漏斗图不需要坐标轴）
     */
    isAxisFree() {
        return true;
    }

    /**
     * 渲染漏斗图到 Canvas 上下文
     *
     * @method render
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {Object} data - 图表数据对象
     * @param {string[]} [data.headers] - 列标题数组
     * @param {Array<Array<number|string>>} data.data - 二维数据数组
     * @param {Object} area - 绘制区域坐标
     * @param {number} area.x - 区域左上角 X 坐标
     * @param {number} area.y - 区域左上角 Y 坐标
     * @param {number} area.w - 区域宽度
     * @param {number} area.h - 区域高度
     * @param {Object} style - 样式配置
     * @param {boolean} [style.title] - 是否有标题（影响起始Y位置）
     * @param {*} yScale - 未使用（保留兼容性）
     *
     * @description 渲染流程：
     *
     * **Step 1: 数据预处理**
     * - 提取 items 数组：`[{name, value}, ...]`
     * - 计算最大值 maxValue（用于归一化）
     * - 定义颜色数组（9种颜色循环使用）
     *
     * **Step 2: 计算布局参数**
     * ```javascript
     * cx = area.x + area.w / 2           // 中心线 X
     * topY = area.y + (title ? 30 : 10)  // 起始 Y（考虑标题偏移）
     * bottomY = area.y + area.h - 20      // 结束 Y（留底部边距）
     * itemHeight = totalHeight / items.length  // 每层高度
     * maxWidth = area.w * 0.85            // 最大宽度（85%区域宽）
     * minWidth = area.w * 0.15            // 最小宽度（15%区域宽）
     * ```
     *
     * **Step 3: 绘制每层梯形（循环）**
     * - 计算当前层宽度：`currentWidth = minWidth + widthRange × ratio`
     * - 构建梯形路径：
     *   - 上边：`(cx ± width/2, y1)`
     *   - 下边：连接下一层的 `(cx ± nextWidth/2, y2)`
     *   - 最后一层特殊处理：收窄为尖角（15%宽度）
     * - fill() 填充颜色
     * - stroke() 绘制白色半透明边框
     *
     * **Step 4: 绘制标签文本**
     * - 白色粗体字体
     * - 字号自适应：`min(14, itemHeight × 35%)`
     * - 居中位置：`(cx, (y1+y2)/2)`
     *
     * **性能优化：**
     * - 单次遍历完成所有层的绘制
     * - 边框和填充在同一路径中完成
     * - 字号根据层高自动调整避免溢出
     *
     * @example
     * // 典型调用方式
     * const strategy = new FunnelStrategy();
     * strategy.render(ctx, {
     *   headers: ["阶段", "人数"],
     *   data: [["访问", 1000], ["浏览", 600], ["下单", 150]]
     * }, {x:50, y:50, w:400, h:400}, {});
     */
    render(ctx, data, area, style) {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Funnel 开始渲染`);

        if (!data.data || data.data.length === 0) {
            errorHandler.warn(ERROR_CODE.CHART_DATA_EMPTY, `Funnel 数据为空`);
            return;
        }

        const items = data.data.map((row) => ({
            name: String(row?.[0] || ""),
            value: Number(row?.[1]) || 0,
        }));

        if (items.length === 0) return;

        const maxValue = Math.max(...items.map((item) => item.value), 1);
        const colors = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc"];

        const cx = area.x + area.w / 2;
        const topY = area.y + (style.title ? 30 : 10);
        const bottomY = area.y + area.h - 20;
        const totalHeight = bottomY - topY;
        const itemHeight = totalHeight / items.length;

        const maxWidth = area.w * 0.85;
        const minWidth = area.w * 0.15;
        const widthRange = maxWidth - minWidth;

        items.forEach((item, index) => {
            const ratio = item.value / maxValue;
            const currentWidth = minWidth + widthRange * ratio;

            const y1 = topY + index * itemHeight;
            const y2 = topY + (index + 1) * itemHeight - 4;

            const color = colors[index % colors.length];

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(cx - currentWidth / 2, y1);
            ctx.lineTo(cx + currentWidth / 2, y1);

            if (index < items.length - 1) {
                const nextItem = items[index + 1];
                const nextRatio = nextItem.value / maxValue;
                const nextWidth = minWidth + widthRange * nextRatio;
                ctx.lineTo(cx + nextWidth / 2, y2);
                ctx.lineTo(cx - nextWidth / 2, y2);
            } else {
                const tipWidth = currentWidth * 0.15;
                ctx.lineTo(cx + tipWidth / 2, y2 + itemHeight * 0.5);
                ctx.lineTo(cx - tipWidth / 2, y2 + itemHeight * 0.5);
            }

            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = "rgba(255,255,255,0.7)";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = "#fff";
            ctx.font = `bold ${Math.min(14, itemHeight * 0.35)}px ${CONFIG.CHART_FONT_FAMILY}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const textY = (y1 + y2) / 2;
            ctx.fillText(item.name, cx, textY);
        });
    }

    /**
     * 检测鼠标点击是否命中漏斗图元素
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
     * @returns {string} returns.category - 阶段名称（如 "浏览"）
     * @returns {string} returns.seriesName - 固定为 "Funnel"
     * @returns {number} returns.value - 当前阶段数值
     * @returns {number} returns.pointX - 中心点 X 坐标
     * @returns {number} returns.pointY - 层中心 Y 坐标
     * @returns {Object} returns.detail - 详细信息
     * @returns {string} returns.detail.type - "漏斗图"
     * @returns {string} returns.detail.stage - 阶段名称
     * @returns {number} returns.detail.value - 数值
     * @returns {string} returns.detail.conversionRate - 相对上一阶段的转化率
     * @returns {string} returns.detail.totalRate - 相对第一阶段的总体占比
     *
     * @description 使用**垂直区间+水平范围**检测算法：
     * - 先判断鼠标 Y 坐标落在哪一层
     * - 再判断 X 坐标是否在该层的水平范围内
     * - 自动计算转化率和总体占比
     */
    hitTest(px, py, data, area, seriesCount, catCount, yScale) {
        if (!data.data || data.data.length === 0) return null;

        const items = data.data.map((row) => ({
            name: String(row?.[0] || ""),
            value: Number(row?.[1]) || 0,
        }));

        if (items.length === 0) return null;

        const maxValue = Math.max(...items.map((item) => item.value), 1);

        const cx = area.x + area.w / 2;
        const topY = area.y + 30;
        const bottomY = area.y + area.h - 20;
        const totalHeight = bottomY - topY;
        const itemHeight = totalHeight / items.length;

        const maxWidth = area.w * 0.85;
        const minWidth = area.w * 0.15;
        const widthRange = maxWidth - minWidth;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const ratio = item.value / maxValue;
            const currentWidth = minWidth + widthRange * ratio;

            const y1 = topY + i * itemHeight;
            let y2;
            if (i < items.length - 1) {
                y2 = topY + (i + 1) * itemHeight - 4;
            } else {
                y2 = topY + (i + 1) * itemHeight - 4 + itemHeight * 0.5;
            }

            if (py >= y1 && py <= y2) {
                const nextItem = items[i + 1];
                let nextWidth;
                if (nextItem) {
                    const nextRatio = nextItem.value / maxValue;
                    nextWidth = minWidth + widthRange * nextRatio;
                } else {
                    nextWidth = currentWidth * 0.15;
                }

                const leftX = Math.min(cx - currentWidth / 2, cx - nextWidth / 2);
                const rightX = Math.max(cx + currentWidth / 2, cx + nextWidth / 2);

                if (px >= leftX && px <= rightX) {
                    const prevValue = i > 0 ? items[i - 1].value : item.value;
                    const conversionRate = prevValue > 0 ? ((item.value / prevValue) * 100).toFixed(1) : "N/A";
                    const totalRate = ((item.value / items[0].value) * 100).toFixed(1);

                    return {
                        category: item.name,
                        seriesName: "Funnel",
                        value: item.value,
                        pointX: cx,
                        pointY: (y1 + y2) / 2,
                        detail: {
                            type: "漏斗图",
                            stage: item.name,
                            value: item.value,
                            conversionRate: `${conversionRate}%`,
                            totalRate: `${totalRate}%`,
                        },
                    };
                }
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
        return [`─────────`, `阶段: ${detail.stage}`, `数值: ${detail.value}`, `转化率: ${detail.conversionRate}`, `总体占比: ${detail.totalRate}`];
    }
}
