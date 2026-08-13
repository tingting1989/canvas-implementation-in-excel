import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { CONFIG } from "../../constants/config.js";
import { BorderMask } from "./models/BorderMask.js";

/**
 * 表头绘制器（HeaderPainter）
 *
 * 负责将 Fragment 列表绘制到 Canvas 上，是表头渲染管线的最终阶段。
 *
 * ## 渲染管线
 *
 * ```
 * HeaderLayoutBuilder → Fragment[] → HeaderPainter.paintAll()
 * ```
 *
 * ## 绘制顺序（每个 Fragment）
 *
 * 1. **背景**：根据 isSource / isHighlighted / mergedStyle 计算填充色
 * 2. **文本**：绘制文本（含截断处理）
 * 3. **边框**：根据 borderMask 绘制四边边框（含左侧抑制逻辑）
 * 4. **扩展渲染器**：调用插件注册的 columnHeaderRenderers
 *
 * ## 边框抑制
 *
 * 相邻 Fragment 共享的边框只画一次，避免重复绘制导致颜色加深：
 * - 如果前一个 Fragment 画了 RIGHT 边框，当前 Fragment 抑制 LEFT 边框
 * - 仅在同一行（y 相近）且水平相邻（x 衔接）时才抑制
 * - 跨冻结边界的 Fragment 不会互相干扰（y 不同）
 *
 * @see HeaderLayoutBuilder 表头布局构建器，产生 Fragment 列表
 * @see Fragment 可视片段，携带位置、样式、边框掩码等信息
 * @see BorderMask 边框掩码，控制四边边框的可见性
 */
export class HeaderPainter {
    /**
     * 绘制所有片段
     *
     * 按顺序遍历 Fragment 列表，依次绘制背景、文本、边框，
     * 最后调用扩展渲染器（columnHeaderRenderers）。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("./models/Fragment.js").Fragment[]} fragments - 片段列表
     * @param {Object} [extras={}] - 附加参数
     * @param {boolean} [extras.isTopLayer=true] - 是否为最顶层（顶层画顶边框作为表头上边界）
     * @param {Array<Function>} [extras.columnHeaderRenderers] - 列头扩展渲染器列表
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

        // 扩展渲染器：在所有片段绘制完成后调用，允许插件自定义绘制
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
     * 这样可以避免相邻共享边被画两次导致颜色加深。
     *
     * 判断条件（全部满足才抑制）：
     * 1. 前一个 Fragment 的 borderMask 包含 RIGHT
     * 2. 两个 Fragment 在同一行（y 坐标差 < 1px）
     * 3. 两个 Fragment 水平相邻（前一个的右边缘 = 当前的左边缘，差 < 1px）
     *
     * 安全保护：
     * - MERGED_DEFAULT 不画 RIGHT，所以下一个 Fragment 的 LEFT 不会被错误抑制
     * - 跨冻结边界的 FROZEN_SIDE/SCROLL_SIDE 不会互相干扰（y 不同）
     *
     * @param {import("./models/Fragment.js").Fragment[]} fragments - 片段列表
     * @param {number} currentIndex - 当前片段索引
     * @returns {boolean} 是否抑制 LEFT 边框
     */
    #shouldSuppressLeft(fragments, currentIndex) {
        if (currentIndex <= 0) return false;

        const prev = fragments[currentIndex - 1];
        const curr = fragments[currentIndex];

        if (!prev || !curr) return false;

        // 前一个片段是否画了右边框
        const prevDrawsRight = !!(prev.borderMask & BorderMask.RIGHT);
        if (!prevDrawsRight) return false;

        // 同一行且水平相邻
        const sameRow = Math.abs(prev.y - curr.y) < 1;
        const adjacentX = Math.abs(prev.x + prev.w - curr.x) < 1;

