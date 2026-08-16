import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

/** 高亮样式配置 */
interface HighlightStyles {
    backgroundColor: string;
    currentBackgroundColor: string;
    borderColor: string;
    borderWidth: number;
}

/** 单元格矩形坐标 */
interface CellRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** 可见范围 */
interface VisibleRange {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
}

/** 视口信息 */
interface ViewportInfo {
    scrollX: number;
    scrollY: number;
    width: number;
    height: number;
}

/**
 * 搜索结果高亮渲染器 (Search Result Highlighter)
 *
 * 负责 Canvas 层面的搜索结果可视化，在匹配单元格上绘制高亮背景。
 *
 * ## 高亮样式体系
 * - **普通匹配**: 黄色半透明背景（`rgba(255, 255, 0, 0.3)`）
 * - **当前选中**: 橙色半透明背景 + 边框（更醒目）
 * - 样式可通过构造参数自定义（支持主题适配）
 *
 * @module plugins/search/SearchResultHighlighter
 */
export class SearchResultHighlighter {
    /** @private 私有字段 - 渲染引擎实例引用 */
    #renderEngine: any = null;

    /** @private 私有字段 - 高亮样式配置对象 */
    #styles: HighlightStyles;

    /** @private 私有字段 - 所有需要高亮的单元格位置集合 */
    #highlights: Set<string> = new Set();

    /** @private 私有字段 - 当前导航选中的高亮位置 */
    #currentHighlight: string | null = null;

