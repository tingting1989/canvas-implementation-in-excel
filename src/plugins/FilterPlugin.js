import { BasePlugin } from "./BasePlugin.js";
import { FilterState } from "./filter/FilterState.js";
import { FilterUIManager } from "./filter/FilterUIManager.js";
import { FilterStrategy } from "./filter/FilterStrategy.js";
import { FilterIconRenderer } from "./filter/FilterIconRenderer.js";
import { errorHandler } from "@/core";

export class FilterPlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "filter";
    }

    static DEFAULT_OPTIONS = {
        enabled: true,
        dropdownWidth: 240,
        dropdownMaxHeight: 360,
        virtualScrollThreshold: 200,
        nullValueHandling: {
            displayAs: "(空白)",
            alwaysShowInList: true,
            sortToEnd: true,
            treatBlankAsNull: true,
            trimWhitespace: true,
        },
        conditionOperators: ["eq", "neq", "contains", "notContains"],
        iconRenderer: {
            iconSize: 12,
            iconPadding: 6,
        },
        /** 允许过滤的列索引数组，为空或 null 表示不允许任何列过滤 */
        filterableColumns: null,
    };

    #uiManager = null;
    #strategy = null;
    #iconRenderer = null;
    #headerRendererCallback = null;
    #headerRenderers = new Map();

    /**
     * 允许过滤的列索引集合（Set 用于 O(1) 查找）
     * @type {Set<number>|null}
     */
    #filterableColumns = null;

    constructor(workbook) {
        super(workbook);
    }

    init(options = {}) {
        const mergedOptions = { ...FilterPlugin.DEFAULT_OPTIONS, ...options };

        if (!mergedOptions.enabled) return;

        this.#parseFilterableColumns(mergedOptions.filterableColumns);

        this.#initFilterState();
        this.#initIconRenderer(mergedOptions.iconRenderer);
        this.#registerStrategies();
        this.#registerHeaderRenderer();
        this.#registerHooks();

        errorHandler.info(
            FilterPlugin.PLUGIN_NAME,
            `[Filter] 初始化完成，允许过滤的列: ${this.#filterableColumns?.size > 0 ? [...this.#filterableColumns].join(", ") : "无"}`,
        );
    }

    destroy() {
        this.clearOwnHooks();
        this.removeOwnStrategies();
        this.#unregisterHeaderRenderer();

        if (this.#uiManager) {
            this.#uiManager.destroy();
            this.#uiManager = null;
        }

        this.#iconRenderer = null;
        this.#headerRenderers.clear();
        super.destroy();
    }

    enable() {
        super.enable();
        this.#strategy?.enable();
        this.#registerHeaderRenderer();
    }

    disable() {
        this.closeDropdown();
        this.#unregisterHeaderRenderer();
        this.#strategy?.disable();
        super.disable();
    }

    getFilterUIManager() {
        return this.#uiManager;
    }

    getFilterEngine() {
        return this.#uiManager?.filterEngine || null;
    }

    getIconRenderer() {
        return this.#iconRenderer;
    }

    openDropdown(col, position) {
        if (!this.enabled) return;

        this.#uiManager.openDropdown(col, position);
    }

    closeDropdown() {
        this.#uiManager?.closeDropdown();
    }

    isDropdownOpen() {
        return this.#uiManager?.isDropdownOpen() || false;
    }

    clearAllFilters() {
        const filterState = this.sheet?.filterState;
        if (filterState) {
            filterState.clearAll();
            this.refreshAllHeaderIcons();
        }
    }

    renderFilterIcon(headerContainer, col, hasActiveFilter) {
        if (!this.#iconRenderer) return null;

        const existingWrapper = headerContainer.querySelector(`.filter-icon-wrapper[data-col="${col}"]`);

        if (existingWrapper) {
            this.#iconRenderer.updateIconState(existingWrapper, hasActiveFilter);
            return existingWrapper;
        }

        const wrapper = this.#iconRenderer.render(headerContainer, col, hasActiveFilter);

        wrapper.addEventListener("click", (e) => {
            e.stopPropagation();

            const rect = wrapper.getBoundingClientRect();
            const position = {
                x: rect.left + rect.width / 2,
                y: rect.bottom + 4,
            };

            this.openDropdown(col, position);
        });

        this.#headerRenderers.set(col, wrapper);
        return wrapper;
    }

    refreshHeaderIcon(col) {
        const filterState = this.sheet?.filterState;
        if (!filterState) return;

        const hasActiveFilter = filterState.getColumnFilter(col) !== null;
        const wrapper = this.#headerRenderers.get(col);

        if (wrapper && this.#iconRenderer) {
            this.#iconRenderer.updateIconState(wrapper, hasActiveFilter);
        }
    }

    refreshAllHeaderIcons() {
        for (const [col] of this.#headerRenderers) {
            this.refreshHeaderIcon(col);
        }

        // 强制重绘表头
        this.renderEngine?.invalidateAll();
        this.renderEngine?.render();
    }

    #initFilterState() {
        const sheet = this.sheet;
        if (!sheet) return;

        const filterState = new FilterState();
        this.#uiManager = new FilterUIManager(sheet, filterState, this);

        Object.defineProperty(sheet, "filterState", {
            value: filterState,
            writable: false,
            configurable: true,
        });
    }

    #initIconRenderer(options) {
        this.#iconRenderer = new FilterIconRenderer(options);
    }

    #registerStrategies() {
        this.#strategy = new FilterStrategy(this.#uiManager, this.eventHandler, this);

        // 使用 BasePlugin 的 addStrategy 方法（自动管理生命周期）
        this.addStrategy("filterClick", this.#strategy);
    }

    #registerHeaderRenderer() {
        if (!this.renderEngine?.headerRenderer || this.#headerRendererCallback) return;

        const self = this;

        this.#headerRendererCallback = function (ctx, colIndex, x, y, width, height) {
            self.#drawFilterIcon(ctx, colIndex, x, y, width, height);
        };

        this.renderEngine.headerRenderer.registerColumnHeaderRenderer(this.#headerRendererCallback);
    }

    #unregisterHeaderRenderer() {
        if (this.renderEngine?.headerRenderer && this.#headerRendererCallback) {
            this.renderEngine.headerRenderer.unregisterColumnHeaderRenderer(this.#headerRendererCallback);
            this.#headerRendererCallback = null;
        }
    }

    #drawFilterIcon(ctx, colIndex, x, y, width, height) {
        if (!this.#iconRenderer) return;

        // 检查列是否可过滤
        if (!this.isColumnFilterable(colIndex)) return;

        const filterState = this.sheet?.filterState;
        if (!filterState) return;

        const hasActiveFilter = filterState.getColumnFilter(colIndex) !== null;

        const iconSize = this.#iconRenderer.iconSize;
        const padding = this.#iconRenderer.iconPadding;

        // 检查该列是否同时配置了排序
        const sortPlugin = this.workbook?.getPlugin?.("sort");
        const hasSortableIndicator = sortPlugin?.isColumnSortable?.(colIndex);

        // 如果该列有排序指示器，过滤图标需要绘制在其左侧
        let iconX;
        if (hasSortableIndicator) {
            // 排序图标大小 + 间距 = 排序图标占用的空间
            // 排序图标: arrowSize(12) + padding(6) = 18px
            // 过滤图标绘制在排序图标左侧 8px 处
            iconX = x + width - iconSize - padding - 18 - 8;
        } else {
            iconX = x + width - iconSize - padding;
        }

        const iconY = y + (height - iconSize) / 2;

        // 保存图标信息供点击检测使用
        this._lastFilterIconRect = { x: iconX, y: iconY, size: iconSize, padding };
        this._lastFilterIconCol = colIndex;

        ctx.save();

        ctx.fillStyle = hasActiveFilter ? "#1890ff" : "#999";
        ctx.strokeStyle = hasActiveFilter ? "#1890ff" : "#999";
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        this.#drawFunnelShape(ctx, iconX, iconY, iconSize);

        ctx.stroke();

        ctx.restore();
    }

    #drawFunnelShape(ctx, x, y, size) {
        const midX = x + size / 2;

        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + size * 0.7, y + size * 0.6);
        ctx.lineTo(x + size * 0.5, y + size);
        ctx.lineTo(x + size * 0.3, y + size * 0.6);
        ctx.closePath();
    }

    /**
     * 解析可过滤列配置
     *
     * 配置规则：
     * - 如果未配置（undefined/null）或为空数组 → 所有列都不可过滤
     * - 如果配置了数组 → 只有数组中的列索引可以过滤
     *
     * @param {number[]|undefined} filterableColumns - 可过滤列索引数组
     * @private
     */
    #parseFilterableColumns(filterableColumns) {
        if (!filterableColumns || !Array.isArray(filterableColumns) || filterableColumns.length === 0) {
            this.#filterableColumns = null;
            return;
        }

        this.#filterableColumns = new Set(filterableColumns.map((col) => Number(col)));
    }

    /**
     * 检查指定列是否允许过滤
     *
     * @param {number} colIndex - 列索引
     * @returns {boolean} 是否可过滤
     */
    isColumnFilterable(colIndex) {
        if (this.#filterableColumns === null) {
            return false;
        }

        if (this.#filterableColumns.size === 0) {
            return false;
        }

        return this.#filterableColumns.has(colIndex);
    }

    /**
     * 获取可过滤列配置
     * @returns {number[]|null} 可过滤列索引数组，null 表示不允许任何列过滤
     */
    get filterableColumns() {
        if (this.#filterableColumns === null) {
            return null;
        }
        return [...this.#filterableColumns];
    }

    /**
     * 设置可过滤列配置
     *
     * @param {number[]|null} columns - 可过滤列索引数组，null 或空数组表示不允许任何列过滤
     */
    set filterableColumns(columns) {
        this.#parseFilterableColumns(columns);
        this.refreshAllHeaderIcons();
    }

    /**
     * 检测点击是否在过滤图标区域
     *
     * @param {number} colIndex - 列索引
     * @param {number} mouseX - 鼠标 X 坐标（画布坐标）
     * @param {number} mouseY - 鼠标 Y 坐标（画布坐标）
     * @param {object} headerRect - 列头区域矩形 { x, y, width, height }
     * @returns {boolean} 是否点击在过滤图标上
     */
    hitTestFilterIcon(colIndex, mouseX, mouseY, headerRect) {
        if (!this.isColumnFilterable(colIndex)) {
            return false;
        }

        const iconSize = this.#iconRenderer?.iconSize || 12;
        const padding = this.#iconRenderer?.iconPadding || 6;

        // 计算过滤图标位置（与 #drawFilterIcon 保持一致）
        const sortPlugin = this.workbook?.getPlugin?.("sort");
        const hasSortableIndicator = sortPlugin?.isColumnSortable?.(colIndex);

        let iconX;
        if (hasSortableIndicator) {
            iconX = headerRect.x + headerRect.width - iconSize - padding - 18 - 8;
        } else {
            iconX = headerRect.x + headerRect.width - iconSize - padding;
        }

        const iconY = headerRect.y + (headerRect.height - iconSize) / 2;

        // 检测点击是否在图标范围内
        const inX = mouseX >= iconX - padding && mouseX <= iconX + iconSize + padding;
        const inY = mouseY >= iconY - padding && mouseY <= iconY + iconSize + padding;

        return inX && inY;
    }

    #registerHooks() {}
}