        return sameRow && adjacentX;
    }

    /**
     * 绘制片段背景
     *
     * 按优先级从高到低计算填充色：
     * 1. isSource（拖拽源标记）：MOVE_SOURCE_FILL 背景 + HEADER_HIGHLIGHT_COLOR 文字
     * 2. isHighlighted（选区高亮）：HEADER_HIGHLIGHT_BG 背景 + HEADER_HIGHLIGHT_COLOR 文字
     * 3. mergedStyle.backgroundColor（自定义背景色）：填充后使用 mergedStyle.color 或默认文字色
     * 4. 默认：使用 mergedStyle.color 或 HEADER_TEXT_COLOR
     *
     * 注意：fillStyle 在 paintBackground 中设置后，paintText 会使用该值绘制文字。
     * 因此 isSource 和 isHighlighted 分支将 fillStyle 设为文字颜色，
     * 而非高亮分支将 fillStyle 设为 mergedStyle.color 或默认文字色。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("./models/Fragment.js").Fragment} frag - 片段
     */
    #paintBackground(ctx, frag) {
        const { x, y, w, h, isSource, isHighlighted, mergedStyle } = frag;

        ctx.save();

        if (isSource) {
            // 拖拽源标记：特殊背景色 + 高亮文字色
            ctx.fillStyle = CONFIG.MOVE_SOURCE_FILL;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else if (isHighlighted) {
            // 选区高亮：高亮背景色 + 高亮文字色
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_BG;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else {
            // 普通状态：自定义背景色（如有）+ 自定义/默认文字色
            if (mergedStyle?.backgroundColor) {
                ctx.fillStyle = mergedStyle.backgroundColor;
                ctx.fillRect(x, y, w, h);
            }
            ctx.fillStyle = mergedStyle?.color || CONFIG.HEADER_TEXT_COLOR;
        }

        ctx.restore();
    }

    /**
     * 绘制片段文本
     *
     * 设置字体和对齐方式后绘制文本。如果文本宽度超过 maxTextWidth，
     * 则逐字符截断并追加省略号 "..."。
     *
     * 注意：fillStyle 由 #paintBackground 设置，此处不再重复设置
     * （除非 mergedStyle.color 存在时覆盖）。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("./models/Fragment.js").Fragment} frag - 片段
     */
    #paintText(ctx, frag) {
        const { text, textX, textY, font, textAlign, mergedStyle, maxTextWidth } = frag;
        if (!text) return;

        ctx.font = font;
        ctx.textAlign = textAlign;
        if (mergedStyle?.color) ctx.fillStyle = mergedStyle.color;

        // 文本截断：超出最大宽度时逐字符截断并追加省略号
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
     * 绘制片段边框
     *
     * 根据 borderMask 位域绘制可见的边框线，使用 0.5 像素偏移确保 1px 线条清晰。
     * 绘制顺序：RIGHT → BOTTOM → LEFT（LEFT 受 suppressLeft 控制）。
     *
     * 顶层片段额外绘制 TOP 边框，作为整个表头区域的上边界。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("./models/Fragment.js").Fragment} frag - 片段
     * @param {boolean} suppressLeft - 是否抑制左边框（避免与前一片段的右边框重复）
     * @param {boolean} isTopLayer - 是否为最顶层（顶层画顶边框）
     */
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

    /**
     * 绘制垂直线段
     *
     * 使用 0.5 像素 X 偏移确保 1px 线条在 Canvas 上清晰显示
     *（Canvas 像素对齐技巧：整数坐标画 1px 线会模糊，偏移 0.5 才清晰）。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {number} x - 线条 X 坐标
     * @param {number} y1 - 起点 Y 坐标
     * @param {number} y2 - 终点 Y 坐标
     */
    #drawVLine(ctx, x, y1, y2) {
        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.beginPath();
        ctx.moveTo(x - 0.5, y1);
        ctx.lineTo(x - 0.5, y2);
        ctx.stroke();
    }

    /**
     * 绘制水平线段
     *
     * 使用 0.5 像素 Y 偏移确保 1px 线条在 Canvas 上清晰显示。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {number} x1 - 起点 X 坐标
     * @param {number} y - 线条 Y 坐标
     * @param {number} x2 - 终点 X 坐标
     */
    #drawHLine(ctx, x1, y, x2) {
        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.beginPath();
        ctx.moveTo(x1, y - 0.5);
        ctx.lineTo(x2, y - 0.5);
        ctx.stroke();
    }
}
