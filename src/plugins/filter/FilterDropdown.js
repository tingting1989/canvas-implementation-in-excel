/**
 * 筛选下拉面板组件 (Filter Dropdown)
 *
 * 职责：渲染和管理筛选弹出面板的 UI 内容，包括：
 * - 值筛选模式（勾选列表）
 * - 条件筛选模式（操作符 + 值输入）
 * - 搜索过滤功能
 * - 虚拟滚动（大数据量优化）
 * - 全选/取消全选
 *
 * 设计原则：
 * 1. **纯内容组件**:
 *    - 继承 HTMLElement，不负责弹窗定位/遮罩/关闭逻辑
 *    - 由 FilterUIManager 创建 PopupPanelNew 容器并注入此组件
 *    - 通过 initCallbacks() 接收业务回调
 *
 * 2. **防御性编程**:
 *    - 所有可能失败的操作都包裹在 try-catch 中
 *    - 通过 errorHandler 统一记录错误日志
 *
 * 3. **事件委托**:
 *    - 在 shadowRoot 上统一监听 click/input 事件
 *    - 通过 classList 判断目标元素类型
 *
 * 使用示例：
 * ```javascript
 * const dropdown = new FilterDropdown();
 * dropdown.initCallbacks({ onApply, onClear });
 * dropdown.setData(col, allValues, currentFilter, options);
 * popupPanel.show({ content: dropdown, ... });
 * ```
 *
 * @class FilterDropdown
 * @extends HTMLElement
 * @see {@link FilterUIManager} - UI 控制器
 * @see {@link PopupPanelNew} - 弹窗容器
 * @see {@link VirtualValueList} - 虚拟滚动子组件
 */
import "./VirtualValueList.js";
import { NullValueHandler } from "./NullValueTypes.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

