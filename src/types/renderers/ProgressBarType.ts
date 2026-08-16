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
 * @module types/renderers/ProgressBarType
 */

import { BaseColumnType } from "../BaseColumnType.js";
import { CONFIG } from "../../constants/config.js";
import type { CellRenderContext } from "../CellRenderContext.js";

export interface ProgressBarColors {
    low?: string;
    medium?: string;
    high?: string;
}

export interface ProgressBarOptions {
    heightRatio?: number;
    borderRadius?: number;
    showPercent?: boolean;
    colors?: ProgressBarColors;
}

export class ProgressBarType extends BaseColumnType {
    static defaultOptions: ProgressBarOptions = {
        heightRatio: CONFIG.PROGRESS_BAR_HEIGHT_RATIO,
        borderRadius: CONFIG.PROGRESS_BAR_BORDER_RADIUS,
        showPercent: true,
        colors: {
            low: CONFIG.PROGRESS_BAR_LOW_COLOR,
            medium: CONFIG.PROGRESS_BAR_MEDIUM_COLOR,
            high: CONFIG.PROGRESS_BAR_HIGH_COLOR,
        },
    };

    constructor(options: ProgressBarOptions = {}) {
        super({ ...ProgressBarType.defaultOptions, ...options });
    }

    get name(): string {
        return "progressBar";
    }

    get editorType(): string {
        return "numeric";
    }

    getDefaultStyle(baseStyle: Record<string, any>): Record<string, any> {
        return { ...baseStyle, textAlign: "center" };
    }

    format(value: any): string {
        return value != null ? `${value}%` : "";
    }

    validate(value: any): boolean | string {
        if (value === "" || value == null) return true;
        const num = Number(value);
        if (isNaN(num)) return false;
        if (num < 0 || num > 100) return "数值必须在 0-100 之间";
        return true;
    }

    render(context: CellRenderContext): void {
        const { ctx, x, y, width, height, value, style } = context;

        const percent = Math.min(100, Math.max(0, Number(value) || 0));
        const padding = CONFIG.PROGRESS_BAR_PADDING;
        const barH = height * (this.options?.heightRatio || CONFIG.PROGRESS_BAR_HEIGHT_RATIO);
        const barW = width - padding * 2;
        const barX = x + padding;
        const barY = y + (height - barH) / 2;
        const radius = this.options?.borderRadius || CONFIG.PROGRESS_BAR_BORDER_RADIUS;

        const colors = this.options?.colors || {};
        let fillColor: string;
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
            ctx.font = `bold ${style.fontSize || CONFIG.PROGRESS_BAR_FONT_SIZE}px ${style.fontFamily || CONFIG.DEFAULT_FONT_FAMILY}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${Math.round(percent)}%`, context.getCenterX(), context.getCenterY());
        }
    }

    #lightenColor(hex: string, percent: number): string {
        const num = parseInt(hex.replace("#", ""), 16);
        const r = Math.min(255, (num >> 16) + percent);
        const g = Math.min(255, ((num >> 8) & 0x00ff) + percent);
        const b = Math.min(255, (num & 0x0000ff) + percent);
        return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
    }
}
