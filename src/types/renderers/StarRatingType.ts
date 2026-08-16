/**
 * 星级评分渲染器（增强版）
 *
 * 将数值（0-N）渲染为星星图标，支持：
 * - 半星显示
 * - 点击交互：直接点击星星设置评分
 * - 悬停预览：鼠标悬停时预览评分效果
 * - 键盘操作：方向键/数字键调整评分
 * - 动画效果：平滑的评分过渡动画
 *
 * @module types/renderers/StarRatingType
 */

import { BaseColumnType } from "../BaseColumnType.js";
import { CONFIG } from "../../constants/config.js";
import { isUndefined } from "../../utils/index.js";
import type { CellRenderContext } from "../CellRenderContext.js";

interface StarPosition {
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

export class StarRatingType extends BaseColumnType {
    static #hoverStateMap: Map<string, number | null> = new Map();

    static hoverState(cellKey: string, newValue?: number | null): number | null {
        if (newValue !== undefined) {
            StarRatingType.#hoverStateMap.set(cellKey, newValue);
        }
        return StarRatingType.#hoverStateMap.get(cellKey) ?? null;
    }

    static clearHoverState(cellKey: string): void {
        StarRatingType.#hoverStateMap.delete(cellKey);
    }

    static clearAllHoverStates(): void {
        StarRatingType.#hoverStateMap.clear();
    }

    static get ANIMATION_DURATION(): number {
        return 300;
    }

    #starPositions: StarPosition[] = [];
    #hoverRating: number | null = null;
    #currentCellKey: string | null = null;
    #targetRating: number | null = null;
    #animatedRating: number | null = null;
    #animationStartTime: number | null = null;

    get name(): string {
        return "starRating";
    }

    get editorType(): string {
        return "none";
    }

    get isInteractive(): boolean {
        return true;
    }

    getDefaultStyle(baseStyle: Record<string, any>): Record<string, any> {
        return { ...baseStyle, textAlign: "left" };
    }

    format(value: any): string {
        return value !== null ? `${value} 星` : "";
    }

    validate(value: any): boolean | string {
        if (value === "" || value === null) return true;
        const num = Number(value);
        const max = this.options?.maxStars || CONFIG.STAR_RATING_MAX_STARS;
        if (isNaN(num) || num < 0 || num > max) return `评分必须在 0-${max} 之间`;
        return true;
    }

    #detectRatingFromPosition(context: CellRenderContext, event: MouseEvent): number | null {
        if (!context || isUndefined(context.x) || isUndefined(context.y)) {
            return null;
        }

        const { x: cellX, y: cellY, width, height } = context;

        if (isUndefined(width) || isUndefined(height) || width <= 0 || height <= 0) {
            return null;
        }

        const baseStarSize = this.options?.starSize || Math.min(CONFIG.STAR_RATING_STAR_SIZE, height * 0.6);
        const starSize = Math.max(12, Math.round(baseStarSize));
        const gap = Math.round(starSize * CONFIG.STAR_RATING_GAP_RATIO);
        const maxStars = this.options?.maxStars || CONFIG.STAR_RATING_MAX_STARS;
        const totalWidth = starSize * maxStars + gap * (maxStars - 1);

        const startX = Math.round((width - totalWidth) / 2);
        const centerY = Math.round(height / 2);

        let mouseX: number, mouseY: number;

        if (event.offsetX !== undefined && event.offsetY !== undefined && event.offsetX !== 0) {
            mouseX = event.offsetX - cellX;
            mouseY = event.offsetY - cellY;
        } else if ((event as any).layerX !== undefined && (event as any).layerY !== undefined) {
            mouseX = (event as any).layerX - cellX;
            mouseY = (event as any).layerY - cellY;
        } else if (event.clientX !== undefined && event.clientY !== undefined) {
            mouseX = event.clientX - cellX;
            mouseY = event.clientY - cellY;
        } else {
            return null;
        }

