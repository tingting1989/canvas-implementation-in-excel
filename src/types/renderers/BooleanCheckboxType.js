/**
 * 布尔复选框渲染器
 *
 * 将布尔值渲染为可视化的复选框（☑ 或 ☐），而非简单的 TRUE/FALSE 文字。
 *
 * @module types/renderers/BooleanCheckboxType
 */

import { BaseColumnType } from "../BaseColumnType.js";

export class BooleanCheckboxType extends BaseColumnType {
    get name() {
        return "checkbox";
    }

    get editorType() {
        return "text";
    }

    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: "center" };
    }

    format(value) {
        return String(value ?? "");
    }

    parse(input) {
        if (input === "" || input == null) return "";
        const str = String(input).toLowerCase().trim();
        if (["true", "yes", "1", "是"].includes(str)) return true;
        if (["false", "no", "0", "否"].includes(str)) return false;
        return input;
    }

    /**
     * 自定义渲染方法
     * @param {import('../CellRenderContext.js').CellRenderContext} context
     */
    render(context) {
        const { ctx, x, y, width, height, value, isDisabled } = context;

        const isChecked = Boolean(value);
        const sizeRatio = this.options?.size || 0.6;
        const boxSize = Math.min(width, height) * sizeRatio;
        const boxX = x + (width - boxSize) / 2;
        const boxY = y + (height - boxSize) / 2;
        const radius = boxSize * 0.15;

        // 未选中：空心方框
        ctx.strokeStyle = this.options?.uncheckedColor || "#999";
        ctx.lineWidth = 2;
        context.drawRoundedRect(boxX, boxY, boxSize, boxSize, radius);
        ctx.stroke();

        if (isChecked) {
            // 选中：填充背景 + 对勾
            ctx.fillStyle = this.options?.checkedColor || "#4caf50";
            context.drawRoundedRect(boxX, boxY, boxSize, boxSize, radius);
            ctx.fill();

            // 绘制对勾
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            const checkSize = boxSize * 0.5;
            const cx = boxX + boxSize / 2;
            const cy = boxY + boxSize / 2;

            ctx.beginPath();
            ctx.moveTo(cx - checkSize * 0.4, cy);
            ctx.lineTo(cx - checkSize * 0.1, cy + checkSize * 0.35);
            ctx.lineTo(cx + checkSize * 0.45, cy - checkSize * 0.35);
            ctx.stroke();
        }

        // 禁用态：降低透明度
        if (isDisabled) {
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = "#ccc";
            context.drawRoundedRect(boxX, boxY, boxSize, boxSize, radius);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
}
