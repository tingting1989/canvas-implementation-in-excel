/**
 * 搜索结果高亮渲染器 (Search Result Highlighter)
 *
 * 负责 Canvas 层面的搜索结果可视化，在匹配单元格上绘制高亮背景。
 *
 * ## 为什么独立实现而不复用 ConditionalRule？
 *
 * | 特性 | ConditionalRule | SearchResultHighlighter |
 * |------|-----------------|------------------------|
 * **驱动方式** | 数据驱动（条件满足即显示） | 交互驱动（用户搜索时显示） |
 * **生命周期** | 持久化（保存在文件中） | 临时（关闭搜索即消失） |
 * **性能影响** | 每帧检查所有条件 | 仅激活时渲染 |
 * **存储位置** | Sheet 的 rules 数组 | 内存中的 Set（不序列化） |
 *
 * ## 渲染架构
 * ### 集成点
 * - 由 `RenderEngine` 在每帧的渲染循环中调用 `render()` 方法
 * - 作为后处理步骤（在单元格内容绘制完成后叠加高亮层）
 *
 * ### 视口优化
 * - 仅渲染可视区域内的匹配项（通过 `#getVisibleRange()` 过滤）
 * - 使用 Set 存储位置实现 O(1) 查找性能
 * - 支持合并单元格（自动获取合并区域的完整矩形）
 *
 * ## 高亮样式体系
 * - **普通匹配**: 黄色半透明背景（`rgba(255, 255, 0, 0.3)`）
 * - **当前选中**: 橙色半透明背景 + 边框（更醒目）
 * - 样式可通过构造参数自定义（支持主题适配）
 *
 * ## 使用示例
 * ```javascript
 * const highlighter = new SearchResultHighlighter(renderEngine, {
 *   backgroundColor: "rgba(0, 255, 0, 0.2)",      // 绿色背景
 *   currentBackgroundColor: "rgba(0, 200, 0, 0.5)", // 当前项深绿
 *   borderColor: "#00ff00",
 *   borderWidth: 2,
 * });
 *
 * // 更新高亮数据（搜索完成后调用）
 * highlighter.updateHighlights(searchResults);
 *
 * // 设置当前导航到的结果
 * highlighter.setCurrentHighlight(currentRow, currentCol);
 *
 * // 关闭搜索时清除所有高亮
 * highlighter.clearHighlights();
 * ```
 *
 * @class SearchResultHighlighter
 * @see {@link RenderEngine} - 调用方（渲染循环）
 * @see {@link SearchPlugin} - 管理此实例的生命周期
 */
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

export class SearchResultHighlighter {
    /**
     * 渲染引擎实例引用
     *
     * 用于：
     * - 调用 getCellRect() 获取单元格屏幕坐标
     * - 调用 scrollToCell() 自动滚动到当前选中项
     * - 调用 requestRender()/invalidateCell() 标记脏区域
     *
     * @type {Object|null}
     * @private
     */
    #renderEngine = null;

    /**
     * 高亮样式配置对象
     *
     * 包含两种状态的颜色定义：
     * - 普通匹配项的背景色
     * - 当前选中项的背景色和边框
     *
     * @type {Object}
     * @private
     */
    #styles = {};

    /**
     * 所有需要高亮的单元格位置集合
     *
     * 使用 `"row:col"` 格式的字符串作为键，
     * 利用 Set 数据结构实现 O(1) 的查找性能。
     *
     * @type {Set<string>}
     * @private
     */
    #highlights = new Set();

    /**
     * 当前导航选中的高亮位置
     *
     * 与其他高亮使用不同的视觉样式（边框 + 深色背景），
     * 帮助用户识别当前位置。
     *
     * @type {string|null} 格式同 #highlights: "row:col"
     * @private
     */
    #currentHighlight = null;

