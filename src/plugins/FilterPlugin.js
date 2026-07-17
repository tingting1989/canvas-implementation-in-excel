import { BasePlugin } from "./BasePlugin.js";
import { FilterState } from "./filter/FilterState.js";
import { FilterUIManager } from "./filter/FilterUIManager.js";
import { FilterStrategy } from "./filter/FilterStrategy.js";
import { FilterIconRenderer } from "./filter/FilterIconRenderer.js";

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
    };

    #uiManager = null;
    #strategy = null;
    #iconRenderer = null;
    #headerRendererCallback = null;
    #headerRenderers = new Map();

    constructor(workbook) {
        super(workbook);
    }

    init(options = {}) {
        const mergedOptions = { ...FilterPlugin.DEFAULT_OPTIONS, ...options };

        if (!mergedOptions.enabled) return;

        this.#initFilterState();
        this.#initIconRenderer(mergedOptions.iconRenderer);
        this.#registerStrategies();
        this.#registerHeaderRenderer();
        this.#registerHooks();
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
            this.#refreshAllHeaderIcons();
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

    #refreshAllHeaderIcons() {
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
        this.#uiManager = new FilterUIManager(sheet, filterState);

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
        this.#strategy = new FilterStrategy(this.#uiManager, this.eventHandler);

        // 使用 BasePlugin 的 addStrategy 方法（自动管理生命周期）
        this.addStrategy("filterClick", this.#strategy);
    }

    #registerHeaderRenderer() {
        if (!this.renderEngine?.headerRenderer || this.#headerRendererCallback) return;

        const self = this;

        this.#headerRendererCallback = function(ctx, colIndex, x, y, width, height) {
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

        const filterState = this.sheet?.filterState;
        if (!filterState) return;

        const hasActiveFilter = filterState.getColumnFilter(colIndex) !== null;

        const iconSize = this.#iconRenderer.iconSize;
        const padding = this.#iconRenderer.iconPadding;

        const iconX = x + width - iconSize - padding;
        const iconY = y + (height - iconSize) / 2;

        ctx.save();

        ctx.fillStyle = hasActiveFilter ? "#1890ff" : "#999";
        ctx.beginPath();

        this.#drawFunnelShape(ctx, iconX, iconY, iconSize);

        ctx.fill();

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

    #registerHooks() {
        this.addHook("afterSetCellData", (row, col, oldValue, newValue) => {
            const filterState = this.sheet?.filterState;
            if (filterState) {
                filterState.invalidateColumnCache(col);
                this.refreshHeaderIcon(col);
            }
        });

        this.addHook("onColumnSorted", (col) => {
            this.refreshHeaderIcon(col);
        });

        this.addHook("onFilterApplied", () => {
            this.#refreshAllHeaderIcons();
        });
    }
}
