import { ERROR_CODE, errorHandler } from "@/core/ErrorHandler";
import { CONFIG } from "@/constants/config";
import { BorderMask } from "./models/BorderMask.js";

export class HeaderPainter {
    /**
     * 绘制所有片段
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {import("./models/Fragment.js").Fragment[]} fragments
     * @param {object} extras
     */
    paintAll(ctx, fragments, extras = {}) {
        for (const frag of fragments) {
            if (!frag) continue;
            this.#paintBackground(ctx, frag);
            this.#paintText(ctx, frag);
            this.#paintBorders(ctx, frag);
        }

        if (extras.layerBottomY != null) {
            this.#paintLayerBottomBorder(ctx, fragments, extras.layerBottomY, extras.vt, extras.rc);
        }

        if (extras.columnHeaderRenderers) {
            for (const frag of fragments) {
                if (!frag) continue;
                for (const renderer of extras.columnHeaderRenderers) {
                    try {
                        renderer(ctx, frag.visStartCol, frag.x, frag.y, frag.w, frag.h);
                    } catch (e) {
                        errorHandler.warn(ERROR_CODE.GENERIC_WARN, "[HeaderPainter] columnHeaderRenderer error:", e);
                    }
                }
            }
        }
    }

    #paintBackground(ctx, frag) {
        const { x, y, w, h, isSource, isHighlighted, mergedStyle } = frag;

        ctx.save();

        if (isSource) {
            ctx.fillStyle = CONFIG.MOVE_SOURCE_FILL;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else if (isHighlighted) {
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_BG;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else {
            if (mergedStyle?.backgroundColor) {
                ctx.fillStyle = mergedStyle.backgroundColor;
                ctx.fillRect(x, y, w, h);
            }
            ctx.fillStyle = mergedStyle?.color || CONFIG.HEADER_TEXT_COLOR;
        }

        ctx.restore();
    }

    #paintText(ctx, frag) {
        const { text, textX, textY, font, textAlign, mergedStyle, maxTextWidth } = frag;
        if (!text) return;

        ctx.font = font;
        ctx.textAlign = textAlign;
        if (mergedStyle?.color) ctx.fillStyle = mergedStyle.color;

        if (maxTextWidth && ctx.measureText(text).width > maxTextWidth) {
            const ellipsis = "...";
            let truncated = text;
            while (truncated.length > 0 && ctx.measureText(truncated + ellipsis).width > maxTextWidth) {
                truncated = truncated.slice(0, -1);
            }
            ctx.fillText(truncated + ellipsis, textX, textY);
        } else {
            ctx.fillText(text, textX, textY);
        }
    }

    #paintBorders(ctx, frag) {
        const { x, y, w, h, borderMask } = frag;

        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.lineWidth = 1;

        if (borderMask & BorderMask.RIGHT) this.#drawVLine(ctx, x + w, y, y + h);
        if (borderMask & BorderMask.BOTTOM) this.#drawHLine(ctx, x, y + h, x + w);
        if (borderMask & BorderMask.LEFT) this.#drawVLine(ctx, x, y, y + h);
        if (borderMask & BorderMask.TOP) this.#drawHLine(ctx, x, y, x + w);
    }

    #paintLayerBottomBorder(ctx, fragments, bottomY, vt, rc) {
        if (fragments.length === 0) return;

        let leftmostX = Infinity;
        let rightmostX = -Infinity;

        for (const frag of fragments) {
            if (!frag) continue;
            leftmostX = Math.min(leftmostX, frag.x);
            rightmostX = Math.max(rightmostX, frag.x + frag.w);
        }

        if (rightmostX > leftmostX) {
            this.#drawHLine(ctx, leftmostX, bottomY, rightmostX);
        }
    }

    #drawVLine(ctx, x, y1, y2) {
        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.stroke();
    }

    #drawHLine(ctx, x1, y, x2) {
        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
    }
}
