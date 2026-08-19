import { BasePlugin } from "../BasePlugin.js";
import { FilterState } from "./FilterState.js";
import { FilterUIManager } from "./FilterUIManager.js";
import { FilterStrategy } from "./FilterStrategy.js";
import { FilterIconRenderer } from "./FilterIconRenderer.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";

/** 空值处理配置 */
interface NullValueHandling {
    displayAs: string;
    alwaysShowInList: boolean;
    sortToEnd: boolean;
    treatBlankAsNull: boolean;
    trimWhitespace: boolean;
}

/** 图标渲染器配置 */
interface IconRendererConfig {
    iconSize: number;
    iconPadding: number;
}

/** 筛选插件配置选项 */
interface FilterPluginOptions {
    enabled: boolean;
    dropdownWidth: number;
    dropdownMaxHeight: number;
    virtualScrollThreshold: number;
    nullValueHandling: NullValueHandling;
    conditionOperators: string[];
    iconRenderer: IconRendererConfig;
    filterableColumns: number[] | null;
    columnTypes: Record<string, "text" | "numeric" | "date">;
}

/** 筛选图标矩形信息 */
interface FilterIconRect {
    x: number;
    y: number;
    size: number;
    padding: number;
}

/** 列头区域矩形 */
interface HeaderRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * 筛选插件 (Filter Plugin)
 *
 * 提供 Excel 风格的筛选功能，支持：
 * - 按值筛选（勾选要显示的值）
 * - 按条件筛选（等于、包含、大于等操作符）
 * - 日期筛选（今天、昨天、本周等）
 * - 数值范围筛选
 * - 正则表达式筛选
 * - 虚拟滚动（大数据量优化）
 *
 * @extends BasePlugin
 * @module plugins/filter/FilterPlugin
 */
export class FilterPlugin extends BasePlugin {
    /** @static 静态公共方法 - 获取插件唯一标识名称 */
    static get PLUGIN_NAME(): string {
        return "filter";
    }

    /** @static 静态公共字段 - 默认配置项 */
    static DEFAULT_OPTIONS: FilterPluginOptions = {
        enabled: true,
        dropdownWidth: 300,
        dropdownMaxHeight: 360,
        virtualScrollThreshold: 200,
        nullValueHandling: {
            displayAs: "(空白)",
            alwaysShowInList: true,
            sortToEnd: true,
            treatBlankAsNull: true,
            trimWhitespace: true,
        },
        conditionOperators: ["eq", "neq", "contains", "notContains", "startsWith", "endsWith", "gt", "gte", "lt", "lte"],
        iconRenderer: {
            iconSize: 10,
            iconPadding: 6,
        },
        filterableColumns: null,
        columnTypes: {},
    };

    /** @private 私有字段 - UI 管理器 */
    #uiManager: FilterUIManager | null = null;

    /** @private 私有字段 - 筛选策略实例 */
    #strategy: FilterStrategy | null = null;

    /** @private 私有字段 - 图标渲染器 */
    #iconRenderer: FilterIconRenderer | null = null;

    /** @private 私有字段 - 表头渲染器回调 */
    #headerRendererCallback: ((ctx: CanvasRenderingContext2D, colIndex: number, x: number, y: number, width: number, height: number) => void) | null =
        null;

    /** @private 私有字段 - 列索引 → 图标包装器 DOM 映射 */
    #headerRenderers: Map<number, HTMLElement> = new Map();

    /** @private 私有字段 - 允许过滤的列索引集合 */
    #filterableColumns: Set<number> | null = null;

    /** @private 私有字段 - 列类型配置 */
    #columnTypes: Record<string, "text" | "numeric" | "date"> = {};

    constructor(workbook: any) {
        super(workbook);
    }

    /**
     * 初始化筛选插件
     *
     * @param options - 筛选插件配置选项
     */
    init(options: Partial<FilterPluginOptions> = {}): void {
        const mergedOptions = { ...FilterPlugin.DEFAULT_OPTIONS, ...options };

        super.init(mergedOptions);

        if (!mergedOptions.enabled) return;

        this.#parseFilterableColumns(mergedOptions.filterableColumns);
        this.#columnTypes = mergedOptions.columnTypes || {};

        this.#initFilterState();
        this.#initIconRenderer(mergedOptions.iconRenderer);
        this.#registerStrategies();
        this.#registerHeaderRenderer();
        this.#registerInternalListeners();
    }