    /**
     * 创建高亮渲染器实例
     *
     * 初始化时仅保存引用，不执行任何渲染操作。
     * 实际渲染由 RenderEngine 在每帧主动调用 `render()` 方法。
     *
     * @constructor
     * @param {Object|null} renderEngine - 渲染引擎实例（必需，用于坐标计算和脏标记）
     * @param {Object} [styles] - 自定义高亮样式（可选，有默认值）
     * @param {string} [styles.backgroundColor="rgba(255, 255, 0, 0.3)"] - 普通匹配项背景色
     * @param {string} [styles.currentBackgroundColor="rgba(255, 165, 0, 0.5)"] - 当前选中项背景色
     * @param {string} [styles.borderColor="#ff9800"] - 当前选中项边框颜色
     * @param {number} [styles.borderWidth=2] - 边框宽度（像素）
     *
     * @example
     * const highlighter = new SearchResultHighlighter(
     *   workbook.renderEngine,
     *   { borderColor: '#1890ff' } // 使用蓝色边框（主题色）
     * );
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
     * 在每次搜索完成后调用，用新的结果集替换旧的高亮数据。
     *
     * 执行流程：
     * 1. 清空现有高亮集合
     * 2. 将新结果的 (row, col) 转换为 "row:col" 格式存入 Set
     * 3. 标记整个画布为脏（触发重新渲染）
     *
     * 性能说明：
     * - Set 的 clear + 批量 add 是 O(n) 操作
     * - 即使有 10,000 条结果也能快速完成
     *
     * @public
     * @param {Array<{row: number, col: number}>} results - 搜索结果数组（来自 SearchEngine）
     * @returns {void}
     *
     * @example
     * const results = await searchPlugin.query("hello");
     * highlighter.updateHighlights(results); // 立即在 Canvas 上显示黄色高亮
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
     * 设置当前导航选中的高亮项
     *
     * 当用户按 F3/Shift+F3 导航时调用，
     * 将指定单元格标记为"当前选中"并应用特殊样式。
     *
     * 副作用：
     * 1. 标记新旧两个位置的单元格为脏（局部重绘）
     * 2. 自动滚动确保目标单元格可见
     *
     * @public
     * @param {number} row - 目标行号
     * @param {number} col - 目标列号
     * @returns {void}
     *
     * @example
     * // 用户按 F3 后
     * const result = navigator.goToNext();
     * highlighter.setCurrentHighlight(result.row, result.col);
     * // 该单元格现在显示橙色边框 + 深黄背景
     */
    setCurrentHighlight(row, col) {
        const oldKey = this.#currentHighlight;
        this.#currentHighlight = `${row}:${col}`;

        if (oldKey) this.#markDirtySingle(oldKey);
        this.#markDirtySingle(this.#currentHighlight);

        this.#scrollToVisible(row, col);
    }

    /**
     * 清除所有高亮标记
     *
     * 在以下场景调用：
     * - 用户关闭搜索面板
     * - 用户清除搜索内容
     * - 插件被禁用或销毁
     *
     * 执行操作：
     * 1. 清空高亮集合
     * 2. 重置当前选中项
     * 3. 标记画布为脏（移除所有高亮绘制）
     *
     * @public
     * @returns {void}
     *
     * @example
     * plugin.hide(); // 内部会调用 highlighter.clearHighlights()
     */
    clearHighlights() {
        this.#highlights.clear();
        this.#currentHighlight = null;
        this.#markDirty();
    }

