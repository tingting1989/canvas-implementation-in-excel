import { SORT_ORDER } from "../../constants/enums/SortOrder.js";
import { SORT_ARROW_DIR } from "../../constants/enums/SortArrowDir.js";
import { CONFIG } from "../../constants/config.js";
/**
 * 排序 UI 管理器（Sort UI Manager）
 *
 * ## 职责
 * - 渲染排序指示器（升序/降序箭头）
 * - 高亮当前排序列
 * - 管理箭头图标缓存
 *
 * ## 排序指示器设计
 * ```
 * 未排序状态:  [ Column A ]  [ Column B ]  [ Column C ]
 *                                    ↕ (灰色小箭头，可选显示)
 *
 * 升序排序:    [ Column A ]  [ Column B ▲ ]  [ Column C ]
 *                              ↑ (蓝色上箭头，加粗)
 *
 * 降序排序:    [ Column A ]  [ Column B ▼ ]  [ Column C ]
 *                              ↓ (蓝色下箭头，加粗)
 * ```
 *
 * ## Canvas 绘制优化
 * - 使用离屏 Canvas 缓存箭头路径（避免重复计算）
 * - 支持自定义颜色和尺寸配置
 * - 响应式布局（根据列宽自适应位置）
 */

export class SortUIManager {
    static ARROW_SIZE = 8;
    static ACTIVE_COLOR = "#1890ff";

    /**
     * 所属插件实例
     * @type {import("../SortPlugin.js").SortPlugin}
     * @private
     */
    #plugin;

    /**
     * 箭头路径缓存（避免重复创建）
     * @type {Map<string, Path2D>}
     * @private
     */
    #arrowCache = new Map();

    /**
     * 是否显示所有列的未排序箭头
     * @type {boolean}
     * @private
     */
    #showAllArrows = false;

    /**
     * 是否显示可排序列的指示器图标
     * @type {boolean}
     * @private
     */
    #showSortableIndicators = false;

    /**
     * 允许显示指示器的列索引集合
     * @type {Set<number>|null}
     * @private
     */
    #sortableColumns = null;

    constructor(plugin) {
        this.#plugin = plugin;
    }

    // ═══════════════════════════════════════════════════════════════
    // 生命周期
    // ═══════════════════════════════════════════════════════════════

    /**
     * 初始化 UI 管理器
     *
     * 可选：注册到 HeaderRenderer 的绘制钩子
     */
    init() {
        if (typeof Path2D !== "undefined") {
            this.#preCacheArrows();
        }
    }

    /**
     * 销毁 UI 管理器
     *
     * 清理缓存资源
     */
    destroy() {
        this.#arrowCache.clear();
    }

    // ═══════════════════════════════════════════════════════════════
    // 公共 API - 绘制方法
    // ═══════════════════════════════════════════════════════════════

    /**
     * 在指定列头绘制排序指示器
     *
     * 由 HeaderRenderer 在绘制每个列头时调用
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {number} col - 列索引
     * @param {number} x - 列头左上角 X 坐标
     * @param {number} y - 列头左上角 Y 坐标
     * @param {number} w - 列宽
     * @param {number} h - 列高
     */
    drawSortIndicator(ctx, col, x, y, w, h) {
        const state = this.#plugin.getSortState();

        const isActive = state.col === col && state.isSorted;

        // 检查是否是可排序列
        const isSortable = this.#isColumnSortable(col);

        // 未排序状态下，只有在 showSortableIndicators 且列可排时才显示灰色箭头
        if (!isActive && !this.#showAllArrows && !this.#showSortableIndicators) {
            return;
        }

        // 未排序状态且需要显示可排序指示器，但列不可排
        if (!isActive && this.#showSortableIndicators && !isSortable) {
            return;
        }

        const arrowSize = CONFIG.SORT_ARROW_SIZE;
        const padding = CONFIG.SORT_ARROW_PADDING;
        const arrowX = x + w - arrowSize - padding;
        const arrowY = y + (h - arrowSize) / 2;

        ctx.save();

        if (isActive) {
            // 升序/降序：先画双向箭头（深色），再高亮上半部分或下半部分
            ctx.fillStyle = CONFIG.SORT_INACTIVE_COLOR;
            ctx.globalAlpha = 1.0;
            this.#drawUpDownArrow(ctx, arrowX, arrowY, arrowSize);

            // 高亮上半部分（升序↑）或下半部分（降序↓）
            ctx.fillStyle = CONFIG.SORT_ACTIVE_COLOR;
            ctx.globalAlpha = 1.0;
            if (state.order === SORT_ORDER.ASC) {
                this.#fillUpArrow(ctx, arrowX, arrowY, arrowSize);
            } else if (state.order === SORT_ORDER.DESC) {
                this.#fillDownArrow(ctx, arrowX, arrowY, arrowSize);
            }
        } else {
            // 未排序状态：显示深色双向箭头
            ctx.fillStyle = CONFIG.SORT_INACTIVE_COLOR;
            ctx.globalAlpha = 1.0;
            this.#drawUpDownArrow(ctx, arrowX, arrowY, arrowSize);
        }

        ctx.restore();
    }

