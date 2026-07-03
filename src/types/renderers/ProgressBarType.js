/**
 * 进度条渲染器
 *
 * 将数值（0-100）渲染为彩色进度条，支持渐变色和动画效果提示。
 *
 * @module types/renderers/ProgressBarType
 */

import { BaseColumnType } from "../BaseColumnType.js";
import { CONFIG } from "../../constants/config.js";

export class ProgressBarType extends BaseColumnType {
    /**
     * 默认配置选项
     */
    static defaultOptions = {
        heightRatio: 0.6,
        borderRadius: 4,
        showPercent: true,
        colors: {
            low: CONFIG.PROGRESS_BAR_LOW_COLOR,
            medium: CONFIG.PROGRESS_BAR_MEDIUM_COLOR,
            high: CONFIG.PROGRESS_BAR_HIGH_COLOR,
        },
    };

    constructor(options = {}) {
        super({ ...ProgressBarType.defaultOptions, ...options });
    }

    get name() {
        return "progressBar";
    }

    get editorType() {
        return "numeric";
    }

    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: "center" };
    }

    format(value) {
        return value != null ? `${value}%` : "";
    }

    validate(value) {
        if (value === "" || value == null) return true;
        const num = Number(value);
        if (isNaN(num)) return false;
        if (num < 0 || num > 100) return "数值必须在 0-100 之间";
        return true;
    }

    /**
     * 自定义渲染方法
     * @param {import('../CellRenderContext.js').CellRenderContext} context
     */
    render(context) {
        const { ctx, x, y, width, height, value, style } = context;

        const percent = Math.min(100, Math.max(0, Number(value) || 0));
        const padding = 6;
        const barH = height * (this.options?.heightRatio || 0.6);
        const barW = width - padding * 2;
        const barX = x + padding;
        const barY = y + (height - barH) / 2;
        const radius = this.options?.borderRadius || 4;

        // 根据百分比选择颜色
        const colors = this.options?.colors || {};
        let fillColor;
        if (percent < 30) fillColor = colors.low || CONFIG.PROGRESS_BAR_LOW_COLOR;
        else if (percent < 70) fillColor = colors.medium || CONFIG.PROGRESS_BAR_MEDIUM_COLOR;
        else fillColor = colors.high || CONFIG.PROGRESS_BAR_HIGH_COLOR;

        // 背景轨道
        ctx.fillStyle = CONFIG.PROGRESS_BAR_TRACK_COLOR;
        context.drawRoundedRect(barX, barY, barW, barH, radius);
        ctx.fill();

        // 进度条（带圆角裁剪）
        if (percent > 0) {
            const fillW = Math.max(radius * 2, (barW * percent) / 100);
            ctx.save();
            ctx.beginPath();
            context.drawRoundedRect(barX, barY, barW, barH, radius);
            ctx.clip();

            // 渐变填充
            const gradient = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
            gradient.addColorStop(0, fillColor);
            gradient.addColorStop(1, this.#lightenColor(fillColor, 20));
            ctx.fillStyle = gradient;
            ctx.fillRect(barX, barY, fillW, barH);

            ctx.restore();
        }

        // 百分比文字
        if (this.options?.showPercent !== false) {
            ctx.fillStyle = style.color || CONFIG.CELL_TEXT_COLOR;
            ctx.font = `bold ${style.fontSize || CONFIG.PROGRESS_BAR_FONT_SIZE}px ${style.fontFamily || CONFIG.DEFAULT_FONT}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${Math.round(percent)}%`, context.getCenterX(), context.getCenterY());
        }
    }

    /**
     * 颜色变亮
     */
    #lightenColor(hex, percent) {
        const num = parseInt(hex.replace("#", ""), 16);
        const r = Math.min(255, (num >> 16) + percent);
        const g = Math.min(255, ((num >> 8) & 0x00ff) + percent);
        const b = Math.min(255, (num & 0x0000ff) + percent);
        return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
    }
}
