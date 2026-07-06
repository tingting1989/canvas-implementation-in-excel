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
        const isTopLayer = extras.isTopLayer !== false;

        for (let i = 0; i < fragments.length; i++) {
            const frag = fragments[i];
            if (!frag) continue;
            this.#paintBackground(ctx, frag);
            this.#paintText(ctx, frag);

            const suppressLeft = this.#shouldSuppressLeft(fragments, i);
            this.#paintBorders(ctx, frag, suppressLeft, isTopLayer);
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

    /**
     * 判断是否应抑制当前 Fragment 的 LEFT 边框
     *
     * 只有当「前一个在同一行的 Fragment 画了 RIGHT 边框」时才抑制，
     * 这样可以避免相邻共享边被画两次。
     *
     * 特殊情况保护：
     *   - MERGED_DEFAULT 不画 RIGHT，所以下一个 Fragment 的 LEFT 不会被错误抑制
     *   - 跨冻结边界的 FROZEN_SIDE/SCROLL_SIDE 也不会互相干扰（y 不同）
     *
     * @param {import("./models/Fragment.js").Fragment[]} fragments
     * @param {number} currentIndex
     * @returns {boolean}
     */
    #shouldSuppressLeft(fragments, currentIndex) {
        if (currentIndex <= 0) return false;

        const prev = fragments[currentIndex - 1];
        const curr = fragments[currentIndex];

        if (!prev || !curr) return false;

        const prevDrawsRight = !!(prev.borderMask & BorderMask.RIGHT);
        if (!prevDrawsRight) return false;

        const sameRow = Math.abs(prev.y - curr.y) < 1;
        const adjacentX = Math.abs(prev.x + prev.w - curr.x) < 1;

        return sameRow && adjacentX;
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

    #paintBorders(ctx, frag, suppressLeft, isTopLayer) {
        const { x, y, w, h, borderMask } = frag;

        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;

        if (borderMask & BorderMask.RIGHT) this.#drawVLine(ctx, x + w, y, y + h);
        if (borderMask & BorderMask.BOTTOM) this.#drawHLine(ctx, x, y + h, x + w);
        if (!suppressLeft && borderMask & BorderMask.LEFT) this.#drawVLine(ctx, x, y, y + h);

        // 顶层（嵌套表头第一层）必须画顶边框，作为整个表头的上边界
        if (isTopLayer) {
            this.#drawHLine(ctx, x, y, x + w);
        }
    }

    #drawVLine(ctx, x, y1, y2) {
        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.beginPath();
        ctx.moveTo(x - 0.5, y1);
        ctx.lineTo(x - 0.5, y2);
        ctx.stroke();
    }

    #drawHLine(ctx, x1, y, x2) {
        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.beginPath();
        ctx.moveTo(x1, y - 0.5);
        ctx.lineTo(x2, y - 0.5);
        ctx.stroke();
    }
}
