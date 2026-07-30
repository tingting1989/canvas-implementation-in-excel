import { EventStrategy } from "../../editor/strategies/EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";

/**
 * 筛选策略
 *
 * 负责处理与筛选相关的事件：
 * - 点击表头时打开筛选面板
 * - 数据变化时使缓存失效
 * - 排序后刷新图标状态
 *
 * @extends EventStrategy
 */
export class FilterStrategy extends EventStrategy {
    priority = STRATEGY_PRIORITY.POPUP_UI;

    #uiManager = null;
    #plugin = null;

    /**
     * @param {FilterUIManager} uiManager - UI 管理器
     * @param {Object} handler - 事件处理器
     * @param {FilterPlugin} plugin - 筛选插件
     */
    constructor(uiManager, handler, plugin) {
        super(handler);
        this.#uiManager = uiManager;
        this.#plugin = plugin;
    }

    /**
     * 单元格数据设置后的处理
     *
     * 使该列的唯一值缓存失效，并刷新图标状态
     * @param {number} row - 行索引
     * @param {number} col - 列索引
     * @param {*} oldValue - 旧值
     * @param {*} newValue - 新值
     */
    handleAfterSetCellData(row, col, oldValue, newValue) {
        if (!this.enabled || !this.#plugin?.enabled) return;

        const filterState = this.#plugin.sheet?.filterState;
        if (filterState) {
            filterState.invalidateColumnCache(col);
            this.#plugin.refreshHeaderIcon(col);
        }
    }

    /**
     * 列排序后的处理
     *
     * 刷新该列的筛选图标状态
     * @param {number} col - 列索引
     */
    handleColumnSorted(col) {
        if (!this.enabled || !this.#plugin?.enabled) return;

        this.#plugin.refreshHeaderIcon(col);
    }

    /**
     * 筛选应用后的处理
     *
     * 刷新所有列的筛选图标状态
     */
    handleFilterApplied() {
        if (!this.enabled || !this.#plugin?.enabled) return;

        this.#plugin.refreshAllHeaderIcons();
    }

    /**
     * 获取事件处理器映射
     *
     * @returns {Object} 事件名称到处理函数的映射
     */
    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#handleCanvasMouseDown(e),
        };
    }

    /**
     * 处理画布鼠标按下事件
     *
     * @param {MouseEvent} e - 鼠标事件
     * @returns {boolean} 是否阻止默认行为
     * @private
     */
    #handleCanvasMouseDown(e) {
        if (!this.enabled || !this.#uiManager || !this.handler?.viewport) return true;

        // 使用 viewport.hitTest 获取点击信息
        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit) return true;

        // 只处理列头区域的点击
        if (hit.type !== HIT_TYPE.COL_HEADER) return true;

        const col = hit.index;

        // 检查该列是否可过滤
        const filterPlugin = this.#plugin;
        if (!filterPlugin || !filterPlugin.isColumnFilterable(col)) return true;

        // 获取 canvas 边界以计算画布坐标
        const canvasRect = this.handler.canvasContext.canvas.getBoundingClientRect();
        const canvasX = e.clientX - canvasRect.left;
        const canvasY = e.clientY - canvasRect.top;

        // 获取 sheet 和行列管理器
        const sheet = this.handler.sheet;
        if (!sheet) return true;

        const rc = sheet.rowColManager;
        const headerW = sheet.getHeaderWidth();
        const headerH = sheet.getHeaderHeight();
        const scrollX = this.handler.viewport.scrollX;
        const fixedCols = sheet.fixedColumnsStart || 0;

        // 计算列头矩形（视口坐标）
        const effectiveScrollX = col < fixedCols ? 0 : scrollX;
        const colX = rc.getColX(col);
        const colWidth = rc.getColWidth(col);

        const headerRect = {
            x: headerW + colX - effectiveScrollX,
            y: 0,
            width: colWidth,
            height: headerH,
        };

        // 使用 FilterPlugin 的 hitTestFilterIcon 方法检测是否点击在过滤图标上
        const isFilterIconHit = filterPlugin.hitTestFilterIcon(col, canvasX, canvasY, headerRect);

        if (!isFilterIconHit) return true;

        e.preventDefault();
        e.stopPropagation();

        const position = {
            x: e.clientX,
            y: e.clientY,
        };

        console.log("[Filter] 点击筛选图标 - 列:", col, "位置:", position);

        this.#uiManager.openDropdown(col, position);

        return false;
    }

    destroy() {
        super.destroy();
        this.#uiManager = null;
        this.#plugin = null;
    }
}