    /**
     * 销毁插件，释放资源
     *
     * 清理内容：
     * - 清除所有 hooks
     * - 移除所有策略
     * - 注销表头渲染器
     * - 销毁 UI 管理器
     * - 清空图标渲染器缓存
     */
    destroy(): void {
        (this as any).clearOwnHooks();
        (this as any).removeOwnStrategies();
        this.#unregisterHeaderRenderer();

        if (this.#uiManager) {
            this.#uiManager.destroy();
            this.#uiManager = null;
        }

        this.#iconRenderer = null;
        this.#headerRenderers.clear();
        super.destroy();
    }

    /**
     * 启用筛选功能
     *
     * 重新注册筛选策略和表头渲染器
     */
    enable(): void {
        super.enable();
        this.#strategy?.enable();
        this.#registerHeaderRenderer();
    }

    /**
     * 禁用筛选功能
     *
     * 关闭下拉面板、注销表头渲染器并禁用策略
     */
    disable(): void {
        this.closeDropdown();
        this.#unregisterHeaderRenderer();
        this.#strategy?.disable();
        super.disable();
    }

    /**
     * 获取筛选 UI 管理器
     *
     * @returns UI 管理器实例
     */
    getFilterUIManager(): FilterUIManager | null {
        return this.#uiManager;
    }

    /**
     * 获取筛选引擎
     *
     * @returns 筛选引擎实例
     */
    getFilterEngine(): any | null {
        return this.#uiManager?.filterEngine || null;
    }

    /**
     * 打开指定列的筛选下拉面板
     *
     * @param col - 列索引
     * @param position - 面板显示位置 { x, y }
     */
    openDropdown(col: number, position: { x: number; y: number }): void {
        if (!(this as any).enabled) return;

        this.#uiManager!.openDropdown(col, position);
    }

    /** 关闭当前打开的筛选下拉面板 */
    closeDropdown(): void {
        this.#uiManager?.closeDropdown();
    }

    /**
     * 检查筛选下拉面板是否处于打开状态
     *
     * @returns 是否打开
     */
    isDropdownOpen(): boolean {
        return this.#uiManager?.isDropdownOpen() || false;
    }

    /**
     * 清除所有列的筛选条件
     *
     * 移除所有已应用的筛选，恢复显示所有数据行
     */
    clearAllFilters(): void {
        const filterState = (this as any).sheet?.filterState;
        if (filterState) {
            filterState.clearAll();
            this.refreshAllHeaderIcons();
        }
    }

    /**
     * 刷新指定列的筛选图标状态
     *
     * @param col - 列索引
     */
    refreshHeaderIcon(col: number): void {
        const filterState = (this as any).sheet?.filterState;
        if (!filterState) return;

        const hasActiveFilter = filterState.getColumnFilter(col) !== null;
        const wrapper = this.#headerRenderers.get(col);

        if (wrapper && this.#iconRenderer) {
            this.#iconRenderer.updateIconState(wrapper, hasActiveFilter);
        }
    }

    /**
     * 刷新所有列的筛选图标状态
     *
     * 同时触发表头重绘
     */
    refreshAllHeaderIcons(): void {
        for (const [col] of this.#headerRenderers) {
            this.refreshHeaderIcon(col);
        }

        (this as any).renderEngine?.invalidateAll();
        (this as any).renderEngine?.render();
    }

    /**
     * @private 私有方法 - 初始化筛选状态管理器
     *
     * 创建 FilterState 实例并挂载到 sheet 对象上
     */
    #initFilterState(): void {
        const sheet = (this as any).sheet;
        if (!sheet) return;

        const filterState = new FilterState();
        this.#uiManager = new FilterUIManager(sheet, filterState, this as any);

