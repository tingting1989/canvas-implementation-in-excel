import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { CONFIG } from "../../constants/config.js";
import { BorderMask } from "./models/BorderMask.js";
import type { Fragment } from "./models/Fragment.js";

interface PaintExtras {
    isTopLayer?: boolean;
    columnHeaderRenderers?: Array<(ctx: CanvasRenderingContext2D, col: number, x: number, y: number, w: number, h: number) => void>;
}

export class HeaderPainter {
    paintAll(ctx: CanvasRenderingContext2D, fragments: (Fragment | null)[], extras: PaintExtras = {}): void {
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

    #shouldSuppressLeft(fragments: (Fragment | null)[], currentIndex: number): boolean {
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

    #paintBackground(ctx: CanvasRenderingContext2D, frag: Fragment): void {
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

    #paintText(ctx: CanvasRenderingContext2D, frag: Fragment): void {
        const { text, textX, textY, font, textAlign, mergedStyle, maxTextWidth } = frag;
        if (!text) return;

        ctx.font = font;
        ctx.textAlign = textAlign as CanvasTextAlign;
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

    #paintBorders(ctx: CanvasRenderingContext2D, frag: Fragment, suppressLeft: boolean, isTopLayer: boolean): void {
        const { x, y, w, h, borderMask } = frag;

        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;

        if (borderMask & BorderMask.RIGHT) this.#drawVLine(ctx, x + w, y, y + h);
        if (borderMask & BorderMask.BOTTOM) this.#drawHLine(ctx, x, y + h, x + w);
        if (!suppressLeft && borderMask & BorderMask.LEFT) this.#drawVLine(ctx, x, y, y + h);

        if (isTopLayer) {
            this.#drawHLine(ctx, x, y, x + w);
        }
    }

    #drawVLine(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number): void {
        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.beginPath();
        ctx.moveTo(x - 0.5, y1);
        ctx.lineTo(x - 0.5, y2);
        ctx.stroke();
    }

    #drawHLine(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number): void {
        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.beginPath();
        ctx.moveTo(x1, y - 0.5);
        ctx.lineTo(x2, y - 0.5);
        ctx.stroke();
    }
}