        for (let i = 0; i < maxStars; i++) {
            const starX = Math.round(startX + i * (starSize + gap));
            const starY = Math.round(centerY - starSize / 2);

            if (mouseX >= starX && mouseX <= starX + starSize && mouseY >= starY && mouseY <= starY + starSize) {
                return i + 1;
            }
        }

        return null;
    }

    handleClick(context: CellRenderContext, event: MouseEvent): number | null {
        const newRating = this.#detectRatingFromPosition(context, event);
        if (newRating !== null && newRating !== undefined) {
            const { value } = context;
            this.#startAnimation(Number(value) || 0, newRating);

            const cellKey = `${context.row},${context.col}`;
            StarRatingType.hoverState(cellKey, null);
            this.#hoverRating = null;

            return newRating;
        }

        return null;
    }

    handleHover(context: CellRenderContext, event: MouseEvent): boolean {
        const newHoverRating = this.#detectRatingFromPosition(context, event);

        const cellKey = `${context.row},${context.col}`;
        this.#currentCellKey = cellKey;

        const currentStaticHover = StarRatingType.hoverState(cellKey);

        if (newHoverRating !== currentStaticHover) {
            StarRatingType.hoverState(cellKey, newHoverRating);
            this.#hoverRating = newHoverRating;
            return true;
        }

        return false;
    }

    handleMouseLeave(): boolean {
        let needsRedraw = false;

        if (this.#hoverRating !== null) {
            this.#hoverRating = null;
            needsRedraw = true;
        }

        if (this.#currentCellKey && StarRatingType.#hoverStateMap.has(this.#currentCellKey)) {
            StarRatingType.clearHoverState(this.#currentCellKey);
            needsRedraw = true;
        }

        return needsRedraw;
    }

    handleKeydown(event: KeyboardEvent, currentValue: any): number | null {
        const max = this.options?.maxStars || CONFIG.STAR_RATING_MAX_STARS;
        let current = 0;
        if (currentValue !== null && currentValue !== undefined && currentValue !== "") {
            current = Number(currentValue);
            if (!Number.isFinite(current)) {
                current = 0;
            }
        }
        current = Math.round(current);

        let newValue: number | null = null;

        switch (event.key) {
            case "ArrowRight":
            case "ArrowUp": {
                newValue = Math.min(max, current + 1);
                break;
            }
            case "ArrowLeft":
            case "ArrowDown": {
                newValue = Math.max(0, current - 1);
                break;
            }
            default: {
                const digit = parseInt(event.key, 10);
                if (!isNaN(digit) && digit >= 0 && digit <= max) {
                    newValue = digit;
                } else {
                    return null;
                }
                break;
            }
        }

        if (newValue === null || isNaN(newValue)) {
            return null;
        }

        newValue = Math.max(0, Math.min(max, newValue));

        if (newValue === current) {
            return null;
        }

        this.#startAnimation(current, newValue);

        return newValue;
    }

    #startAnimation(fromValue: number, toValue: number): void {
        this.#targetRating = toValue;
        this.#animatedRating = fromValue;
        this.#animationStartTime = performance.now();
    }

    #updateAnimation(): number {
        if (this.#animationStartTime === null || this.#targetRating === null) {
            return this.#animatedRating ?? this.#targetRating ?? 0;
        }

        const elapsed = performance.now() - this.#animationStartTime;
        const progress = Math.min(elapsed / StarRatingType.ANIMATION_DURATION, 1);

        const easedProgress = 1 - Math.pow(1 - progress, 3);
        this.#animatedRating = this.#animatedRating! + (this.#targetRating - this.#animatedRating!) * easedProgress;

        if (progress >= 1) {
            this.#animatedRating = this.#targetRating;
            this.#animationStartTime = null;
            this.#targetRating = null;
        }