const template = document.createElement("template");
template.innerHTML = `
    <style>
        :host {
            display: block;
            --dropdown-width: 300px;
            --dropdown-max-height: 360px;
            --dropdown-content-min-height: 100px;
        }
        .filter-dropdown-panel {
            width: var(--dropdown-width);
            height: var(--dropdown-max-height);
            max-height: var(--dropdown-max-height);
            background: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .filter-dropdown-panel .filter-header {
            padding: 8px 12px;
            border-bottom: 1px solid #f0f0f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }
        .filter-dropdown-panel .filter-tab {
            flex: 1;
            padding: 8px;
            text-align: center;
            cursor: pointer;
            color: #666;
        }
        .filter-dropdown-panel .filter-tab.active {
            color: #1890ff;
            border-bottom: 2px solid #1890ff;
        }
        .filter-dropdown-panel .filter-tab:hover {
            background: #f5f5f5;
        }
        .filter-dropdown-panel .filter-body {
            position: relative;
            overflow: hidden;
            flex: 1;
            min-height: 0;
        }
        .filter-dropdown-panel .filter-panel {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            transition: transform 0.2s ease;
            display: flex;
            flex-direction: column;
        }
        .filter-dropdown-panel .filter-panel.values {
            transform: translateX(0);
        }
        .filter-dropdown-panel .filter-panel.condition {
            transform: translateX(-100%);
        }
        .filter-dropdown-panel .filter-panel.hidden {
            transform: translateX(-100%);
            pointer-events: none;
        }
        .filter-dropdown-panel .filter-search-box {
            padding: 8px 12px;
            border-bottom: 1px solid #f0f0f0;
            flex-shrink: 0;
        }
        .filter-dropdown-panel .filter-search-input {
            width: 100%;
            padding: 4px 8px;
            border: 1px solid #d9d9d9;
            border-radius: 4px;
            box-sizing: border-box;
            outline: none;
        }
        .filter-dropdown-panel .filter-search-input:focus {
            border-color: #1890ff;
            box-shadow: 0 0 0 2px rgba(24,144,255,0.2);
        }
        .filter-dropdown-panel .filter-content {
            flex: 1;
            overflow-y: auto;
            min-height: var(--dropdown-content-min-height);
            display: flex;
            flex-direction: column;
        }
        .filter-dropdown-panel .filter-content.virtual {
            overflow: hidden;
            min-height: 0;
        }
        .filter-dropdown-panel .filter-value-item {
            padding: 4px 12px;
            display: flex;
            align-items: center;
            cursor: pointer;
        }
        .filter-dropdown-panel .filter-value-item:hover {
            background: #f5f5f5;
        }
        .filter-dropdown-panel .filter-value-item input[type="checkbox"] {
            margin-right: 8px;
        }
        .filter-dropdown-panel .filter-condition-area {
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .filter-dropdown-panel .filter-condition-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .filter-dropdown-panel .filter-condition-operator {
            width: 100%;
            padding: 4px 8px;
            border: 1px solid #d9d9d9;
            border-radius: 4px;
            outline: none;
        }
        .filter-dropdown-panel .filter-condition-value {
            flex: 1;
            padding: 4px 8px;
            border: 1px solid #d9d9d9;
            border-radius: 4px;
            outline: none;
        }
        .filter-dropdown-panel .filter-condition-value:focus {
            border-color: #1890ff;
            box-shadow: 0 0 0 2px rgba(24,144,255,0.2);
        }
        .filter-dropdown-panel .filter-condition-separator {
            color: #999;
            flex-shrink: 0;
            display: none;
        }
        .filter-dropdown-panel .filter-condition-value-end {
            display: none;
        }
        .filter-dropdown-panel input[type="date"].filter-condition-value {
            width: 100%;
        }
        .filter-dropdown-panel .filter-footer {
            padding: 8px 12px;
            border-top: 1px solid #f0f0f0;
            display: flex;
            justify-content: space-between;
            flex-shrink: 0;
        }
        .filter-dropdown-panel .filter-clear-btn {
            padding: 4px 12px;
            border: 1px solid #d9d9d9;
            border-radius: 4px;
            background: #fff;
            cursor: pointer;
        }
        .filter-dropdown-panel .filter-clear-btn:hover {
            border-color: #1890ff;
            color: #1890ff;
        }
        .filter-dropdown-panel .filter-apply-btn {
            padding: 4px 12px;
            border: 1px solid #1890ff;
            border-radius: 4px;
            background: #1890ff;
            color: #fff;
            cursor: pointer;
        }
        .filter-dropdown-panel .filter-apply-btn:hover {
            background: #40a9ff;
        }
    </style>
    <div class="filter-dropdown-panel">
        <div class="filter-header">
            <span class="filter-tab active" data-mode="values">值</span>
            <span class="filter-tab" data-mode="condition">条件</span>
        </div>
        <div class="filter-search-box">
            <input type="text" class="filter-search-input" placeholder="搜索...">
        </div>
        <div class="filter-body">
            <div class="filter-panel values">
                <div class="filter-content"></div>
            </div>
            <div class="filter-panel condition">
                <div class="filter-condition-area">
                    <div class="filter-condition-row">
                        <select class="filter-condition-operator"></select>
                    </div>
                    <div class="filter-condition-row filter-condition-values">
                        <input type="text" class="filter-condition-value filter-condition-value-start" placeholder="起始值...">
                        <span class="filter-condition-separator">~</span>
                        <input type="text" class="filter-condition-value filter-condition-value-end" placeholder="结束值...">
                    </div>
                </div>
            </div>
        </div>
        <div class="filter-footer">
            <button class="filter-clear-btn">清除筛选</button>
            <button class="filter-apply-btn">确定</button>
        </div>
    </div>
`;

export class FilterDropdown extends HTMLElement {
    /** @type {number} 当前列索引 */
    #col = -1;

    /** @type {string[]} 所有唯一值列表 */
    #allValues = [];

    /** @type {Set<string>} 未勾选的值集合 */
    #uncheckedValues = new Set();

    /** @type {string} 搜索关键词 */
    #searchKeyword = "";

    /** @type {string|null} 条件筛选操作符 */
    #conditionOperator = null;

    /** @type {string|null} 条件筛选起始值 */
    #conditionValue = null;

    /** @type {string|null} 条件筛选结束值（between 操作符使用） */
    #conditionValueEnd = null;

    /** @type {string} 当前筛选模式："values" | "condition" */
    #filterMode = "values";