        Object.defineProperty(sheet, "filterState", {
            value: filterState,
            writable: false,
            configurable: true,
        });
    }

    /**
     * @private 私有方法 - 初始化筛选图标渲染器
     *
     * @param options - 图标渲染配置
     */
    #initIconRenderer(options: IconRendererConfig): void {
        this.#iconRenderer = new FilterIconRenderer(options);
    }

    /**
     * @private 私有方法 - 注册筛选策略
     *
     * 创建 FilterStrategy 实例并添加到插件策略列表
     */
    #registerStrategies(): void {
        this.#strategy = new FilterStrategy(this.#uiManager!, (this as any).eventHandler, this as any);

        (this as any).addStrategy("filterClick", this.#strategy);
    }

    /**
     * @private 私有方法 - 注册表头筛选图标渲染器
     *
     * 将筛选图标绘制逻辑注册到渲染引擎的表头渲染器中
     */
    #registerHeaderRenderer(): void {
        if (!(this as any).renderEngine?.headerRenderer || this.#headerRendererCallback) return;

        const self = this;

        this.#headerRendererCallback = function (
            ctx: CanvasRenderingContext2D,
            colIndex: number,
            x: number,
            y: number,
            width: number,
            height: number,
        ) {
            self.#drawFilterIcon(ctx, colIndex, x, y, width, height);
        };

        (this as any).renderEngine.headerRenderer.registerColumnHeaderRenderer(this.#headerRendererCallback);
    }

    /**
     * @private 私有方法 - 注销表头筛选图标渲染器
     */
    #unregisterHeaderRenderer(): void {
        if ((this as any).renderEngine?.headerRenderer && this.#headerRendererCallback) {
            (this as any).renderEngine.headerRenderer.unregisterColumnHeaderRenderer(this.#headerRendererCallback);
            this.#headerRendererCallback = null;
        }
    }

    /**
     * @private 私有方法 - 在表头画布上绘制筛选图标
     *
     * @param ctx - 画布上下文
     * @param colIndex - 列索引
     * @param x - 图标 X 坐标
     * @param y - 图标 Y 坐标
     * @param width - 列头宽度
     * @param height - 列头高度
     */
    #drawFilterIcon(ctx: CanvasRenderingContext2D, colIndex: number, x: number, y: number, width: number, height: number): void {
        if (!this.#iconRenderer) return;

        if (!this.isColumnFilterable(colIndex)) return;

        const filterState = (this as any).sheet?.filterState;
        if (!filterState) return;

        const hasActiveFilter = filterState.getColumnFilter(colIndex) !== null;

        const iconSize = this.#iconRenderer.iconSize;
        const padding = this.#iconRenderer.iconPadding;

        const sortPlugin = (this as any).workbook?.getPlugin?.("sort");
        const hasSortableIndicator = sortPlugin?.isColumnSortable?.(colIndex);

        let iconX: number;
        if (hasSortableIndicator) {
            iconX = x + width - iconSize - padding - 18 - 8;
        } else {
            iconX = x + width - iconSize - padding;
        }

        const iconY = y + (height - iconSize) / 2;

        (this as any)._lastFilterIconRect = { x: iconX, y: iconY, size: iconSize, padding };
        (this as any)._lastFilterIconCol = colIndex;

        ctx.save();

        ctx.fillStyle = hasActiveFilter ? "#1890ff" : "#999";
        ctx.strokeStyle = hasActiveFilter ? "#1890ff" : "#999";
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        this.#drawFunnelShape(ctx, iconX, iconY, iconSize);

        ctx.stroke();

        ctx.restore();
    }

    /**
     * @private 私有方法 - 绘制漏斗形状（筛选图标的形状）
     *
     * @param ctx - 画布上下文
     * @param x - 左上角 X 坐标
     * @param y - 左上角 Y 坐标
     * @param size - 图标尺寸
     */
    #drawFunnelShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
        const midX = x + size / 2;

        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + size * 0.7, y + size * 0.6);
        ctx.lineTo(x + size * 0.5, y + size);
        ctx.lineTo(x + size * 0.3, y + size * 0.6);
        ctx.closePath();
    }

    /**
     * @private 私有方法 - 解析可过滤列配置
     *
     * 配置规则：
     * - 如果未配置（undefined/null）或为空数组 → 所有列都不可过滤
     * - 如果配置了数组 → 只有数组中的列索引可以过滤
     *
     * @param filterableColumns - 可过滤列索引数组
     */
    #parseFilterableColumns(filterableColumns: number[] | undefined | null): void {
        if (!filterableColumns || !Array.isArray(filterableColumns) || filterableColumns.length === 0) {
            this.#filterableColumns = null;
            return;
        }

        this.#filterableColumns = new Set(filterableColumns.map((col) => Number(col)));
    }

    /**
     * 检查指定列是否允许过滤
     *
     * @param colIndex - 列索引
     * @returns 是否可过滤
     */
    isColumnFilterable(colIndex: number): boolean {
        if (this.#filterableColumns === null) {
            return false;
        }

        if (this.#filterableColumns.size === 0) {
            return false;
        }

        return this.#filterableColumns.has(colIndex);
    }

    /**
     * 获取指定列的类型
     *
     * @param colIndex - 列索引
     * @returns 列类型，默认是 "text"
     */
    getColumnType(colIndex: number): "text" | "numeric" | "date" {
        return this.#columnTypes[colIndex] || "text";
    }

    /**
     * 获取可过滤列配置
     *
     * @returns 可过滤列索引数组，null 表示不允许任何列过滤
     */
    get filterableColumns(): number[] | null {
        if (this.#filterableColumns === null) {
            return null;
        }
        return [...this.#filterableColumns];
    }

    /**
     * 设置可过滤列配置
     *
     * @param columns - 可过滤列索引数组，null 或空数组表示不允许任何列过滤
     */
    set filterableColumns(columns: number[] | null) {
        this.#parseFilterableColumns(columns);
        this.refreshAllHeaderIcons();
    }

    /**
     * 检测点击是否在指定列的筛选图标区域
     *
     * @param colIndex - 列索引
     * @param mouseX - 鼠标 X 坐标（画布坐标）
     * @param mouseY - 鼠标 Y 坐标（画布坐标）
     * @param headerRect - 列头区域矩形 { x, y, width, height }
     * @returns 是否点击在筛选图标上
     */
    hitTestFilterIcon(colIndex: number, mouseX: number, mouseY: number, headerRect: HeaderRect): boolean {
        if (!this.isColumnFilterable(colIndex)) {
            return false;
        }

        const iconSize = this.#iconRenderer?.iconSize || 12;
        const padding = this.#iconRenderer?.iconPadding || 6;

        const sortPlugin = (this as any).workbook?.getPlugin?.("sort");
        const hasSortableIndicator = sortPlugin?.isColumnSortable?.(colIndex);

        let iconX: number;
        if (hasSortableIndicator) {
            iconX = headerRect.x + headerRect.width - iconSize - padding - 18 - 8;
        } else {
            iconX = headerRect.x + headerRect.width - iconSize - padding;
        }

        const iconY = headerRect.y + (headerRect.height - iconSize) / 2;

        const inX = mouseX >= iconX - padding && mouseX <= iconX + iconSize + padding;
        const inY = mouseY >= iconY - padding && mouseY <= iconY + iconSize + padding;

        return inX && inY;
    }

    /**
     * @private 私有方法 - 注册内部事件监听
     *
     * 通过 Sheet 的 bus 事件总线监听列移动事件，同步更新可过滤列配置和筛选状态。
     * 使用内部事件总线而非 hooks，因为 hooks 是给外部用户监听的 API。
     */
    #registerInternalListeners(): void {
        const sheet = (this as any).sheet;
        if (!sheet?.bus) return;

        const self = this;

        sheet.bus.on(SHEET_EVENTS.COLUMN_MOVED, (envelope: any) => {
            const { fromCol, toCol } = envelope.payload;
            self.#handleColumnMove(fromCol, toCol);
        });
    }

    /**
     * @private 处理列移动事件
     *
     * 同步更新：
     * 1. #filterableColumns - 可过滤列索引集合
     * 2. FilterState - 筛选配置和唯一值缓存
     * 3. 刷新表头图标 - 重新绘制筛选图标到正确的列位置
     */
    #handleColumnMove(fromCol: number, toCol: number): void {
        if (fromCol === toCol) return;

        this.#updateFilterableColumnsAfterMove(fromCol, toCol);
        this.#updateFilterStateAfterMove(fromCol, toCol);
        this.refreshAllHeaderIcons();
    }

    /**
     * @private 更新可过滤列集合
     *
     * 列移动后，将 #filterableColumns 中的索引按移动方向调整。
     * - fromCol → toCol：被移动的列直接映射
     * - 中间列：向移动反方向偏移 1
     */
    #updateFilterableColumnsAfterMove(fromCol: number, toCol: number): void {
        if (!this.#filterableColumns) return;

        const newSet = new Set<number>();

        for (const col of this.#filterableColumns) {
            let newCol: number;

            if (col === fromCol) {
                newCol = toCol;
            } else if (fromCol < toCol) {
                newCol = col > fromCol && col <= toCol ? col - 1 : col;
            } else {
                newCol = col >= toCol && col < fromCol ? col + 1 : col;
            }

            newSet.add(newCol);
        }

        this.#filterableColumns = newSet;
    }

    /**
     * @private 更新 FilterState 中的筛选配置和缓存
     *
     * 将所有列索引根据移动进行调整，并清除唯一值缓存。
     */
    #updateFilterStateAfterMove(fromCol: number, toCol: number): void {
        const filterState = (this as any).sheet?.filterState;
        if (!filterState) return;

        const allFilters = filterState.getAllFilters();
        const newFilters = new Map<number, any>();

        for (const [col, filterConfig] of allFilters) {
            let newCol: number;

            if (col === fromCol) {
                newCol = toCol;
            } else if (fromCol < toCol) {
                newCol = col > fromCol && col <= toCol ? col - 1 : col;
            } else {
                newCol = col >= toCol && col < fromCol ? col + 1 : col;
            }

            newFilters.set(newCol, filterConfig);
        }

        filterState.clearAll();

        for (const [newCol, config] of newFilters) {
            filterState.setColumnFilter(newCol, config);
        }

        if (typeof filterState.invalidateColumnCache === "function") {
            filterState.invalidateColumnCache();
        }
    }
}