    /**
     * 创建高亮渲染器实例
     *
     * @param renderEngine - 渲染引擎实例
     * @param styles - 自定义高亮样式（可选，有默认值）
     */
    constructor(renderEngine: any, styles?: Partial<HighlightStyles>) {
        this.#renderEngine = renderEngine;
        this.#styles = {
            backgroundColor: styles?.backgroundColor ?? "rgba(255, 255, 0, 0.3)",
            currentBackgroundColor: styles?.currentBackgroundColor ?? "rgba(255, 165, 0, 0.5)",
            borderColor: styles?.borderColor ?? "#ff9800",
            borderWidth: styles?.borderWidth ?? 2,
        };
    }

    /**
     * 更新高亮列表
     *
     * @param results - 搜索结果数组
     */
    updateHighlights(results: { row: number; col: number }[]): void {
        this.#highlights.clear();

        if (!results || results.length === 0) return;

        for (const r of results) {
            this.#highlights.add(`${r.row}:${r.col}`);
        }

        this.#markDirty();
    }

    /**
     * 设置当前导航选中的高亮项
     *
     * @param row - 目标行号
     * @param col - 目标列号
     */
    setCurrentHighlight(row: number, col: number): void {
        const oldKey = this.#currentHighlight;
        this.#currentHighlight = `${row}:${col}`;

        if (oldKey) this.#markDirtySingle(oldKey);
        this.#markDirtySingle(this.#currentHighlight);

        this.#scrollToVisible(row, col);
    }

    /**
     * 清除所有高亮标记
     */
    clearHighlights(): void {
        this.#highlights.clear();
        this.#currentHighlight = null;
        this.#markDirty();
    }

    /**
     * Canvas 渲染入口（由 RenderEngine 每帧调用）
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param viewport - 当前视口信息对象
     * @param sheet - 当前工作表实例
     */
    render(ctx: CanvasRenderingContext2D, viewport: ViewportInfo, sheet: any): void {
        if (!ctx || !viewport || !sheet) return;

        if (this.#highlights.size === 0) return;

        try {
            const visibleRange = this.#getVisibleRange(viewport, sheet);

            for (const key of this.#highlights) {
                const [row, col] = key.split(":").map(Number);

                if (row >= visibleRange.startRow && row <= visibleRange.endRow && col >= visibleRange.startCol && col <= visibleRange.endCol) {
                    const rect = this.#getCellRect(row, col, sheet);
                    if (rect) {
                        const isCurrent = key === this.#currentHighlight;
                        this.#drawHighlight(ctx, rect, isCurrent);
                    }
                }
            }
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_HIGHLIGHT_RENDER_ERROR, "渲染高亮时出错", { originalError: error });
        }
    }

    /**
     * @private 私有方法 - 绘制单个高亮矩形到 Canvas
     *
     * @param ctx - Canvas 2D 渲染上下文
     * @param rect - 单元格屏幕坐标矩形
     * @param isCurrent - 是否为当前导航选中的结果
     */
    #drawHighlight(ctx: CanvasRenderingContext2D, rect: CellRect, isCurrent: boolean): void {
        ctx.save();

        if (isCurrent) {
            ctx.fillStyle = this.#styles.currentBackgroundColor;
            ctx.strokeStyle = this.#styles.borderColor;
            ctx.lineWidth = this.#styles.borderWidth;
        } else {
            ctx.fillStyle = this.#styles.backgroundColor;
        }

        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

        if (isCurrent && this.#styles.borderWidth > 0) {
            ctx.strokeRect(
                rect.x + this.#styles.borderWidth / 2,
                rect.y + this.#styles.borderWidth / 2,
                rect.w - this.#styles.borderWidth,
                rect.h - this.#styles.borderWidth,
            );
        }

        ctx.restore();
    }

    /**
     * @private 私有方法 - 获取单元格的屏幕坐标矩形
     *
     * @param row - 目标行索引
     * @param col - 目标列索引
     * @param sheet - 工作表实例
     * @returns 单元格矩形坐标，失败返回 null
     */
    #getCellRect(row: number, col: number, sheet: any): CellRect | null {
        try {
            if (!this.#renderEngine?.getCellRect) return null;

            let mergeInfo = null;
            if (sheet?.mergeManager?.getMerge) {
                mergeInfo = sheet.mergeManager.getMerge(row, col);
            }

            const rect = this.#renderEngine.getCellRect(row, col, mergeInfo);
            if (!rect || (rect.w === 0 && rect.h === 0)) return null;

            return rect;
        } catch (error) {
            return null;
        }
    }

    /**
     * @private 私有方法 - 计算当前可视区域的行列范围
     *
     * @param viewport - 视口信息对象
     * @param sheet - 工作表实例
     * @returns 可见范围
     */
    #getVisibleRange(viewport: ViewportInfo, sheet: any): VisibleRange {
        try {
            let scrollX: number, scrollY: number, viewW: number, viewH: number;
            scrollX = this.#renderEngine.scrollX || 0;
            scrollY = this.#renderEngine.scrollY || 0;
            viewW = this.#renderEngine.viewW || 0;
            viewH = this.#renderEngine.viewH || 0;

            const rc = sheet?.rowColManager;
            return {
                startRow: rc.rowAt(Math.max(0, scrollY)),
                endRow: rc.rowAt(scrollY + viewH) + 1,
                startCol: rc.colAt(Math.max(0, scrollX)),
                endCol: rc.colAt(scrollX + viewW) + 1,
            };
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_VISIBLE_RANGE_ERROR, "获取可视范围失败", { originalError: error });
            return {
                startRow: 0,
                endRow: Infinity,
                startCol: 0,
                endCol: Infinity,
            };
        }
    }

    /**
     * @private 私有方法 - 滚动到指定单元格使其可见
     */
    #scrollToVisible(row: number, col: number): void {
        try {
            this.#renderEngine.scrollToCell(row, col);
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_SCROLL_TO_CELL_ERROR, "滚动到单元格失败", { originalError: error });
        }
    }

    /**
     * @private 私有方法 - 标记整个画布为脏区域（触发完全重绘）
     */
    #markDirty(): void {
        if (this.#renderEngine?.requestRender) {
            try {
                this.#renderEngine.requestRender();
            } catch (error) {
                // 静默处理
            }
        }
    }

    /**
     * @private 私有方法 - 标记单个单元格为脏区域（局部重绘优化）
     *
     * @param key - 格式为 "row:col" 的位置标识符
     */
    #markDirtySingle(key: string): void {
        if (this.#renderEngine?.markDirtyCell) {
            try {
                const [row, col] = key.split(":").map(Number);
                this.#renderEngine.invalidateCell(row, col);
            } catch (error) {
                // 静默处理
            }
        }
    }
}