    /** @type {VirtualValueList|null} 虚拟列表实例引用 */
    #virtualList = null;

    /** @type {Function|null} 应用筛选回调 */
    #onApply = null;

    /** @type {Function|null} 清除筛选回调 */
    #onClear = null;

    /** @type {Object|null} 显示选项 */
    #options = null;

    /** @type {string} 列类型："text" | "numeric" | "date" */
    #columnType = "text";

    /** @type {boolean} 数据是否已就绪（setData 已调用） */
    #dataReady = false;

    // ── DOM 引用缓存 ──────────────────────────────

    /** @type {HTMLInputElement|null} 搜索输入框 */
    #searchInput = null;

    /** @type {HTMLElement|null} 值列表内容区域 */
    #contentArea = null;

    /** @type {HTMLElement|null} 值筛选面板 */
    #valuesPanel = null;

    /** @type {HTMLElement|null} 条件筛选面板 */
    #conditionPanel = null;

    /** @type {HTMLElement|null} 搜索框容器 */
    #searchBox = null;

    /** @type {HTMLSelectElement|null} 条件操作符下拉框 */
    #operatorSelect = null;

    /** @type {HTMLInputElement|null} 条件起始值输入框 */
    #startInput = null;

    /** @type {HTMLInputElement|null} 条件结束值输入框 */
    #endInput = null;

    /** @type {HTMLElement|null} 条件值分隔符 */
    #separator = null;

    /** @type {NodeListOf<HTMLElement>|null} 标签页按钮集合 */
    #tabButtons = null;

