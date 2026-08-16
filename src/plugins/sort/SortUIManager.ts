import { SORT_ORDER } from "../../constants/enums/SortOrder.js";
import { SORT_ARROW_DIR } from "../../constants/enums/SortArrowDir.js";
import { CONFIG } from "../../constants/config.js";
import type { SortPlugin } from "./SortPlugin.js";

/**
 * 排序 UI 管理器（SortUIManager）
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
 *
 * @module plugins/sort/SortUIManager
 */
export class SortUIManager {
    static ARROW_SIZE: number = 8;
    static ACTIVE_COLOR: string = "#1890ff";

    /** @private 私有字段 - 所属插件实例 */
    #plugin: SortPlugin;

    /** @private 私有字段 - 箭头路径缓存（避免重复创建） */
    #arrowCache: Map<string, Path2D> = new Map();

    /** @private 私有字段 - 是否显示所有列的未排序箭头 */
    #showAllArrows: boolean = false;

    /** @private 私有字段 - 是否显示可排序列的指示器图标 */
    #showSortableIndicators: boolean = false;

    /** @private 私有字段 - 允许显示指示器的列索引集合 */
    #sortableColumns: Set<number> | null = null;

    /**
     * @param plugin - 所属排序插件实例
     */
    constructor(plugin: SortPlugin) {
        this.#plugin = plugin;
    }

    /**
     * 初始化 UI 管理器
     *
     * 可选：注册到 HeaderRenderer 的绘制钩子
     */
    init(): void {
        if (typeof Path2D !== "undefined") {
            this.#preCacheArrows();
        }
    }

    /**
     * 销毁 UI 管理器，清理缓存资源
     */
    destroy(): void {
        this.#arrowCache.clear();
    }

    /**
     * 在指定列头绘制排序指示器
     *
     * 由 HeaderRenderer 在绘制每个列头时调用
     *
     * @param ctx - Canvas 2D 上下文
     * @param col - 列索引
     * @param x - 列头左上角 X 坐标
     * @param y - 列头左上角 Y 坐标
     * @param w - 列宽
     * @param h - 列高
     */
    drawSortIndicator(ctx: CanvasRenderingContext2D, col: number, x: number, y: number, w: number, h: number): void {
        const state = this.#plugin.getSortState();

        const isActive = state.col === col && state.isSorted;

        const isSortable = this.#isColumnSortable(col);

        if (!isActive && !this.#showAllArrows && !this.#showSortableIndicators) {
            return;
        }

        if (!isActive && this.#showSortableIndicators && !isSortable) {
            return;
        }

        const arrowSize = CONFIG.SORT_ARROW_SIZE;
        const padding = CONFIG.SORT_ARROW_PADDING;
        const arrowX = x + w - arrowSize - padding;
        const arrowY = y + (h - arrowSize) / 2;

        ctx.save();

        if (isActive) {
            ctx.fillStyle = CONFIG.SORT_INACTIVE_COLOR;
            ctx.globalAlpha = 1.0;
            this.#drawUpDownArrow(ctx, arrowX, arrowY, arrowSize);

            ctx.fillStyle = CONFIG.SORT_ACTIVE_COLOR;
            ctx.globalAlpha = 1.0;
            if (state.order === SORT_ORDER.ASC) {
                this.#fillUpArrow(ctx, arrowX, arrowY, arrowSize);
            } else if (state.order === SORT_ORDER.DESC) {
                this.#fillDownArrow(ctx, arrowX, arrowY, arrowSize);
            }
        } else {
            ctx.fillStyle = CONFIG.SORT_INACTIVE_COLOR;
            ctx.globalAlpha = 1.0;
            this.#drawUpDownArrow(ctx, arrowX, arrowY, arrowSize);
        }

        ctx.restore();
    }

    /**
     * 高亮当前排序列的背景
     *
     * @param ctx - Canvas 2D 上下文
     * @param col - 列索引
     * @param x - 列头左上角 X 坐标
     * @param y - 列头左上角 Y 坐标
     * @param w - 列宽
     * @param h - 列高
     */
    highlightSortedColumn(ctx: CanvasRenderingContext2D, col: number, x: number, y: number, w: number, h: number): void {
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
    updateIndicators(): void {
        this.#plugin.renderEngine?.invalidateAll();
        this.#plugin.render();
    }

    /**
     * 设置是否显示所有列的未排序箭头
     *
     * @param show - 是否显示
     */
    setShowAllArrows(show: boolean): void {
        this.#showAllArrows = show;
    }

    /**
     * 设置是否显示可排序列的排序指示器图标
     *
     * @param show - 是否显示
     * @param sortableColumns - 可排序列索引集合
     */
    setShowSortableIndicators(show: boolean, sortableColumns: Set<number> | null): void {
        this.#showSortableIndicators = show;
        this.#sortableColumns = sortableColumns;
    }

    /**
     * @private 私有方法 - 检查指定列是否可排序
     */
    #isColumnSortable(colIndex: number): boolean {
        if (this.#sortableColumns === null) {
            return false;
        }

        if (this.#sortableColumns.size === 0) {
            return false;
        }

        return this.#sortableColumns.has(colIndex);
    }

    /**
     * @private 私有方法 - 绘制双向箭头（↕）- 用于未排序状态
     */
    #drawUpDownArrow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
        const halfSize = size / 2;
        const centerY = y + halfSize;

        ctx.beginPath();
        ctx.moveTo(x + halfSize, y + 1);
        ctx.lineTo(x + size - 1, centerY - 1);
        ctx.lineTo(x + 1, centerY - 1);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x + 1, centerY + 1);
        ctx.lineTo(x + size - 1, centerY + 1);
        ctx.lineTo(x + halfSize, y + size - 1);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * @private 私有方法 - 填充双向箭头的上半部分（升序高亮↑）
     */
    #fillUpArrow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
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
     * @private 私有方法 - 填充双向箭头的下半部分（降序高亮↓）
     */
    #fillDownArrow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
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
     * @private 私有方法 - 绘制上升空心三角形（▲）
     */
    #drawUpTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
        ctx.beginPath();
        ctx.moveTo(x + size / 2, y);
        ctx.lineTo(x + size, y + size);
        ctx.lineTo(x, y + size);
        ctx.closePath();
        ctx.stroke();
    }

    /**
     * @private 私有方法 - 绘制下降空心三角形（▼）
     */
    #drawDownTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + size / 2, y + size);
        ctx.closePath();
        ctx.stroke();
    }

    /**
     * @private 私有方法 - 获取或创建缓存的箭头路径
     *
     * @param type - 箭头类型 ('up' | 'down')
     * @param size - 箭头大小
     * @returns Path2D 路径对象
     */
    #getOrCreatePath(type: string, size: number): Path2D {
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

        return this.#arrowCache.get(key)!;
    }

    /**
     * @private 私有方法 - 预缓存常用尺寸的箭头路径
     */
    #preCacheArrows(): void {
        const sizes = [6, 8, 10, 12];
        for (const size of sizes) {
            this.#getOrCreatePath("up", size);
            this.#getOrCreatePath("down", size);
        }
    }
}
