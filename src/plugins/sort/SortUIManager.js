import { SORT_ORDER } from "../../constants/enums/SortOrder.js";
import { SORT_ARROW_DIR } from "../../constants/enums/SortArrowDir.js";

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
import { CONFIG } from "../../constants/config.js";

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

        if (!isActive && !this.#showAllArrows) {
            return; // 未排序且不显示所有箭头
        }

        const arrowSize = CONFIG.SORT_ARROW_SIZE;
        const padding = CONFIG.SORT_ARROW_PADDING;
        const arrowX = x + w - arrowSize - padding;
        const arrowY = y + (h - arrowSize) / 2;

        ctx.save();

        if (isActive) {
            ctx.fillStyle = CONFIG.SORT_ACTIVE_COLOR;
            ctx.strokeStyle = CONFIG.SORT_ACTIVE_COLOR;
            ctx.lineWidth = CONFIG.SORT_ARROW_LINE_WIDTH;

            if (state.order === SORT_ORDER.ASC) {
                this.#drawUpArrow(ctx, arrowX, arrowY, arrowSize);
            } else if (state.order === SORT_ORDER.DESC) {
                this.#drawDownArrow(ctx, arrowX, arrowY, arrowSize);
            }
        } else {
            ctx.fillStyle = CONFIG.SORT_INACTIVE_COLOR;
            ctx.globalAlpha = CONFIG.SORT_INACTIVE_ALPHA;
            this.#drawUpDownArrow(ctx, arrowX, arrowY, arrowSize); // 双向箭头
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

    // ═══════════════════════════════════════════════════════════════
    // 私有方法 - 箭头绘制
    // ═══════════════════════════════════════════════════════════════

    /**
     * 绘制上升箭头（▲）
     * @private
     */
    #drawUpArrow(ctx, x, y, size) {
        const path = this.#getOrCreatePath("up", size);

        ctx.beginPath();
        ctx.moveTo(x + size / 2, y);
        ctx.lineTo(x + size, y + size);
        ctx.lineTo(x, y + size);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    /**
     * 绘制下降箭头（▼）
     * @private
     */
    #drawDownArrow(ctx, x, y, size) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + size / 2, y + size);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

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
