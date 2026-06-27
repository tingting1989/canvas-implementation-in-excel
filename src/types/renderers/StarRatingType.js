/**
 * 星级评分渲染器
 *
 * 将数值（0-N）渲染为星星图标，支持半星显示。
 *
 * @module types/renderers/StarRatingType
 */

import { BaseColumnType } from "../BaseColumnType.js";

export class StarRatingType extends BaseColumnType {
    get name() {
        return "starRating";
    }

    get editorType() {
        return "numeric";
    }

    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: "left" };
    }

    format(value) {
        return value != null ? `${value} 星` : "";
    }

    validate(value) {
        if (value === "" || value == null) return true;
        const num = Number(value);
        const max = this.options?.maxStars || 5;
        if (isNaN(num) || num < 0 || num > max) return `评分必须在 0-${max} 之间`;
        return true;
    }

    /**
     * 自定义渲染方法
     * @param {import('../CellRenderContext.js').CellRenderContext} context
     */
    render(context) {
        const { ctx, x, y, width, height, value } = context;

        const rating = Math.min(this.options?.maxStars || 5, Math.max(0, Number(value) || 0));
        const starSize = this.options?.starSize || Math.min(16, height * 0.6);
        const gap = starSize * 0.2;
        const startX = x + (width - (starSize * 5 + gap * 4)) / 2; // 居中
        const centerY = y + height / 2;

        const filledColor = this.options?.color || "#ffc107";
        const emptyColor = this.options?.emptyColor || "#e0e0e0";

        for (let i = 0; i < 5; i++) {
            const starX = startX + i * (starSize + gap);
            const filled = i < Math.floor(rating);
            const partial = !filled && i < rating && i >= Math.floor(rating);

            ctx.save();
            ctx.translate(starX + starSize / 2, centerY);
            ctx.scale(starSize / 16, starSize / 16);

            this.#drawStarPath(ctx);

            if (filled) {
                ctx.fillStyle = filledColor;
                ctx.fill();
            } else if (partial) {
                // 半星效果：裁剪一半
                const fraction = rating - Math.floor(rating);
                ctx.save();
                ctx.rect(-10, -10, 20 * fraction, 20);
                ctx.clip();
                ctx.fillStyle = filledColor;
                ctx.fill();
                ctx.restore();

                ctx.strokeStyle = emptyColor;
                ctx.lineWidth = 1;
                ctx.stroke();
            } else {
                ctx.strokeStyle = emptyColor;
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            ctx.restore();
        }
    }

    /**
     * 绘制五角星路径（中心在原点，尺寸 20x20）
     */
    #drawStarPath(ctx) {
        const outerRadius = 8;
        const innerRadius = 3.2;
        const spikes = 5;

        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i * Math.PI) / spikes - Math.PI / 2;
            const px = Math.cos(angle) * radius;
            const py = Math.sin(angle) * radius;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }
}
