/**
 * 进度条渲染器（增强版）
 *
 * 将数值（0-100）渲染为彩色进度条，支持：
 * - 渐变色填充：进度条使用线性渐变，从基础色到变亮色
 * - 阶段颜色：根据百分比自动切换低/中/高三档颜色
 * - 圆角裁剪：进度条和背景轨道均支持圆角
 * - 百分比文字：在进度条上方叠加显示百分比数值
 * - 数值验证：自动校验输入值在 0-100 范围内
 *
 * 参考实现：Handsontable Progress Bar Cell Type
 * 文档：https://handsontable.com/docs/javascript-data-grid/recipes/cell-types/progress-bar/
 *
 * @module types/renderers/ProgressBarType
 */

import { BaseColumnType } from "../BaseColumnType.js";
import { CONFIG } from "../../constants/config.js";

export class ProgressBarType extends BaseColumnType {
    /**
     * 默认配置选项
     *
     * @static
     * @property {number} heightRatio    - 进度条高度占单元格高度的比例（0-1）
     * @property {number} borderRadius   - 进度条圆角半径（像素）
     * @property {boolean} showPercent   - 是否在进度条上叠加显示百分比文字
     * @property {Object} colors         - 阶段颜色配置
     * @property {string} colors.low     - 低进度颜色（0-29%）
     * @property {string} colors.medium  - 中进度颜色（30-69%）
     * @property {string} colors.high    - 高进度颜色（70-100%）
     */
    static defaultOptions = {
        heightRatio: CONFIG.PROGRESS_BAR_HEIGHT_RATIO,
        borderRadius: CONFIG.PROGRESS_BAR_BORDER_RADIUS,
        showPercent: true,
        colors: {
            low: CONFIG.PROGRESS_BAR_LOW_COLOR,
            medium: CONFIG.PROGRESS_BAR_MEDIUM_COLOR,
            high: CONFIG.PROGRESS_BAR_HIGH_COLOR,
        },
    };

    /**
     * 创建进度条渲染器实例
     *
     * 传入的 options 会与 defaultOptions 合并，覆盖同名属性。
     *
     * @param {Object} [options={}] - 自定义配置选项，参见 defaultOptions
     */
    constructor(options = {}) {
        super({ ...ProgressBarType.defaultOptions, ...options });
    }

    /**
     * 渲染器名称标识
     *
     * @returns {string} "progressBar"
     */
    get name() {
        return "progressBar";
    }

    /**
     * 关联的编辑器类型
     *
     * 进度条的值是数值，因此使用数字编辑器（numeric）。
     *
     * @returns {string} "numeric"
     */
    get editorType() {
        return "numeric";
    }

    /**
     * 获取默认单元格样式
     *
     * 进度条文字居中对齐，确保百分比文字显示在进度条正中央。
     *
     * @param {Object} baseStyle - 基础样式对象
     * @returns {Object} 合并后的样式对象
     */
    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: "center" };
    }

    /**
     * 格式化显示值
     *
     * 将数值转为带百分号的字符串，null/undefined 返回空字符串。
     *
     * @param {*} value - 原始单元格值
     * @returns {string} 格式化后的字符串（如 "75%"）
     */
    format(value) {
        return value != null ? `${value}%` : "";
    }

    /**
     * 校验输入值
     *
     * 允许空值和 null，非空值必须为 0-100 之间的数字。
     *
     * @param {*} value - 待校验的值
     * @returns {boolean|string} true 表示通过，字符串表示错误提示
     */
    validate(value) {
        if (value === "" || value == null) return true;
        const num = Number(value);
        if (isNaN(num)) return false;
        if (num < 0 || num > 100) return "数值必须在 0-100 之间";
        return true;
    }

    /**
     * 自定义渲染方法
     *
     * 渲染流程：
     * 1. 计算进度条的位置和尺寸（居中于单元格内）
     * 2. 根据百分比选择对应阶段颜色（低/中/高）
     * 3. 绘制背景轨道（灰色圆角矩形）
     * 4. 绘制进度条（带圆角裁剪 + 线性渐变填充）
     * 5. 叠加百分比文字（居中显示）
     *
     * @param {import('../CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     */
    render(context) {
        const { ctx, x, y, width, height, value, style } = context;

        const percent = Math.min(100, Math.max(0, Number(value) || 0));
        const padding = CONFIG.PROGRESS_BAR_PADDING;
        const barH = height * (this.options?.heightRatio || CONFIG.PROGRESS_BAR_HEIGHT_RATIO);
        const barW = width - padding * 2;
        const barX = x + padding;
        const barY = y + (height - barH) / 2;
        const radius = this.options?.borderRadius || CONFIG.PROGRESS_BAR_BORDER_RADIUS;

        const colors = this.options?.colors || {};
        let fillColor;
        if (percent < 30) fillColor = colors.low || CONFIG.PROGRESS_BAR_LOW_COLOR;
        else if (percent < 70) fillColor = colors.medium || CONFIG.PROGRESS_BAR_MEDIUM_COLOR;
        else fillColor = colors.high || CONFIG.PROGRESS_BAR_HIGH_COLOR;

        ctx.fillStyle = CONFIG.PROGRESS_BAR_TRACK_COLOR;
        context.drawRoundedRect(barX, barY, barW, barH, radius);
        ctx.fill();

        if (percent > 0) {
            const fillW = Math.max(radius * 2, (barW * percent) / 100);
            ctx.save();
            ctx.beginPath();
            context.drawRoundedRect(barX, barY, barW, barH, radius);
            ctx.clip();

            const gradient = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
            gradient.addColorStop(0, fillColor);
            gradient.addColorStop(1, this.#lightenColor(fillColor, 20));
            ctx.fillStyle = gradient;
            ctx.fillRect(barX, barY, fillW, barH);

            ctx.restore();
        }

        if (this.options?.showPercent !== false) {
            ctx.fillStyle = style.color || CONFIG.CELL_TEXT_COLOR;
            ctx.font = `bold ${style.fontSize || CONFIG.PROGRESS_BAR_FONT_SIZE}px ${style.fontFamily || CONFIG.DEFAULT_FONT}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${Math.round(percent)}%`, context.getCenterX(), context.getCenterY());
        }
    }

    /**
     * 颜色变亮工具函数
     *
     * 将十六进制颜色的 RGB 各通道增加固定偏移量，产生变亮效果。
     * 用于进度条的渐变终止色，使进度条具有立体光泽感。
     *
     * @param {string} hex     - 十六进制颜色值（如 "#FF4444"）
     * @param {number} percent - 变亮偏移量（0-255，直接加到各通道上）
     * @returns {string} 变亮后的十六进制颜色值（如 "#FF6666"）
     */
    #lightenColor(hex, percent) {
        const num = parseInt(hex.replace("#", ""), 16);
        const r = Math.min(255, (num >> 16) + percent);
        const g = Math.min(255, ((num >> 8) & 0x00ff) + percent);
        const b = Math.min(255, (num & 0x0000ff) + percent);
        return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
    }
}
