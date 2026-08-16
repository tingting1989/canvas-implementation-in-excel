/**
 * 布尔复选框渲染器（CheckboxColumnType）
 *
 * 将布尔值渲染为可视化的复选框（☑ 或 ☐），而非简单的 TRUE/FALSE 文字。
 * 适用于需要直观展示布尔状态的场景，如任务完成状态、启用/禁用开关等。
 *
 * @module types/renderers/CheckboxColumnType
 * @see BaseColumnType 列类型基类，定义 name、editorType、format、parse 等接口
 */

import { BaseColumnType } from "../BaseColumnType.js";
import { CONFIG } from "../../constants/config.js";
import type { CellRenderContext } from "../CellRenderContext.js";

export class CheckboxColumnType extends BaseColumnType {
    get name(): string {
        return "checkbox";
    }

    get editorType(): string {
        return "text";
    }

    getDefaultStyle(baseStyle: Record<string, any>): Record<string, any> {
        return { ...baseStyle, textAlign: "center" };
    }

    format(value: any): string {
        return String(value ?? "");
    }

    parse(input: any): boolean | string {
        if (input === "" || input == null) return "";
        const str = String(input).toLowerCase().trim();
        if (["true", "yes", "1", "是"].includes(str)) return true;
        if (["false", "no", "0", "否"].includes(str)) return false;
        return input;
    }

    render(context: CellRenderContext): void {
        const { ctx, x, y, width, height, value, isDisabled } = context;

        const isChecked = Boolean(value);
        const sizeRatio = this.options?.size || CONFIG.CHECKBOX_SIZE_RATIO;
        const boxSize = Math.min(width, height) * sizeRatio;
        const boxX = x + (width - boxSize) / 2;
        const boxY = y + (height - boxSize) / 2;
        const radius = boxSize * CONFIG.CHECKBOX_CORNER_RADIUS_RATIO;

        ctx.strokeStyle = this.options?.uncheckedColor || CONFIG.CHECKBOX_UNCHECKED_COLOR;
        ctx.lineWidth = CONFIG.CHECKBOX_BORDER_LINE_WIDTH;
        context.drawRoundedRect(boxX, boxY, boxSize, boxSize, radius);
        ctx.stroke();

        if (isChecked) {
            ctx.fillStyle = this.options?.checkedColor || CONFIG.CHECKBOX_CHECKED_COLOR;
            context.drawRoundedRect(boxX, boxY, boxSize, boxSize, radius);
            ctx.fill();

            ctx.strokeStyle = CONFIG.CHECKBOX_CHECK_MARK_COLOR;
            ctx.lineWidth = CONFIG.CHECKBOX_CHECK_MARK_LINE_WIDTH;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            const checkSize = boxSize * CONFIG.CHECKBOX_CHECK_MARK_SIZE_RATIO;
            const cx = boxX + boxSize / 2;
            const cy = boxY + boxSize / 2;

            ctx.beginPath();
            ctx.moveTo(cx - checkSize * 0.4, cy);
            ctx.lineTo(cx - checkSize * 0.1, cy + checkSize * 0.35);
            ctx.lineTo(cx + checkSize * 0.45, cy - checkSize * 0.35);
            ctx.stroke();
        }

        if (isDisabled) {
            ctx.globalAlpha = CONFIG.CHECKBOX_DISABLED_ALPHA;
            ctx.fillStyle = CONFIG.CHECKBOX_DISABLED_FILL;
            context.drawRoundedRect(boxX, boxY, boxSize, boxSize, radius);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
}