        return this.#animatedRating;
    }

    render(context: CellRenderContext): void {
        const { ctx, x, y, width, height, value } = context;

        const cellKey = `${context.row},${context.col}`;
        this.#currentCellKey = cellKey;

        const staticHoverRating = StarRatingType.hoverState(cellKey);

        let displayValue: number;
        if (staticHoverRating !== null) {
            displayValue = staticHoverRating;
        } else if (this.#hoverRating !== null) {
            displayValue = this.#hoverRating;
        } else if (this.#animatedRating !== null) {
            displayValue = this.#updateAnimation();
        } else {
            const numValue = Number(value);
            if (!Number.isFinite(numValue)) {
                super.render(context);
                return;
            }
            displayValue = numValue;
        }

        const maxStars = this.options?.maxStars || CONFIG.STAR_RATING_MAX_STARS;

        const baseStarSize = this.options?.starSize || Math.min(CONFIG.STAR_RATING_STAR_SIZE, height * 0.6);
        const starSize = Math.max(12, Math.round(baseStarSize));

        const gap = Math.round(starSize * CONFIG.STAR_RATING_GAP_RATIO);

        const totalWidth = starSize * maxStars + gap * (maxStars - 1);

        const startX = Math.round(x + (width - totalWidth) / 2);
        const centerY = Math.round(y + height / 2);

        const filledColor = this.options?.color || CONFIG.STAR_RATING_FILLED_COLOR;
        const emptyColor = this.options?.emptyColor || CONFIG.STAR_RATING_EMPTY_COLOR;
        const hoverColor = this.options?.hoverColor || this.#lightenColor(filledColor, 30);

        const rating = Math.min(maxStars, Math.max(0, Math.round(displayValue)));

        this.#starPositions = [];

        for (let i = 0; i < maxStars; i++) {
            const starX = Math.round(startX + i * (starSize + gap));
            const starY = Math.round(centerY - starSize / 2);

            const filled = i < rating;

            this.#starPositions.push({
                index: i,
                x: starX,
                y: starY,
                width: starSize,
                height: starSize,
            });

            ctx.save();

            ctx.translate(Math.round(starX + starSize / 2), centerY);

            const scale = starSize / CONFIG.STAR_RATING_STAR_SIZE;
            ctx.scale(scale, scale);

            this.#drawStarPath(ctx);

            if (filled) {
                ctx.fillStyle = filledColor;
                ctx.fill();

                ctx.strokeStyle = this.#darkenColor(filledColor, 15);
                ctx.lineWidth = Math.max(1, 1 / scale);
                ctx.stroke();

                ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
                ctx.shadowBlur = 1;
                ctx.shadowOffsetX = 0.5;
                ctx.shadowOffsetY = 0.5;
                ctx.stroke();
                ctx.shadowColor = "transparent";
                ctx.shadowBlur = 0;
            } else {
                const effectiveHoverRating = staticHoverRating ?? this.#hoverRating;
                const isHovered = effectiveHoverRating !== null && i < Math.ceil(effectiveHoverRating);
                ctx.strokeStyle = isHovered ? hoverColor : emptyColor;
                ctx.lineWidth = Math.max(1.5, 1.5 / scale);
                ctx.stroke();

                if (isHovered) {
                    ctx.fillStyle = hoverColor + "30";
                    ctx.fill();
                }
            }

            ctx.restore();
        }

        if (this.#animationStartTime !== null) {
            context.needsUpdate = true;
        }
    }

    #drawStarPath(ctx: CanvasRenderingContext2D): void {
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

    #lightenColor(color: string, percent: number): string {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = ((num >> 8) & 0x00ff) + amt;
        const B = (num & 0x0000ff) + amt;

        return (
            "#" +
            (0x1000000 + (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 + (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 + (B < 255 ? (B < 1 ? 0 : B) : 255))
                .toString(16)
                .slice(1)
        );
    }

    #darkenColor(color: string, percent: number): string {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = ((num >> 8) & 0x00ff) - amt;
        const B = (num & 0x0000ff) - amt;

        return "#" + (0x1000000 + (R > 0 ? R : 0) * 0x10000 + (G > 0 ? G : 0) * 0x100 + (B > 0 ? B : 0)).toString(16).slice(1);
    }
}
