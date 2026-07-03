/**
 * 颜色预览渲染器
 *
 * 将颜色值（hex/rgb/rgba）渲染为可视化的颜色块。
 *
 * @module types/renderers/ColorPreviewType
 */

import { BaseColumnType } from "../BaseColumnType.js";
import { CONFIG } from "../../constants/config.js";

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
     * 验证颜色值是否有效（跨平台兼容）
     */
    #isValidColor(color) {
        if (!color) return false;

        // 方法1: 尝试使用浏览器 API（如果可用）
        try {
            const s = new Option().style;
            s.color = color;
            if (s.color !== "") return true;
        } catch {
            // Node.js 环境下 Option 可能不可用，继续使用正则表达式
        }

        // 方法2: 正则表达式验证（备选方案）
        const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
        const rgbPattern = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;
        const rgbaPattern = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/;
        const hslPattern = /^hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)$/;
        const hslaPattern = /^hsla\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*,\s*[\d.]+\s*\)$/;

        // CSS 预定义颜色名称
        const namedColors = [
            "red",
            "green",
            "blue",
            "yellow",
            "cyan",
            "magenta",
            "white",
            "black",
            "gray",
            "grey",
            "orange",
            "purple",
            "pink",
            "brown",
            "transparent",
            "inherit",
            "initial",
        ];

        return (
            hexPattern.test(color) ||
            rgbPattern.test(color) ||
            rgbaPattern.test(color) ||
            hslPattern.test(color) ||
            hslaPattern.test(color) ||
            namedColors.includes(color.toLowerCase())
        );
    }

    /**
     * 标准化颜色值（确保返回有效颜色或 transparent）
     */
    #normalizeColor(color) {
        if (!color || color.trim() === "") return "transparent";

        const trimmedColor = color.trim();

        // 如果是有效的颜色值，直接返回
        if (this.#isValidColor(trimmedColor)) return trimmedColor;

        // 尝试添加 # 前缀（处理缺少 # 的 hex 颜色）
        if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(trimmedColor)) {
            const withHash = `#${trimmedColor}`;
            if (this.#isValidColor(withHash)) return withHash;
        }

        // 所有尝试都失败，返回 transparent 作为安全回退
        return "transparent";
    }
}