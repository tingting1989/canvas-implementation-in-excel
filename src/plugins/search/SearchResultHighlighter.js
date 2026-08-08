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
            const visibleRange = this.#getVisibleRange(viewport);

        for (const key of this.#highlights) {
            const [row, col] = key.split(":").map(Number);

            if (
                row >= visibleRange.startRow &&
                row <= visibleRange.endRow &&
                col >= visibleRange.startCol &&
                col <= visibleRange.endCol
            ) {
                const rect = this.#getCellRect(sheet, row, col, viewport);
                if (rect) {
                    const isCurrent = key === this.#currentHighlight;
                    this.#drawHighlight(ctx, rect, isCurrent);
                }
            }
        }

        // ✅ 捕获渲染异常，避免影响主渲染循环
        } catch (error) {
            console.warn("[SearchHighlighter] 渲染高亮时出错:", error);
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

        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

        if (isCurrent && this.#styles.borderWidth > 0) {
            ctx.strokeRect(
                rect.x + this.#styles.borderWidth / 2,
                rect.y + this.#styles.borderWidth / 2,
                rect.width - this.#styles.borderWidth,
                rect.height - this.#styles.borderWidth
            );
        }

        ctx.restore();
    }

    /**
     * 获取单元格屏幕坐标
     *
     * @private
     */
    #getCellRect(sheet, row, col, viewport) {
        try {
            let x, y, width, height;

            if (sheet.getColumnLeft && sheet.getRowTop) {
                x = sheet.getColumnLeft(col) - (viewport?.scrollX || 0) + (viewport?.offsetX || 0);
                y = sheet.getRowTop(row) - (viewport?.scrollY || 0) + (viewport?.offsetY || 0);
                width = sheet.getColumnWidth(col);
                height = sheet.getRowHeight(row);
            } else {
                return null;
            }

            return { x, y, width, height };
        } catch (error) {
            return null;
        }
    }

    /**
     * 获取可视范围
     *
     * @private
     */
    #getVisibleRange(viewport) {
        const defaultRowHeight = 20;
        const defaultColWidth = 80;

        const scrollY = viewport?.scrollY || 0;
        const scrollX = viewport?.scrollX || 0;
        const viewHeight = viewport?.height || window.innerHeight;
        const viewWidth = viewport?.width || window.innerWidth;

        return {
            startRow: Math.floor(scrollY / defaultRowHeight),
            endRow: Math.ceil((scrollY + viewHeight) / defaultRowHeight),
            startCol: Math.floor(scrollX / defaultColWidth),
            endCol: Math.ceil((scrollX + viewWidth) / defaultColWidth),
        };
    }

    /**
     * 滚动到指定单元格可见
     *
     * @private
     */
    #scrollToVisible(row, col) {
        if (this.#renderEngine?.scrollToCell) {
            try {
                this.#renderEngine.scrollToCell(row, col);
            } catch (error) {
                console.warn("[Search] 滚动到单元格失败:", error);
            }
        }
    }

    /**
     * 标记脏区域
     *
     * @private
     */
    #markDirty() {
        if (this.#renderEngine?.markDirty) {
            try {
                this.#renderEngine.markDirty();
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
                this.#renderEngine.markDirtyCell(row, col);
            } catch (error) {
                // 静默处理
            }
        }
    }
}