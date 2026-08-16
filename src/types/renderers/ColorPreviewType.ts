/**
 * 颜色预览渲染器（ColorPreviewType）
 *
 * 将颜色值（hex / rgb / rgba / hsl / hsla）渲染为可视化的圆角颜色块，
 * 而非直接显示颜色文本。适用于需要直观展示颜色值的场景，
 * 如调色板、主题配置、数据可视化中的颜色标注等。
 *
 * @module types/renderers/ColorPreviewType
 * @see BaseColumnType 列类型基类，定义 name、editorType、format、parse 等接口
 * @see StyleConverter 颜色转换工具，提供 toArgb / fromArgb 方法
 */

import { BaseColumnType } from "../BaseColumnType.js";
import { CONFIG } from "../../constants/config.js";
import { toArgb, fromArgb } from "../../shared/StyleConverter.js";
import type { CellRenderContext } from "../CellRenderContext.js";

export class ColorPreviewType extends BaseColumnType {
    get name(): string {
        return "colorPreview";
    }

    get editorType(): string {
        return "text";
    }

    format(value: any): string {
        return String(value ?? "");
    }

    validate(value: any): boolean | string {
        if (value === "" || value == null) return true;
        const str = String(value).trim();
        if (!this.#isValidColor(str)) return "无效的颜色值";
        return true;
    }

    render(context: CellRenderContext): void {
        const { ctx, x, y, width, height, value } = context;

        const colorStr = String(value ?? "").trim();
        if (!colorStr) return;

        const padding = CONFIG.COLOR_PREVIEW_PADDING;
        const size = Math.min(width - padding * 2, height - padding * 2);
        const colorX = x + (width - size) / 2;
        const colorY = y + (height - size) / 2;
        const radius = this.options?.borderRadius || CONFIG.COLOR_PREVIEW_BORDER_RADIUS;

        ctx.fillStyle = this.#normalizeColor(colorStr);
        context.drawRoundedRect(colorX, colorY, size, size, radius);
        ctx.fill();

        if (this.options?.showBorder !== false) {
            ctx.strokeStyle = CONFIG.COLOR_PREVIEW_BORDER_COLOR;
            ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
            context.drawRoundedRect(colorX, colorY, size, size, radius);
            ctx.stroke();
        }
    }

    #isValidColor(color: string): boolean {
        if (!color || typeof color !== "string") return false;
        const trimmedColor = color.trim();
        if (trimmedColor === "") return false;

        try {
            const argb = toArgb(trimmedColor);
            if (argb && argb.length === 8) return true;
        } catch {
            // toArgb 解析失败，颜色无效
        }

        return false;
    }

    #normalizeColor(color: string): string {
        if (!color || color.trim() === "") return "transparent";

        const trimmedColor = color.trim();

        try {
            const argb = toArgb(trimmedColor);
            if (argb && argb.length === 8) {
                return fromArgb(argb);
            }
        } catch {
            // 转换失败，尝试备选策略
        }

        if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(trimmedColor)) {
            try {
                const argb = toArgb(`#${trimmedColor}`);
                if (argb && argb.length === 8) {
                    return fromArgb(argb);
                }
            } catch {
                // 补前缀后仍失败，继续回退
            }
        }

        return "transparent";
    }
}
