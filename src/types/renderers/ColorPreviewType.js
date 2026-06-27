/**
 * 颜色预览渲染器
 *
 * 将颜色值（hex/rgb/rgba）渲染为可视化的颜色块。
 *
 * @module types/renderers/ColorPreviewType
 */

import { BaseColumnType } from "../BaseColumnType.js";

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

        const padding = 4;
        const size = Math.min(width - padding * 2, height - padding * 2);
        const colorX = x + (width - size) / 2;
        const colorY = y + (height - size) / 2;
        const radius = this.options?.borderRadius || 4;

        // 绘制颜色块
        ctx.fillStyle = this.#normalizeColor(colorStr);
        context.drawRoundedRect(colorX, colorY, size, size, radius);
        ctx.fill();

        // 边框
        if (this.options?.showBorder !== false) {
            ctx.strokeStyle = "#ccc";
            ctx.lineWidth = 1;
            context.drawRoundedRect(colorX, colorY, size, size, radius);
            ctx.stroke();
        }
    }

    /**
     * 验证颜色值是否有效
     */
    #isValidColor(color) {
        if (!color) return false;
        const s = new Option().style;
        s.color = color;
        return s.color !== "";
    }

    /**
     * 标准化颜色值
     */
    #normalizeColor(color) {
        if (!color) return "transparent";

        // 如果是有效的颜色值，直接返回
        if (this.#isValidColor(color)) return color;

        // 尝试添加 # 前缀
        if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(color)) {
            return `#${color}`;
        }

        return "transparent";
    }
}
