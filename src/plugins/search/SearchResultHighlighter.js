import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

/**
 * 搜索结果高亮渲染器
 *
 * 为什么独立实现而不复用 ConditionalRule？
 *
 * 1. 职责不同：
 *    - ConditionalRule: 数据驱动的持久格式（保存在文件中）
 *    - Highlighter: 交互驱动的临时反馈（关闭即消失）
 *
 * 2. 性能考虑：
 *    - ConditionalRule: 每次渲染都检查条件
 *    - Highlighter: 仅搜索激活时渲染，不影响正常流程
 *
 * 3. 生命周期：
 *    - ConditionalRule: destroy 时持久保存
 *    - Highlighter: 必须完全清除，不留残留
 */
export class SearchResultHighlighter {
    /** @type {Object|null} RenderEngine 实例 */
    #renderEngine = null;

    /** @type {Object} 高亮样式配置 */
    #styles = {};

    /** @type {Set<string>} 所有高亮位置 "row:col" */
    #highlights = new Set();

    /** @type {string|null} 当前选中位置 */
    #currentHighlight = null;

    /**
     * @param {Object|null} renderEngine - 渲染引擎实例
     * @param {Object} styles - 高亮样式配置
     */
    constructor(renderEngine, styles) {
        this.#renderEngine = renderEngine;
        this.#styles = styles || {
            backgroundColor: "rgba(255, 255, 0, 0.3)",
            currentBackgroundColor: "rgba(255, 165, 0, 0.5)",
            borderColor: "#ff9800",
            borderWidth: 2,
        };
    }

    /**
     * 更新高亮列表
     *
     * @param {Array<{row: number, col: number}>} results - 搜索结果数组
     */
    updateHighlights(results) {
        this.#highlights.clear();

        if (!results || results.length === 0) return;

        for (const r of results) {
            this.#highlights.add(`${r.row}:${r.col}`);
        }

        this.#markDirty();
    }

    /**
     * 设置当前高亮
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    setCurrentHighlight(row, col) {
        const oldKey = this.#currentHighlight;
        this.#currentHighlight = `${row}:${col}`;

        if (oldKey) this.#markDirtySingle(oldKey);
        this.#markDirtySingle(this.#currentHighlight);

        this.#scrollToVisible(row, col);
    }

    /**
     * 清除所有高亮
     */
    clearHighlights() {
        this.#highlights.clear();
        this.#currentHighlight = null;
        this.#markDirty();
    }

    /**
     * Canvas 渲染入口
     * 由 RenderEngine 在每帧调用
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {Object} viewport - 视口信息
     * @param {Object} sheet - 工作表实例
     */
    render(ctx, viewport, sheet) {
        // ✅ 防御性编程：检查必要参数
        if (!ctx || !viewport || !sheet) return;

        // ✅ 快速返回：无高亮数据
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

            // ✅ 捕获渲染异常，避免影响主渲染循环
        } catch (error) {
            errorHandler.handle(ERROR_CODE.SEARCH_HIGHLIGHT_RENDER_ERROR, "渲染高亮时出错", { originalError: error });
        }
    }

    /**
     * 绘制单个高亮矩形
     *
     * @private
     */
    #drawHighlight(ctx, rect, isCurrent) {
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
     * 获取单元格屏幕坐标
     * 复用 RenderEngine 的 getCellRect 方法，通过 ViewportTransform 获取准确的视口坐标。
     * 支持合并单元格：如果目标单元格属于某个合并区域，则返回整个合并区域的矩形。
     *
     * @private
     * @param {number} row - 行索引
     * @param {number} col - 列索引
     * @param {Object} [sheet] - 工作表实例（可选，用于查询合并信息）
     * @returns {{x: number, y: number, w: number, h: number}|null}
     *
     */
    #getCellRect(row, col, sheet) {
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
     * 获取可视范围
     *
     * 参考 RenderEngine 的实现，通过 RenderEngine 或 viewport 参数获取准确的视口信息，
     * 并利用 Sheet 的 RowColManager 计算真实可见的行列范围。
     *
     * @private
     * @param {Object} viewport - 视口信息对象（可选）
     * @param {Object} [sheet] - 工作表实例（可选，用于获取行列管理器）
     * @returns {{startRow: number, endRow: number, startCol: number, endCol: number}}
     */
    #getVisibleRange(viewport, sheet) {
        try {
            let scrollX, scrollY, viewW, viewH;
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
            errorHandler.handle(ERROR_CODE.SEARCH_VISIBLE_RANGE_ERROR, "获取可视范围失败", { originalError: error });
            return {
                startRow: 0,
                endRow: Infinity,
                startCol: 0,
                endCol: Infinity,
            };
        }
    }

    /**
     * 滚动到指定单元格可见
     *
     * @private
     */
    #scrollToVisible(row, col) {
        try {
            this.#renderEngine.scrollToCell(row, col);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.SEARCH_SCROLL_TO_CELL_ERROR, "滚动到单元格失败", { originalError: error });
        }
    }

    /**
     * 标记脏区域
     *
     * @private
     */
    #markDirty() {
        if (this.#renderEngine?.requestRender) {
            try {
                this.#renderEngine.requestRender();
            } catch (error) {
                // 静默处理
            }
        }
    }

    /**
     * 标记单个单元格为脏
     *
     * @private
     */
    #markDirtySingle(key) {
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
