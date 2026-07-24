/**
 * 颜色预览渲染器
 *
 * 将颜色值（hex/rgb/rgba/hsl/hsla）渲染为可视化的颜色块。
 *
 * @module types/renderers/ColorPreviewType
 */

import { BaseColumnType } from "../BaseColumnType.js";
import { CONFIG } from "../../constants/config.js";
import { toArgb, fromArgb } from "../../shared/StyleConverter.js";

export class ColorPreviewType extends BaseColumnType {
    get name() {
        return "colorPreview";
    }

    get editorType() {
        return "text";
    }

    format(value) {
        return String(value ?? "");
    }

    validate(value) {
        if (value === "" || value == null) return true;
        const str = String(value).trim();
        if (!this.#isValidColor(str)) return "无效的颜色值";
        return true;
    }

    /**
     * 自定义渲染方法
     * @param {import('../CellRenderContext.js').CellRenderContext} context
     */
    render(context) {
        const { ctx, x, y, width, height, value } = context;

        const colorStr = String(value ?? "").trim();
        if (!colorStr) return;

        const padding = CONFIG.COLOR_PREVIEW_PADDING;
        const size = Math.min(width - padding * 2, height - padding * 2);
        const colorX = x + (width - size) / 2;
        const colorY = y + (height - size) / 2;
        const radius = this.options?.borderRadius || CONFIG.COLOR_PREVIEW_BORDER_RADIUS;

        // 绘制颜色块
        ctx.fillStyle = this.#normalizeColor(colorStr);
        context.drawRoundedRect(colorX, colorY, size, size, radius);
        ctx.fill();

        // 边框
        if (this.options?.showBorder !== false) {
            ctx.strokeStyle = CONFIG.COLOR_PREVIEW_BORDER_COLOR;
            ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
            context.drawRoundedRect(colorX, colorY, size, size, radius);
            ctx.stroke();
        }
    }

    /**
     * 验证颜色值是否有效（使用 StyleConverter 的颜色解析能力）
     */
    #isValidColor(color) {
        if (!color || typeof color !== "string") return false;
        const trimmedColor = color.trim();
        if (trimmedColor === "") return false;

        // 尝试使用 ARGB 转换来验证颜色有效性
        // toArgb 内部会使用浏览器 API 或正则验证颜色
        try {
            const argb = toArgb(trimmedColor);
            // 如果转换成功（返回有效的 ARGB 值），颜色有效
            if (argb && argb.length === 8) return true;
        } catch {
            // 转换失败，返回 false
        }

        return false;
    }

    /**
     * 标准化颜色值（确保返回有效颜色或 transparent）
     * 使用 StyleConverter 的 fromArgb 确保输出标准格式
     */
    #normalizeColor(color) {
        if (!color || color.trim() === "") return "transparent";

        const trimmedColor = color.trim();

        try {
            // 转换为 ARGB 再转回标准格式，确保一致性
            const argb = toArgb(trimmedColor);
            if (argb && argb.length === 8) {
                return fromArgb(argb);
            }
        } catch {
            // 转换失败，尝试其他方式
        }

        // 备选：尝试添加 # 前缀（处理缺少 # 的 hex 颜色）
        if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(trimmedColor)) {
            try {
                const argb = toArgb(`#${trimmedColor}`);
                if (argb && argb.length === 8) {
                    return fromArgb(argb);
                }
            } catch {
                // 继续
            }
        }

        // 所有尝试都失败，返回 transparent 作为安全回退
        return "transparent";
    }
}
