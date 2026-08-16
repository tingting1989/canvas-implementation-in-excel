import { EventStrategy } from "../../editor/strategies/EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import type { FilterUIManager } from "./FilterUIManager.js";
import type { FilterPlugin } from "./FilterPlugin.js";

/**
 * 筛选策略 (Filter Strategy)
 *
 * 负责处理与筛选相关的事件：
 * - 点击表头时打开筛选面板
 * - 数据变化时使缓存失效
 * - 排序后刷新图标状态
 *
 * @extends EventStrategy
 * @module plugins/filter/FilterStrategy
 */
export class FilterStrategy extends EventStrategy {
    /** 策略优先级 */
    priority: number = STRATEGY_PRIORITY.POPUP_UI;

    /** @private 私有字段 - UI 管理器 */
    #uiManager: FilterUIManager | null = null;

    /** @private 私有字段 - 筛选插件实例 */
    #plugin: FilterPlugin | null = null;

    /**
     * @param uiManager - UI 管理器
     * @param handler - 事件处理器
     * @param plugin - 筛选插件
     */
    constructor(uiManager: FilterUIManager, handler: any, plugin: FilterPlugin) {
        super(handler);
        this.#uiManager = uiManager;
        this.#plugin = plugin;
    }

    /**
     * 单元格数据设置后的处理
     *
     * 使该列的唯一值缓存失效，并刷新图标状态
     *
     * @param row - 行索引
     * @param col - 列索引
     * @param oldValue - 旧值
     * @param newValue - 新值
     */
    handleAfterSetCellData(row: number, col: number, oldValue: any, newValue: any): void {
        if (!this.enabled || !(this.#plugin as any)?.enabled) return;

        const filterState = (this.#plugin as any).sheet?.filterState;
        if (filterState) {
            filterState.invalidateColumnCache(col);
            (this.#plugin as any).refreshHeaderIcon(col);
        }
    }

    /**
     * 列排序后的处理
     *
     * 刷新该列的筛选图标状态
     *
     * @param col - 列索引
     */
    handleColumnSorted(col: number): void {
        if (!this.enabled || !(this.#plugin as any)?.enabled) return;

        (this.#plugin as any).refreshHeaderIcon(col);
    }

    /**
     * 筛选应用后的处理
     *
     * 刷新所有列的筛选图标状态
     */
    handleFilterApplied(): void {
        if (!this.enabled || !(this.#plugin as any)?.enabled) return;

        (this.#plugin as any).refreshAllHeaderIcons();
    }

    /**
     * 获取事件处理器映射
     *
     * @returns 事件名称到处理函数的映射
     */
    getEventHandlers(): Record<string, (e: Event) => boolean | void> {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e: Event) => this.#handleCanvasMouseDown(e as MouseEvent),
        };
    }

    /**
     * @private 私有方法 - 处理画布鼠标按下事件
     *
     * @param e - 鼠标事件
     * @returns 是否阻止默认行为
     */
    #handleCanvasMouseDown(e: MouseEvent): boolean {
        if (!this.enabled || !this.#uiManager || !this.handler?.viewport) return true;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit) return true;

        if (hit.type !== HIT_TYPE.COL_HEADER) return true;

        const col = hit.index;

        const filterPlugin = this.#plugin;
        if (!filterPlugin || !(filterPlugin as any).isColumnFilterable(col)) return true;

        const canvasRect = this.handler.canvasContext.canvas.getBoundingClientRect();
        const canvasX = e.clientX - canvasRect.left;
        const canvasY = e.clientY - canvasRect.top;

        const sheet = this.handler.sheet;
        if (!sheet) return true;

        const rc = sheet.rowColManager;
        const headerW = sheet.getHeaderWidth();
        const headerH = sheet.getHeaderHeight();
        const scrollX = this.handler.viewport.scrollX;
        const fixedCols = sheet.fixedColumnsStart || 0;

        const effectiveScrollX = col < fixedCols ? 0 : scrollX;
        const colX = rc.getColX(col);
        const colWidth = rc.getColWidth(col);

        const headerRect = {
            x: headerW + colX - effectiveScrollX,
            y: 0,
            width: colWidth,
            height: headerH,
        };

        const isFilterIconHit = (filterPlugin as any).hitTestFilterIcon(col, canvasX, canvasY, headerRect);

        if (!isFilterIconHit) return true;

        e.preventDefault();
        e.stopPropagation();

        const position = {
            x: e.clientX,
            y: e.clientY,
        };

        (this.#uiManager as any).openDropdown(col, position);

        return false;
    }

    destroy(): void {
        super.destroy();
        this.#uiManager = null;
        this.#plugin = null;
    }
}