    /**
     * Canvas 渲染入口（由 RenderEngine 每帧调用）
     *
     * 这是 Highlighter 与渲染管线的主集成点。
     * RenderEngine 在每帧的绘制循环中，在单元格内容绘制完成后调用此方法。
     *
     * ### 执行流程
     * ```
     * 参数验证 → 空数据快速返回 → 计算可视范围 → 遍历高亮集合 → 过滤视口外项 → 绘制高亮矩形
     * ```
     *
     * ### 性能优化策略
     * 1. **提前退出**: 无高亮数据或参数缺失时立即返回
     * 2. **视口裁剪**: 仅处理可见区域内的单元格（减少 90%+ 绘制调用）
     * 3. **异常隔离**: 单个单元格绘制失败不影响其他高亮
     *
     * ### 调用约定
     * - 由 RenderEngine 在 `requestAnimationFrame` 回调中调用
     * - 必须在 `ctx.save()` / `ctx.restore()` 之间调用（由 RenderEngine 保证）
     *
     * @public
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文（已配置好变换矩阵）
     * @param {Object} viewport - 当前视口信息对象
     *   - {number} scrollX - 水平滚动偏移量
     *   - {number} scrollY - 垂直滚动偏移量
     *   - {number} width - 视口宽度（像素）
     *   - {number} height - 视口高度（像素）
     * @param {Object} sheet - 当前工作表实例（用于查询合并信息）
     * @returns {void}
     */
    render(ctx, viewport, sheet) {
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
            errorHandler.handle(ERROR_CODE.SEARCH_HIGHLIGHT_RENDER_ERROR, "渲染高亮时出错", { originalError: error });
        }
    }

    /**
     * 绘制单个高亮矩形到 Canvas
     *
     * 根据 isCurrent 参数选择不同的绘制样式：
     * - **普通匹配**: 仅填充半透明背景色
     * - **当前选中**: 填充深色背景 + 绘制边框（更醒目）
     *
     * ### 绘制细节
     * - 使用 `ctx.save()` / `ctx.restore()` 隔离状态（避免影响后续绘制）
     * - 边框向内收缩半个线宽（避免被 Canvas 边缘裁剪）
     * - 支持透明度叠加（不影响底层单元格内容显示）
     *
     * @private
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {{x: number, y: number, w: number, h: number}} rect - 单元格屏幕坐标矩形
     * @param {boolean} isCurrent - 是否为当前导航选中的结果
     * @returns {void}
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
     * 获取单元格的屏幕坐标矩形
     *
     * 复用 RenderEngine 的 `getCellRect()` 方法获取准确的位置信息，
     * 并支持合并单元格的特殊处理。
     *
     * ### 合并单元格处理
     * 如果目标单元格属于某个合并区域：
     * 1. 通过 `sheet.mergeManager.getMerge()` 查询合并信息
     * 2. 将 mergeInfo 传递给 RenderEngine.getCellRect()
     * 3. 返回整个合并区域的完整矩形（而非单个单元格）
     *
     * ### 返回值格式
     * 与 RenderEngine.getCellRect 保持一致：
     * ```javascript
     * { x: number, y: number, w: number, h: number }
     * // x, y: 左上角屏幕坐标
     * // w, h: 宽度和高度（像素）
     * ```
     *
     * @private
     * @param {number} row - 目标行索引（从 0 开始）
     * @param {number} col - 目标列索引（从 0 开始）
     * @param {Object} [sheet] - 工作表实例（用于查询合并信息）
     * @returns {{x: number, y: number, w: number, h: number}|null} 单元格矩形坐标，失败返回 null
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
     * 计算当前可视区域的行列范围
     *
     * 用于优化渲染性能：仅绘制可视区域内的匹配项，
     * 避免遍历和绘制不可见的高亮（减少 90%+ 的无用绘制调用）。
     *
     * ### 计算逻辑
     * 1. 从 RenderEngine 获取当前滚动位置 (scrollX/Y)
     * 2. 从 RenderEngine 获取视口尺寸 (viewW/viewH)
     * 3. 使用 RowColManager 的 `rowAt()/colAt()` 像素→索引转换
     * 4. 返回包含的行列范围（含边界扩展以避免闪烁）
     *
     * ### 容错机制
     * - 如果计算失败（如 RowColManager 不可用），返回全范围 (0~Infinity)
     * - 保证即使出错也能正常渲染（只是性能下降）
     *
     * @private
     * @param {Object} viewport - 视口信息对象（预留参数，当前未使用）
     * @param {Object} [sheet] - 工作表实例（用于访问 RowColManager）
     * @returns {{startRow: number, endRow: number, startCol: number, endCol: number}} 可见范围
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
     * 滚动到指定单元格使其可见
     *
     * 通常在 `setCurrentHighlight()` 中自动调用，
     * 确保用户导航到的目标单元格在视口内可见。
     *
     * ### 安全性保证
     * - 检查 scrollToCell 方法是否存在
     * - 失败时不抛出异常（仅记录日志）
     *
     * @private
     * @param {number} row - 目标行号
     * @param {number} col - 目标列号
     * @returns {void}
     */
    #scrollToVisible(row, col) {
        try {
            this.#renderEngine.scrollToCell(row, col);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.SEARCH_SCROLL_TO_CELL_ERROR, "滚动到单元格失败", { originalError: error });
        }
    }

    /**
     * 标记整个画布为脏区域（触发完全重绘）
     *
     * 在以下场景调用：
     * - `updateHighlights()`: 高亮列表整体更新后
     * - `clearHighlights()`: 清除所有高亮时
     *
     * 调用 RenderEngine 的 `requestRender()` 请求下一帧重绘。
     *
     * @private
     * @returns {void}
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
     * 标记单个单元格为脏区域（局部重绘优化）
     *
     * 在 `setCurrentHighlight()` 中调用，
     * 仅标记新旧两个位置的单元格为脏，
     * 实现**局部刷新**而非全屏重绘（性能更优）。
     *
     * ### 性能优势
     * - 全屏重绘: O(总单元格数) → 可能数千次绘制调用
     * - 局部重绘: O(2) → 仅重绘 2 个单元格
     *
     * @private
     * @param {string} key - 格式为 "row:col" 的位置标识符
     * @returns {void}
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