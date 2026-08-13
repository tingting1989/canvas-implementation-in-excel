import { BasePlugin } from "../BasePlugin.js";
import { FilterState } from "./FilterState.js";
import { FilterUIManager } from "./FilterUIManager.js";
import { FilterStrategy } from "./FilterStrategy.js";
import { FilterIconRenderer } from "./FilterIconRenderer.js";
import { errorHandler } from "../../core/ErrorHandler.js";

/**
 * 筛选插件
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
 */
export class FilterPlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "filter";
    }

    static DEFAULT_OPTIONS = {
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

    /** @type {Object<string, "text"|"numeric"|"date">} 列类型配置 */
    #columnTypes = {};

    constructor(workbook) {
        super(workbook);
    }

    /**
     * 初始化筛选插件
     *
     * @param {Object} options - 筛选插件配置选项
     * @param {boolean} [options.enabled=true] - 是否启用筛选功能
     * @param {number} [options.dropdownWidth=300] - 筛选下拉面板宽度（像素）
     * @param {number} [options.dropdownMaxHeight=360] - 筛选下拉面板最大高度（像素），超出后可滚动
     * @param {number} [options.virtualScrollThreshold=200] - 虚拟滚动阈值，当唯一值数量超过此值时启用虚拟滚动
     * @param {Object} [options.nullValueHandling] - 空值处理配置
     * @param {string} [options.nullValueHandling.displayAs="(空白)"] - 空值在列表中的显示文本
     * @param {boolean} [options.nullValueHandling.alwaysShowInList=true] - 是否始终在列表中显示空值项
     * @param {boolean} [options.nullValueHandling.sortToEnd=true] - 是否将空值排序到列表末尾
     * @param {boolean} [options.nullValueHandling.treatBlankAsNull=true] - 是否将空白字符串视为空值
     * @param {boolean} [options.nullValueHandling.trimWhitespace=true] - 比较前是否去除空白字符
     * @param {string[]} [options.conditionOperators] - 条件模式下的操作符列表（默认全部操作符）
     * @param {Object} [options.iconRenderer] - 筛选图标渲染配置
     * @param {number} [options.iconRenderer.iconSize=12] - 筛选图标大小
     * @param {number} [options.iconRenderer.iconPadding=6] - 筛选图标内边距
     * @param {number[]|null} [options.filterableColumns=null] - 允许筛选的列索引数组，null表示允许所有列
     * @param {Object<string, "text"|"numeric"|"date">} [options.columnTypes={}] - 列类型配置，用于决定各列的筛选UI和操作符
     *
     * @example
     * // 基本用法：允许所有列筛选
     * filterPlugin.init();
     *
     * @example
     * // 指定允许筛选的列
     * filterPlugin.init({
     *     filterableColumns: [0, 2, 5],
     * });
     *
     * @example
     * // 配置列类型
     * filterPlugin.init({
     *     columnTypes: {
     *         0: "date",     // 第0列是日期
     *         1: "numeric",   // 第1列是数值
     *         // 其他列默认是 text
     *     }
     * });
     *
     * @example
     * // 完整配置示例
     * filterPlugin.init({
     *     enabled: true,
     *     dropdownWidth: 280,
     *     dropdownMaxHeight: 400,
     *     virtualScrollThreshold: 100,
     *     nullValueHandling: {
     *         displayAs: "(空)",
     *         alwaysShowInList: true,
     *         sortToEnd: true,
     *     },
     *     filterableColumns: [0, 1, 2],
     *     columnTypes: {
     *         0: "date",
     *         1: "numeric",
     *     },
     *     iconRenderer: {
     *         iconSize: 14,
     *         iconPadding: 8,
     *     },
     * });
     */
    init(options = {}) {
        const mergedOptions = { ...FilterPlugin.DEFAULT_OPTIONS, ...options };

        super.init(mergedOptions);

        if (!mergedOptions.enabled) return;

        this.#parseFilterableColumns(mergedOptions.filterableColumns);
        this.#columnTypes = mergedOptions.columnTypes || {};

        this.#initFilterState();
        this.#initIconRenderer(mergedOptions.iconRenderer);
        this.#registerStrategies();
        this.#registerHeaderRenderer();
        this.#registerHooks();
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

    /**
     * 启用筛选功能
     *
     * 重新注册筛选策略和表头渲染器
     */
    enable() {
        super.enable();
        this.#strategy?.enable();
        this.#registerHeaderRenderer();
    }

    /**
     * 禁用筛选功能
     *
     * 关闭下拉面板、注销表头渲染器并禁用策略
     */
    disable() {
        this.closeDropdown();
        this.#unregisterHeaderRenderer();
        this.#strategy?.disable();
        super.disable();
    }

    /**
     * 获取筛选 UI 管理器
     * @returns {FilterUIManager} UI 管理器实例
     */
    getFilterUIManager() {
        return this.#uiManager;
    }

    /**
     * 获取筛选引擎
     * @returns {FilterEngine|null} 筛选引擎实例
     */
    getFilterEngine() {
        return this.#uiManager?.filterEngine || null;
    }

    /**
     * 打开指定列的筛选下拉面板
     *
     * @param {number} col - 列索引
     * @param {Object} position - 面板显示位置 { x, y }
     */
    openDropdown(col, position) {
        if (!this.enabled) return;

        this.#uiManager.openDropdown(col, position);
    }

    /**
     * 关闭当前打开的筛选下拉面板
     */
    closeDropdown() {
        this.#uiManager?.closeDropdown();
    }

    /**
     * 检查筛选下拉面板是否处于打开状态
     *
     * @returns {boolean} 是否打开
     */
    isDropdownOpen() {
        return this.#uiManager?.isDropdownOpen() || false;
    }

    /**
     * 清除所有列的筛选条件
     *
     * 移除所有已应用的筛选，恢复显示所有数据行
     */
    clearAllFilters() {
        const filterState = this.sheet?.filterState;
        if (filterState) {
            filterState.clearAll();
            this.refreshAllHeaderIcons();
        }
    }

    /**
     * 刷新指定列的筛选图标状态
     *
     * @param {number} col - 列索引
     */
    refreshHeaderIcon(col) {
        const filterState = this.sheet?.filterState;
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
    refreshAllHeaderIcons() {
        for (const [col] of this.#headerRenderers) {
            this.refreshHeaderIcon(col);
        }

        // 强制重绘表头
        this.renderEngine?.invalidateAll();
        this.renderEngine?.render();
    }

    /**
     * 初始化筛选状态管理器
     *
     * 创建 FilterState 实例并挂载到 sheet 对象上
     * @private
     */
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

    /**
     * 初始化筛选图标渲染器
     *
     * @param {Object} options - 图标渲染配置
     * @private
     */
    #initIconRenderer(options) {
        this.#iconRenderer = new FilterIconRenderer(options);
    }

    /**
     * 注册筛选策略
     *
     * 创建 FilterStrategy 实例并添加到插件策略列表
     * @private
     */
    #registerStrategies() {
        this.#strategy = new FilterStrategy(this.#uiManager, this.eventHandler, this);

        // 使用 BasePlugin 的 addStrategy 方法（自动管理生命周期）
        this.addStrategy("filterClick", this.#strategy);
    }

    /**
     * 注册表头筛选图标渲染器
     *
     * 将筛选图标绘制逻辑注册到渲染引擎的表头渲染器中
     * @private
     */
    #registerHeaderRenderer() {
        if (!this.renderEngine?.headerRenderer || this.#headerRendererCallback) return;

        const self = this;

        this.#headerRendererCallback = function (ctx, colIndex, x, y, width, height) {
            self.#drawFilterIcon(ctx, colIndex, x, y, width, height);
        };

        this.renderEngine.headerRenderer.registerColumnHeaderRenderer(this.#headerRendererCallback);
    }

    /**
     * 注销表头筛选图标渲染器
     * @private
     */
    #unregisterHeaderRenderer() {
        if (this.renderEngine?.headerRenderer && this.#headerRendererCallback) {
            this.renderEngine.headerRenderer.unregisterColumnHeaderRenderer(this.#headerRendererCallback);
            this.#headerRendererCallback = null;
        }
    }

    /**
     * 在表头画布上绘制筛选图标
     *
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {number} colIndex - 列索引
     * @param {number} x - 图标 X 坐标
     * @param {number} y - 图标 Y 坐标
     * @param {number} width - 列头宽度
     * @param {number} height - 列头高度
     * @private
     */
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

    /**
     * 绘制漏斗形状（筛选图标的形状）
     *
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {number} x - 左上角 X 坐标
     * @param {number} y - 左上角 Y 坐标
     * @param {number} size - 图标尺寸
     * @private
     */
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
     * 获取指定列的类型
     *
     * @param {number} colIndex - 列索引
     * @returns {"text"|"numeric"|"date"} 列类型，默认是 "text"
     */
    getColumnType(colIndex) {
        return this.#columnTypes[colIndex] || "text";
    }

    /**
     * 获取可过滤列配置
     *
     * @returns {number[]|null} 可过滤列索引数组，null 表示允许所有列
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
     * 检测点击是否在指定列的筛选图标区域
     *
     * @param {number} colIndex - 列索引
     * @param {number} mouseX - 鼠标 X 坐标（画布坐标）
     * @param {number} mouseY - 鼠标 Y 坐标（画布坐标）
     * @param {Object} headerRect - 列头区域矩形 { x, y, width, height }
     * @returns {boolean} 是否点击在筛选图标上
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

    /**
     * 注册事件钩子（可被子类重写）
     * @protected
     */
    #registerHooks() {}
}
