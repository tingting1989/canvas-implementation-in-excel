/**
 * Canvas 渲染工具函数库
 *
 * 提供通用的 Canvas 绘图计算方法，避免在多个组件中重复实现。
 * 所有方法都是纯函数，无副作用。
 *
 * @module utils/canvasUtils
 */

import { CONFIG } from "@/constants/config";

/**
 * 从 CSS font 字符串中提取字体大小（px）
 *
 * 支持格式：
 * - "14px Microsoft YaHei"
 * - "bold 16px Arial"
 * - "italic 12px/1.5 sans-serif"
 *
 * @param {string} font - CSS font 字符串
 * @param {number} [fallback=CONFIG.DEFAULT_FONT_SIZE] - 无法解析时的默认值
 * @returns {number} 字体大小（px）
 *
 * @example
 * extractFontSize("bold 14px Microsoft YaHei");  // 14
 * extractFontSize("12px Arial");                  // 12
 * extractFontSize("");                            // 14 (默认值)
 */
export function extractFontSize(font, fallback) {
    fallback = fallback ?? (CONFIG.DEFAULT_FONT_SIZE || 14);
    if (!font) return fallback;
    
    const match = font.match(/(\d+(?:\.\d+)?)\s*px/i);
    return match ? parseFloat(match[1]) : fallback;
}

/**
 * 计算 Canvas fillText 的垂直居中基线 Y 坐标
 *
 * Canvas 的 fillText(text, x, y) 中，y 参数是文字的**基线位置**，
 * 不是文字的中心点。要实现视觉上的垂直居中，需要：
 * 1. 计算区域的几何中心 (layerY + rowH / 2)
 * 2. 加上基线偏移量（约字体大小的 35%）
 *
 * 基线偏移原理：
 * ```
 * ┌─────────────────────┐ ← layerY (区域顶部)
 * │      ↑ ascent       │   字体上升部 (~70%)
 * │      │              │
 * │ ──── ├─────────────┤ ← 几何中心 (centerY)
 * │      │    ABC       │   fillText 的 y 参数（基线）
 * │      ↓ descent      │   字体下降部 (~30%)
 * │                     │
 * └─────────────────────┘ ← layerY + rowH (区域底部)
 * ```
 *
 * @param {number} areaY - 区域顶部 Y 坐标
 * @param {number} areaHeight - 区域高度（px）
 * @param {string|number} fontOrSize - CSS font 字符串 或 字体大小数字（px）
 * @returns {number} 垂直居中的 textY 坐标（基线位置）
 *
 * @example
 * // 用于表头文字居中
 * calcCenteredTextY(0, 48, "14px Microsoft YaHei");
 * // 返回: 0 + 24 + 4.9 = 28.9
 *
 * // 用于单元格文字居中
 * calcCenteredTextY(100, 30, 12);
 * // 返回: 100 + 15 + 4.2 = 119.2
 */
export function calcCenteredTextY(areaY, areaHeight, fontOrSize) {
    const fontSize = typeof fontOrSize === 'number' 
        ? fontOrSize 
        : extractFontSize(fontOrSize);
        
    const centerY = areaY + areaHeight / 2;
    const baselineOffset = fontSize * 0.35;  // 经验值，使视觉居中
    
    return centerY + baselineOffset;
}

/**
 * 计算水平居中的 X 坐标
 *
 * @param {number} areaX - 区域左侧 X 坐标
 * @param {number} areaWidth - 区域宽度（px）
 * @returns {number} 水平居中的 X 坐标
 *
 * @example
 * calcCenteredTextX(0, 100);  // 50
 */
export function calcCenteredTextX(areaX, areaWidth) {
    return areaX + areaWidth / 2;
}

/**
 * 获取区域的几何中心坐标
 *
 * 返回纯粹的几何中心（不考虑基线偏移），
 * 适用于绘制图形、图标等非文字元素。
 *
 * @param {number} x - 区域左上角 X 坐标
 * @param {number} y - 区域左上角 Y 坐标
 * @param {number} width - 区域宽度
 * @param {number} height - 区域高度
 * @returns {{ centerX: number, centerY: number }} 几何中心坐标
 *
 * @example
 * getAreaCenter(10, 20, 100, 50);
 * // 返回: { centerX: 60, centerY: 45 }
 */
export function getAreaCenter(x, y, width, height) {
    return {
        centerX: x + width / 2,
        centerY: y + height / 2
    };
}