import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { CONFIG } from "../../constants/config.js";
import { BorderMask } from "./models/BorderMask.js";
import type { Fragment } from "./models/Fragment.js";

/** paintAll 方法的附加参数接口 */
interface PaintExtras {
    /** 是否为最上层（绘制顶部边框），默认 true */
    isTopLayer?: boolean;
    /** 列头自定义渲染器数组 */
    columnHeaderRenderers?: Array<(ctx: CanvasRenderingContext2D, col: number, x: number, y: number, w: number, h: number) => void>;
}

/**
 * 表头绘制器（HeaderPainter）
 *
 * 负责将 Fragment[] 绘制到 Canvas 上下文。
 * 绘制顺序：背景 → 文本 → 边框 → 自定义渲染器。
 *
 * ## 绘制策略
 *
 * - **背景**：根据 isSource/isHighlighted/mergedStyle 决定填充色
 * - **文本**：支持截断（超出 maxTextWidth 时加省略号）
 * - **边框**：使用 BorderMask 位域掩码决定画哪些边框，自动抑制相邻片段的重叠边框
 * - **自定义渲染器**：允许外部注册额外的绘制逻辑（如排序指示器）
 *
 * ## 半像素偏移
 *
 * Canvas 绘制 1px 线条时使用 x - 0.5 / y - 0.5 偏移，
 * 确保 1px 线条精确落在像素边界上，避免模糊。
 *
 * @see Fragment 可视片段
 * @see BorderMask 边框掩码常量
 */
export class HeaderPainter {
    /**
     * 绘制所有片段到 Canvas
     *
     * 按顺序绘制每个 Fragment 的背景、文本、边框，
     * 最后调用自定义列头渲染器。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param fragments - 可视片段数组（可能包含 null，自动跳过）
     * @param extras - 附加参数
     * @param extras.isTopLayer - 是否为最上层（绘制顶部边框），默认 true
     * @param extras.columnHeaderRenderers - 列头自定义渲染器数组
     */
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

        // 调用自定义列头渲染器（如排序指示器）
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
     * @private 私有方法 - 判断是否应抑制当前片段的左边框
     *
     * 当相邻两个片段在同一行且水平紧邻，且前一个片段画了右边框时，
     * 抑制当前片段的左边框，避免重叠绘制导致边框过粗。
     *
     * @param fragments - 片段数组
     * @param currentIndex - 当前片段索引
     * @returns 是否抑制左边框
     */
    #shouldSuppressLeft(fragments: (Fragment | null)[], currentIndex: number): boolean {
        if (currentIndex <= 0) return false;

        const prev = fragments[currentIndex - 1];
        const curr = fragments[currentIndex];

        if (!prev || !curr) return false;

        // 前一个片段是否画了右边框
        const prevDrawsRight = !!(prev.borderMask & BorderMask.RIGHT);
        if (!prevDrawsRight) return false;

        // 同一行且水平紧邻
        const sameRow = Math.abs(prev.y - curr.y) < 1;
        const adjacentX = Math.abs(prev.x + prev.w - curr.x) < 1;

        return sameRow && adjacentX;
    }

    /**
     * @private 私有方法 - 绘制片段背景
     *
     * 根据片段状态决定背景和文字颜色：
     * 1. isSource（拖拽源列）：使用 MOVE_SOURCE_FILL 背景 + HEADER_HIGHLIGHT_COLOR 文字
     * 2. isHighlighted（高亮列）：使用 HEADER_HIGHLIGHT_BG 背景 + HEADER_HIGHLIGHT_COLOR 文字
     * 3. 默认：使用 mergedStyle.backgroundColor 背景 + mergedStyle.color/HEADER_TEXT_COLOR 文字
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param frag - 可视片段
     */
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

    /**
     * @private 私有方法 - 绘制片段文本
     *
     * 设置字体、对齐方式、颜色后绘制文本。
     * 当文本宽度超过 maxTextWidth 时，截断并添加省略号。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param frag - 可视片段
     */
    #paintText(ctx: CanvasRenderingContext2D, frag: Fragment): void {
        const { text, textX, textY, font, textAlign, mergedStyle, maxTextWidth } = frag;
        if (!text) return;

        ctx.font = font;
        ctx.textAlign = textAlign as CanvasTextAlign;
        if (mergedStyle?.color) ctx.fillStyle = mergedStyle.color;

        // 文本截断：超出最大宽度时逐字删除并添加省略号
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

    /**
     * @private 私有方法 - 绘制片段边框
     *
     * 根据 BorderMask 位域掩码决定画哪些边框：
     * - RIGHT：画右边框
     * - BOTTOM：画底边框
     * - LEFT：画左边框（可被 suppressLeft 抑制）
     * - 顶部边框：仅最上层（isTopLayer = true）时绘制
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param frag - 可视片段
     * @param suppressLeft - 是否抑制左边框
     * @param isTopLayer - 是否为最上层
     */
    #paintBorders(ctx: CanvasRenderingContext2D, frag: Fragment, suppressLeft: boolean, isTopLayer: boolean): void {
        const { x, y, w, h, borderMask } = frag;

        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;

        if (borderMask & BorderMask.RIGHT) this.#drawVLine(ctx, x + w, y, y + h);
        if (borderMask & BorderMask.BOTTOM) this.#drawHLine(ctx, x, y + h, x + w);
        if (!suppressLeft && borderMask & BorderMask.LEFT) this.#drawVLine(ctx, x, y, y + h);

        // 最上层绘制顶部边框
        if (isTopLayer) {
            this.#drawHLine(ctx, x, y, x + w);
        }
    }

    /**
     * @private 私有方法 - 绘制垂直线段
     *
     * 使用 x - 0.5 半像素偏移，确保 1px 线条精确落在像素边界上。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param x - 垂直线 x 坐标
     * @param y1 - 起始 y 坐标
     * @param y2 - 结束 y 坐标
     */
    #drawVLine(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number): void {
        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.beginPath();
        ctx.moveTo(x - 0.5, y1);
        ctx.lineTo(x - 0.5, y2);
        ctx.stroke();
    }

    /**
     * @private 私有方法 - 绘制水平线段
     *
     * 使用 y - 0.5 半像素偏移，确保 1px 线条精确落在像素边界上。
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param x1 - 起始 x 坐标
     * @param y - 水平线 y 坐标
     * @param x2 - 结束 x 坐标
     */
    #drawHLine(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number): void {
        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.beginPath();
        ctx.moveTo(x1, y - 0.5);
        ctx.lineTo(x2, y - 0.5);
        ctx.stroke();
    }
}