    /**
     * 高亮当前排序列的背景
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {number} col - 列索引
     * @param {number} x - 列头左上角 X 坐标
     * @param {number} y - 列头左上角 Y 坐标
     * @param {number} w - 列宽
     * @param {number} h - 列高
     */
    highlightSortedColumn(ctx, col, x, y, w, h) {
        const state = this.#plugin.getSortState();

        if (state.col !== col || !state.isSorted) {
            return;
        }

        ctx.save();
        ctx.fillStyle = CONFIG.SORT_COLUMN_HIGHLIGHT_FILL;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
    }

    /**
     * 更新所有列头的排序指示器
     *
     * 在排序状态变更后调用，触发重新渲染
     */
    updateIndicators() {
        this.#plugin.renderEngine?.invalidateAll();
        this.#plugin.render();
    }

    // ═══════════════════════════════════════════════════════════════
    // 配置方法
    // ═══════════════════════════════════════════════════════════════

    /**
     * 设置是否显示所有列的未排序箭头
     * @param {boolean} show
     */
    setShowAllArrows(show) {
        this.#showAllArrows = show;
    }

    /**
     * 设置是否显示可排序列的排序指示器图标
     *
     * @param {boolean} show - 是否显示
     * @param {Set<number>|null} sortableColumns - 可排序列索引集合
     */
    setShowSortableIndicators(show, sortableColumns) {
        this.#showSortableIndicators = show;
        this.#sortableColumns = sortableColumns;
    }

    /**
     * 检查指定列是否可排序
     *
     * @param {number} colIndex - 列索引
     * @returns {boolean} 是否可排序
     * @private
     */
    #isColumnSortable(colIndex) {
        if (this.#sortableColumns === null) {
            return false;
        }

        if (this.#sortableColumns.size === 0) {
            return false;
        }

        return this.#sortableColumns.has(colIndex);
    }

    // ═══════════════════════════════════════════════════════════════
    // 私有方法 - 箭头绘制
    // ═══════════════════════════════════════════════════════════════

    /**
     * 绘制双向箭头（↕）- 用于未排序状态
     * @private
     */
    #drawUpDownArrow(ctx, x, y, size) {
        const halfSize = size / 2;
        const centerY = y + halfSize;

        // 上半部分（小三角）
        ctx.beginPath();
        ctx.moveTo(x + halfSize, y + 1);
        ctx.lineTo(x + size - 1, centerY - 1);
        ctx.lineTo(x + 1, centerY - 1);
        ctx.closePath();
        ctx.fill();

        // 下半部分（小三角）
        ctx.beginPath();
        ctx.moveTo(x + 1, centerY + 1);
        ctx.lineTo(x + size - 1, centerY + 1);
        ctx.lineTo(x + halfSize, y + size - 1);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * 填充双向箭头的上半部分（升序高亮↑）
     * @private
     */
    #fillUpArrow(ctx, x, y, size) {
        const halfSize = size / 2;
        const centerY = y + halfSize;

        ctx.beginPath();
        ctx.moveTo(x + halfSize, y + 1);
        ctx.lineTo(x + size - 1, centerY - 1);
        ctx.lineTo(x + 1, centerY - 1);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * 填充双向箭头的下半部分（降序高亮↓）
     * @private
     */
    #fillDownArrow(ctx, x, y, size) {
        const halfSize = size / 2;
        const centerY = y + halfSize;

        ctx.beginPath();
        ctx.moveTo(x + 1, centerY + 1);
        ctx.lineTo(x + size - 1, centerY + 1);
        ctx.lineTo(x + halfSize, y + size - 1);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * 绘制上升空心三角形（▲）
     * @private
     */
    #drawUpTriangle(ctx, x, y, size) {
        ctx.beginPath();
        ctx.moveTo(x + size / 2, y);
        ctx.lineTo(x + size, y + size);
        ctx.lineTo(x, y + size);
        ctx.closePath();
        ctx.stroke();
    }

    /**
     * 绘制下降空心三角形（▼）
     * @private
     */
    #drawDownTriangle(ctx, x, y, size) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + size / 2, y + size);
        ctx.closePath();
        ctx.stroke();
    }

    // ═══════════════════════════════════════════════════════════════
    // 私有方法 - 缓存管理
    // ═══════════════════════════════════════════════════════════════

    /**
     * 获取或创建缓存的箭头路径
     *
     * @private
     * @param {'up'|'down'} type - 箭头类型
     * @param {number} size - 箭头大小
     * @returns {Path2D}
     */
    #getOrCreatePath(type, size) {
        const key = `${type}_${size}`;

        if (!this.#arrowCache.has(key)) {
            const path = new Path2D();

            if (type === SORT_ARROW_DIR.UP) {
                path.moveTo(size / 2, 0);
                path.lineTo(size, size);
                path.lineTo(0, size);
                path.closePath();
            } else if (type === SORT_ARROW_DIR.DOWN) {
                path.moveTo(0, 0);
                path.lineTo(size, 0);
                path.lineTo(size / 2, size);
                path.closePath();
            }

            this.#arrowCache.set(key, path);
        }

        return this.#arrowCache.get(key);
    }

    /**
     * 预缓存常用尺寸的箭头路径
     * @private
     */
    #preCacheArrows() {
        const sizes = [6, 8, 10, 12];
        for (const size of sizes) {
            this.#getOrCreatePath("up", size);
            this.#getOrCreatePath("down", size);
        }
    }
}