    /**
     * 创建筛选下拉面板实例
     *
     * 初始化时仅创建 Shadow DOM，不立即渲染内容。
     * 需要依次调用 initCallbacks() 和 setData() 后才会渲染。
     *
     * @constructor
     */
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot.appendChild(template.content.cloneNode(true));
    }

    /**
     * 组件连接到 DOM 时调用
     *
     * 执行流程：
     * 1. 缓存 DOM 引用
     * 2. 绑定事件
     * 3. 应用动态样式
     * 4. 初始化面板状态
     * 5. 如果数据已就绪，渲染初始内容
     */
    connectedCallback() {
        this.#cacheDOMReferences();
        this.#bindEvents();
        this.#applyDynamicStyles();
        this.#initPanelState();

        if (this.#dataReady) {
            this.#renderInitialContent();
        }
    }

    /**
     * 组件断开连接时调用
     *
     * 清理虚拟列表资源
     */
    disconnectedCallback() {
        if (this.#virtualList) {
            this.#virtualList.destroy();
            this.#virtualList = null;
        }
    }

    /**
     * 初始化回调函数
     *
     * 由 FilterUIManager 在创建组件后调用，注入业务回调。
     *
     * @public
     * @param {Object} callbacks - 回调集合
     * @param {Function} [callbacks.onApply] - 应用筛选回调 (filter) => void
     * @param {Function} [callbacks.onClear] - 清除筛选回调 () => void
     */
    initCallbacks(callbacks) {
        this.#onApply = callbacks?.onApply || null;
        this.#onClear = callbacks?.onClear || null;
    }

    /**
     * 设置筛选数据并触发渲染
     *
     * 由 FilterUIManager 在 initCallbacks 之后调用。
     * 如果组件已连接到 DOM，立即渲染；否则在 connectedCallback 时渲染。
     *
     * @public
     * @param {number} col - 列索引
     * @param {string[]} allValues - 所有唯一值列表
     * @param {Object|null} currentFilter - 当前筛选配置
     * @param {Object} options - 显示选项
     * @param {string} [options.columnType="text"] - 列类型
     * @param {number} [options.dropdownWidth=300] - 面板宽度（覆盖 :host 中 --dropdown-width 默认值）
     * @param {number} [options.dropdownMaxHeight=360] - 面板最大高度（覆盖 :host 中 --dropdown-max-height 默认值）
     * @param {number} [options.virtualScrollThreshold=200] - 虚拟滚动阈值
     */
    setData(col, allValues, currentFilter, options) {
        this.#col = col;
        this.#allValues = allValues;
        this.#options = options;
        this.#columnType = options?.columnType || "text";

        if (currentFilter) {
            this.#filterMode = currentFilter.type;
            if (currentFilter.type === "values") {
                this.#uncheckedValues = new Set(currentFilter.uncheckedValues);
            } else {
                this.#conditionOperator = currentFilter.operator;
                this.#conditionValue = currentFilter.value;
                this.#conditionValueEnd = currentFilter.valueEnd || null;
            }
        } else {
            this.#uncheckedValues = new Set();
            this.#conditionOperator = null;
            this.#conditionValue = null;
            this.#conditionValueEnd = null;
            this.#filterMode = "values";
        }

        this.#dataReady = true;

        if (this.isConnected) {
            this.#renderInitialContent();
        }
    }

    /**
     * 聚焦搜索输入框
     *
     * @public
     */
    focusSearchInput() {
        this.#searchInput?.focus();
    }

    /**
     * 获取当前列索引
     * @returns {number}
     */
    get col() {
        return this.#col;
    }

    // ── DOM 缓存与事件绑定 ──────────────────────

    /**
     * 缓存 Shadow DOM 元素引用
     *
     * @private
     */
    #cacheDOMReferences() {
        const root = this.shadowRoot;
        this.#searchInput = root.querySelector(".filter-search-input");
        this.#contentArea = root.querySelector(".filter-content");
        this.#valuesPanel = root.querySelector(".filter-panel.values");
        this.#conditionPanel = root.querySelector(".filter-panel.condition");
        this.#searchBox = root.querySelector(".filter-search-box");
        this.#operatorSelect = root.querySelector(".filter-condition-operator");
        this.#startInput = root.querySelector(".filter-condition-value-start");
        this.#endInput = root.querySelector(".filter-condition-value-end");
        this.#separator = root.querySelector(".filter-condition-separator");
        this.#tabButtons = root.querySelectorAll(".filter-tab");
    }

    /**
     * 绑定事件监听器
     *
     * 使用事件委托在 shadowRoot 上统一监听 click 和 input 事件。
     *
     * @private
     */
    #bindEvents() {
        const root = this.shadowRoot;
        root.addEventListener(EVENT_NAMES.CLICK, this.#handlePanelClick);
        root.addEventListener(EVENT_NAMES.INPUT, this.#handlePanelInput);
    }

    /**
     * 应用动态样式
     *
     * 根据配置设置 CSS 变量（面板宽度、最大高度）
     *
     * @private
     */
    #applyDynamicStyles() {
        if (this.#options?.dropdownWidth !== undefined && this.#options?.dropdownWidth !== null) {
            this.style.setProperty("--dropdown-width", `${this.#options.dropdownWidth}px`);
        }
        if (this.#options?.dropdownMaxHeight !== undefined && this.#options?.dropdownMaxHeight !== null) {
            this.style.setProperty("--dropdown-max-height", `${this.#options.dropdownMaxHeight}px`);
        }
    }

    /**
     * 初始化面板状态
     *
     * 设置值面板和条件面板的初始位置和可见性
     *
     * @private
     */
    #initPanelState() {
        if (this.#valuesPanel && this.#conditionPanel) {
            this.#valuesPanel.style.transform = "translateX(0)";
            this.#conditionPanel.style.transform = "translateX(-100%)";
            this.#conditionPanel.classList.add("hidden");
        }
    }

    // ── 事件处理 ──────────────────────────────────

    /**
     * 处理面板点击事件（事件委托）
     *
     * @param {Event} e - 点击事件
     * @private
     */
    #handlePanelClick = (e) => {
        const target = e.target;

        if (target.classList.contains("filter-tab")) {
            this.#switchMode(target.dataset.mode);
            return;
        }

        if (target.classList.contains("filter-clear-btn")) {
            this.#handleClear();
            return;
        }

        if (target.classList.contains("filter-apply-btn")) {
            this.#applyCurrentFilter();
        }
    };

    /**
     * 处理清除筛选
     *
     * @private
     */
    #handleClear() {
        this.#searchKeyword = "";
        if (this.#searchInput) this.#searchInput.value = "";
        this.#uncheckedValues = new Set();
        this.#conditionOperator = null;
        this.#conditionValue = null;
        this.#conditionValueEnd = null;

        this.#renderContent();
        this.#onClear?.();
    }

    /**
     * 处理面板输入事件（事件委托）
     *
     * @param {Event} e - 输入事件
     * @private
     */
    #handlePanelInput = (e) => {
        const target = e.target;

        if (target.classList.contains("filter-search-input")) {
            this.#searchKeyword = target.value;
            this.#renderContent();
            return;
        }

        if (target.classList.contains("filter-condition-value-start")) {
            this.#conditionValue = target.value;
            return;
        }

        if (target.classList.contains("filter-condition-value-end")) {
            this.#conditionValueEnd = target.value;
            return;
        }

        if (target.classList.contains("filter-condition-operator")) {
            this.#conditionOperator = target.value;
            this.#updateConditionValueVisibility();
        }
    };

    // ── 模式切换 ──────────────────────────────────

    /**
     * 切换筛选模式
     *
     * @param {string} mode - 模式："values" 或 "condition"
     * @private
     */
    #switchMode(mode) {
        this.#filterMode = mode;

        this.#tabButtons?.forEach((tab) => {
            tab.classList.toggle("active", tab.dataset.mode === mode);
        });

        if (mode === "values") {
            this.#searchBox.style.display = "";
            this.#valuesPanel.style.transform = "translateX(0)";
            this.#valuesPanel.classList.remove("hidden");
            this.#conditionPanel.style.transform = "translateX(-100%)";
            this.#conditionPanel.classList.add("hidden");
            this.#renderContent();
        } else {
            this.#searchBox.style.display = "none";
            this.#valuesPanel.style.transform = "translateX(-100%)";
            this.#valuesPanel.classList.add("hidden");
            this.#conditionPanel.style.transform = "translateX(0)";
            this.#conditionPanel.classList.remove("hidden");
            this.#renderConditionOperators();
        }
    }

    // ── 内容渲染 ──────────────────────────────────

    /**
     * 渲染初始内容
     *
     * 根据当前筛选模式决定渲染值列表还是条件面板
     *
     * @private
     */
    #renderInitialContent() {
        if (this.#filterMode === "condition") {
            this.#switchMode("condition");
        } else {
            this.#renderContent();
        }
    }

    /**
     * 获取过滤后的值列表
     *
     * 根据搜索关键词过滤值列表，空值始终保留在末尾
     *
     * @returns {string[]} 过滤后的值列表
     * @private
     */
    #getFilteredValues() {
        let filtered = this.#allValues;

        if (this.#searchKeyword) {
            const keyword = this.#searchKeyword.toLowerCase();
            filtered = filtered.filter((v) => {
                if (v === NullValueHandler.NULL_KEY) {
                    return false;
                }
                return v.toLowerCase().includes(keyword);
            });

            if (this.#allValues.includes(NullValueHandler.NULL_KEY)) {
                filtered.push(NullValueHandler.NULL_KEY);
            }
        }

        return filtered;
    }

    /**
     * 判断是否应该使用虚拟滚动
     *
     * @param {string[]} values - 值列表
     * @returns {boolean} 是否应该虚拟滚动
     * @private
     */
    #shouldVirtualize(values) {
        const threshold = this.#options?.virtualScrollThreshold || 200;
        return values.length > threshold;
    }

    /**
     * 渲染内容区域
     *
     * 根据数据量决定使用直接渲染或虚拟滚动
     *
     * @private
     */
    #renderContent() {
        if (!this.#contentArea) return;

        try {
            const filteredValues = this.#getFilteredValues();
            const shouldVirtualize = this.#shouldVirtualize(filteredValues);

            const currentlyVirtual = this.#contentArea.classList.contains("virtual");
            const virtualListReady = this.#virtualList && typeof this.#virtualList.updateItems === "function";

            if (shouldVirtualize && currentlyVirtual && virtualListReady) {
                this.#virtualList.updateItems(filteredValues, this.#uncheckedValues);
                return;
            }

            this.#contentArea.innerHTML = "";
            this.#contentArea.classList.remove("virtual");
            this.#virtualList = null;

            if (shouldVirtualize) {
                this.#contentArea.classList.add("virtual");
                this.#renderVirtualValueList(this.#contentArea, filteredValues);
            } else {
                this.#renderDirectValueList(this.#contentArea, filteredValues);
            }
        } catch (error) {
            errorHandler.error(ERROR_CODE.FILTER_DROPDOWN_RENDER_ERROR, "渲染筛选内容失败", { originalError: error });
        }
    }

    /**
     * 直接渲染值列表（适用于小数据量）
     *
     * @param {HTMLElement} container - 容器元素
     * @param {string[]} values - 值列表
     * @private
     */
    #renderDirectValueList(container, values) {
        const normalValues = values.filter((v) => v !== NullValueHandler.NULL_KEY);
        const hasBlankValue = values.includes(NullValueHandler.NULL_KEY);

        const allNormalChecked = normalValues.every((v) => !this.#uncheckedValues.has(v));
        const blankChecked = hasBlankValue && !this.#uncheckedValues.has(NullValueHandler.NULL_KEY);

        const selectAllItem = document.createElement("div");
        selectAllItem.className = "filter-value-item filter-select-all";

        const allChecked = allNormalChecked && (!hasBlankValue || blankChecked);
        selectAllItem.innerHTML = `
            <input type="checkbox" ${allChecked ? "checked" : ""}>
            <span>(全选)</span>
        `;

        selectAllItem.addEventListener("click", (e) => {
            const checkbox = selectAllItem.querySelector("input");

            if (e.target.tagName !== "INPUT") {
                checkbox.checked = !checkbox.checked;
            }

            if (checkbox.checked) {
                values.forEach((v) => this.#uncheckedValues.delete(v));
            } else {
                values.forEach((v) => this.#uncheckedValues.add(v));
            }
            this.#renderContent();
        });
        container.appendChild(selectAllItem);

        normalValues.forEach((value) => {
            const item = this.#createValueItem(value);
            container.appendChild(item);
        });

        if (hasBlankValue) {
            const blankItem = document.createElement("div");
            blankItem.className = "filter-value-item";
            blankItem.dataset.value = NullValueHandler.NULL_KEY;

            const checked = !this.#uncheckedValues.has(NullValueHandler.NULL_KEY);
            blankItem.innerHTML = `
                <input type="checkbox" ${checked ? "checked" : ""}>
                <span style="font-style: italic; color: #999;">${NullValueHandler.BLANK_DISPLAY}</span>
            `;

            blankItem.addEventListener("click", (e) => {
                const checkbox = blankItem.querySelector("input");

                if (e.target.tagName !== "INPUT") {
                    checkbox.checked = !checkbox.checked;
                }

                if (checkbox.checked) {
                    this.#uncheckedValues.delete(NullValueHandler.NULL_KEY);
                } else {
                    this.#uncheckedValues.add(NullValueHandler.NULL_KEY);
                }
                this.#renderContent();
            });

            container.appendChild(blankItem);
        }

        const separator = document.createElement("div");
        separator.style.cssText = "height: 1px; background: #f0f0f0; margin: 4px 12px;";
        container.appendChild(separator);
    }

    /**
     * 创建值列表项
     *
     * @param {string} value - 值
     * @returns {HTMLElement} 列表项元素
     * @private
     */
    #createValueItem(value) {
        const item = document.createElement("div");
        item.className = "filter-value-item";
        item.dataset.value = value;

        const checked = !this.#uncheckedValues.has(value);
        item.innerHTML = `
            <input type="checkbox" ${checked ? "checked" : ""}>
            <span>${this.#escapeHtml(value)}</span>
        `;

        item.addEventListener("click", (e) => {
            const checkbox = item.querySelector('input[type="checkbox"]');

            if (e.target.tagName !== "INPUT") {
                checkbox.checked = !checkbox.checked;
            }

            if (checkbox.checked) {
                this.#uncheckedValues.delete(value);
            } else {
                this.#uncheckedValues.add(value);
            }
            this.#renderContent();
        });

        return item;
    }

    /**
     * 渲染虚拟值列表（适用于大数据量）
     *
     * @param {HTMLElement} container - 容器元素
     * @param {string[]} values - 值列表
     * @private
     */
    #renderVirtualValueList(container, values) {
        if (this.#virtualList) {
            this.#virtualList.updateItems(values, this.#uncheckedValues);
            this.#updateSelectAllState(container, values);
            return;
        }

        const selectAllItem = document.createElement("div");
        selectAllItem.className = "filter-value-item filter-select-all";
        selectAllItem.innerHTML = `
            <input type="checkbox">
            <span>(全选)</span>
        `;
        container.appendChild(selectAllItem);

        this.#bindSelectAllEvent(selectAllItem, values);

        this.#virtualList = document.createElement("virtual-value-list");

        customElements.whenDefined("virtual-value-list").then(() => {
            if (typeof this.#virtualList.init === "function") {
                this.#virtualList.init(values, this.#uncheckedValues, (value, checked) => {
                    if (checked) {
                        this.#uncheckedValues.delete(value);
                    } else {
                        this.#uncheckedValues.add(value);
                    }
                    this.#updateSelectAllState(container, values);
                });
                container.appendChild(this.#virtualList);
                this.#updateSelectAllState(container, values);
            }
        });
    }

    /**
     * 绑定全选事件
     *
     * @param {HTMLElement} selectAllItem - 全选项元素
     * @param {string[]} values - 值列表
     * @private
     */
    #bindSelectAllEvent(selectAllItem, values) {
        selectAllItem.addEventListener("click", (e) => {
            const checkbox = selectAllItem.querySelector("input");

            if (e.target.tagName === "INPUT") {
                // 点击 checkbox 本身，浏览器已切换状态，使用当前状态
            } else {
                // 点击名称，手动切换状态
                checkbox.checked = !checkbox.checked;
            }

            if (checkbox.checked) {
                values.forEach((v) => this.#uncheckedValues.delete(v));
            } else {
                values.forEach((v) => this.#uncheckedValues.add(v));
            }

            if (typeof this.#virtualList?.updateItems === "function") {
                this.#virtualList.updateItems(values, this.#uncheckedValues);
            }
            this.#updateSelectAllState(e.currentTarget.parentElement, values);
        });
    }

    /**
     * 更新全选状态
     *
     * @param {HTMLElement} container - 容器元素
     * @param {string[]} values - 值列表
     * @private
     */
    #updateSelectAllState(container, values) {
        const selectAllItem = container.querySelector(".filter-select-all");
        if (!selectAllItem) return;

        const normalValues = values.filter((v) => v !== NullValueHandler.NULL_KEY);
        const allNormalChecked = normalValues.every((v) => !this.#uncheckedValues.has(v));
        const hasBlankValue = values.includes(NullValueHandler.NULL_KEY);
        const blankChecked = hasBlankValue && !this.#uncheckedValues.has(NullValueHandler.NULL_KEY);
        const isAllChecked = normalValues.length > 0 && allNormalChecked && (!hasBlankValue || blankChecked);

        const checkbox = selectAllItem.querySelector("input");
        checkbox.checked = isAllChecked;
    }

    // ── 条件筛选 ──────────────────────────────────

    /**
     * 渲染条件操作符
     *
     * 根据列类型显示对应的操作符列表
     *
     * @private
     */
    #renderConditionOperators() {
        if (!this.#operatorSelect) return;

        const operators = this.#getOperatorsByColumnType();
        const operatorLabels = this.#getOperatorLabels();

        if (!this.#conditionOperator && operators.length > 0) {
            this.#conditionOperator = operators[0];
        }

        this.#operatorSelect.innerHTML = "";
        operators.forEach((op) => {
            const option = document.createElement("option");
            option.value = op;
            option.textContent = operatorLabels[op] || op;
            if (op === this.#conditionOperator) {
                option.selected = true;
            }
            this.#operatorSelect.appendChild(option);
        });

        this.#updateConditionValueVisibility();

        if (this.#columnType === "date") {
            this.#startInput.type = "date";
            this.#endInput.type = "date";
            this.#startInput.placeholder = "开始日期...";
            this.#endInput.placeholder = "结束日期...";
            if (this.#conditionValue) {
                this.#startInput.value = this.#conditionValue;
            }
            if (this.#conditionValueEnd) {
                this.#endInput.value = this.#conditionValueEnd;
            }
        } else {
            this.#startInput.type = "text";
            this.#endInput.type = "text";
            this.#startInput.placeholder = "起始值...";
            this.#endInput.placeholder = "结束值...";
            this.#startInput.value = this.#conditionValue || "";
            this.#endInput.value = this.#conditionValueEnd || "";
        }
    }

    /**
     * 根据列类型获取操作符列表
     *
     * @returns {string[]} 操作符列表
     * @private
     */
    #getOperatorsByColumnType() {
        const columnType = this.#columnType;

        if (columnType === "date") {
            return [
                "dateEq",
                "dateNeq",
                "dateBefore",
                "dateAfter",
                "dateBetween",
                "dateToday",
                "dateYesterday",
                "dateTomorrow",
                "dateThisWeek",
                "dateLastWeek",
                "dateNextWeek",
                "dateThisMonth",
                "dateLastMonth",
                "dateNextMonth",
                "dateThisYear",
                "dateLastYear",
            ];
        }

        if (columnType === "numeric") {
            return ["eq", "neq", "gt", "gte", "lt", "lte", "between"];
        }

        return ["eq", "neq", "contains", "notContains", "startsWith", "endsWith", "regex"];
    }

    /**
     * 获取操作符标签映射
     *
     * @returns {Object} 操作符到中文标签的映射
     * @private
     */
    #getOperatorLabels() {
        return {
            eq: "等于",
            neq: "不等于",
            contains: "包含",
            notContains: "不包含",
            startsWith: "开头是",
            endsWith: "结尾是",
            gt: "大于",
            gte: "大于等于",
            lt: "小于",
            lte: "小于等于",
            between: "介于",
            regex: "正则匹配",
            dateEq: "日期等于",
            dateNeq: "日期不等于",
            dateBefore: "早于",
            dateAfter: "晚于",
            dateBetween: "日期范围",
            dateToday: "今天",
            dateYesterday: "昨天",
            dateTomorrow: "明天",
            dateThisWeek: "本周",
            dateLastWeek: "上周",
            dateNextWeek: "下周",
            dateThisMonth: "本月",
            dateLastMonth: "上月",
            dateNextMonth: "下月",
            dateThisYear: "今年",
            dateLastYear: "去年",
        };
    }

    /**
     * 更新条件值的可见性
     *
     * 根据操作符决定是否显示结束值输入框（如 between 操作符）
     *
     * @private
     */
    #updateConditionValueVisibility() {
        const rangeOperators = ["between", "dateBetween"];

        if (rangeOperators.includes(this.#conditionOperator)) {
            this.#separator.style.display = "inline-block";
            this.#endInput.style.display = "inline-block";
        } else {
            this.#separator.style.display = "none";
            this.#endInput.style.display = "none";
        }
    }

    // ── 应用筛选 ──────────────────────────────────

    /**
     * 应用当前筛选
     *
     * 根据当前模式构建筛选配置并调用 onApply 回调
     *
     * @private
     */
    #applyCurrentFilter() {
        try {
            let filter;

            if (this.#filterMode === "values") {
                filter = {
                    type: "values",
                    uncheckedValues: new Set(this.#uncheckedValues),
                };
            } else {
                filter = {
                    type: "condition",
                    operator: this.#conditionOperator,
                    value: this.#conditionValue,
                    valueEnd: this.#conditionValueEnd,
                };
            }

            this.#onApply?.(filter);
        } catch (error) {
            errorHandler.error(ERROR_CODE.FILTER_DROPDOWN_APPLY_ERROR, "应用筛选失败", { originalError: error });
        }
    }

    // ── 工具方法 ──────────────────────────────────

    /**
     * HTML 转义
     *
     * 将特殊 HTML 字符转换为实体表示，防止 XSS
     *
     * @param {string} text - 待转义的文本
     * @returns {string} 转义后的安全文本
     * @private
     */
    #escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
}

customElements.define("filter-dropdown", FilterDropdown);
