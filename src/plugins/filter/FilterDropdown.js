import { PopupPanel } from "../../ui/components/PopupPanel.js";
import { NullValueHandler } from "./NullValueTypes.js";
import { VirtualValueList } from "./VirtualValueList.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";

const template = document.createElement("template");
template.innerHTML = `
    <style>
        :host {
            --dropdown-width: 240px;
            --dropdown-max-height: 360px;
        }
        .filter-dropdown-panel {
            width: var(--dropdown-width);
            height: var(--dropdown-max-height);
            max-height: var(--dropdown-max-height);
            background: #fff;
            border: 1px solid #d9d9d9;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
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
            min-height: 100px;
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

/**
 * 筛选下拉面板组件
 *
 * 负责渲染和管理筛选弹出面板的 UI，包括：
 * - 值筛选模式（勾选列表）
 * - 条件筛选模式（操作符 + 值输入）
 * - 搜索过滤功能
 * - 虚拟滚动（大数据量优化）
 * - 全选/取消全选
 *
 * @extends PopupPanel
 */
export class FilterDropdown extends PopupPanel {
    #col = -1;
    #allValues = [];
    #uncheckedValues = new Set();
    #searchKeyword = "";
    #conditionOperator = null;
    #conditionValue = null;
    #conditionValueEnd = null;
    #filterMode = "values";
    #virtualList = null;
    #onApply = null;
    #onClear = null;
    #options = null;
    #columnType = "text";

    constructor() {
        super();
    }

    /**
     * 获取当前列索引
     * @returns {number}
     */
    get col() {
        return this.#col;
    }

    /**
     * 显示筛选面板
     *
     * @param {number} col - 列索引
     * @param {Object} position - 显示位置 { x, y }
     * @param {string[]} allValues - 所有唯一值列表
     * @param {Object} currentFilter - 当前筛选配置
     * @param {Object} options - 显示选项
     * @param {Function} onApply - 应用筛选回调
     * @param {Function} onClear - 清除筛选回调
     */
    show(col, position, allValues, currentFilter, options, onApply, onClear) {
        this.#col = col;
        this.#allValues = allValues;
        this.#options = options;
        this.#onApply = onApply;
        this.#onClear = onClear;
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

        super.show({
            position,
            placement: "bottom",
            zIndex: 10001,
            onClose: () => {},
        });

        requestAnimationFrame(() => {
            if (this.#filterMode === "condition") {
                this.#switchMode("condition");
            } else {
                this.#renderContent();
            }
        });
    }

    /**
     * 渲染组件
     *
     * 创建 Shadow DOM 结构
     */
    render() {
        if (!this.shadowRoot.querySelector(".filter-dropdown-panel")) {
            this.shadowRoot.appendChild(template.content.cloneNode(true));
            this.#applyDynamicStyles();
            this.#initPanelState();
        }
    }

    /**
     * 初始化面板状态
     *
     * 设置面板的初始位置和可见性
     * @private
     */
    #initPanelState() {
        const valuesPanel = this.shadowRoot.querySelector(".filter-panel.values");
        const conditionPanel = this.shadowRoot.querySelector(".filter-panel.condition");
        if (valuesPanel && conditionPanel) {
            valuesPanel.classList.add("values");
            valuesPanel.style.transform = "translateX(0)";
            conditionPanel.classList.add("condition");
            conditionPanel.classList.add("hidden");
            conditionPanel.style.transform = "translateX(-100%)";
        }
    }

    /**
     * 应用动态样式
     *
     * 根据配置设置 CSS 变量
     * @private
     */
    #applyDynamicStyles() {
        const width = this.#options?.dropdownWidth || 240;
        const maxHeight = this.#options?.dropdownMaxHeight || 360;
        const host = this.shadowRoot.host;
        host.style.setProperty("--dropdown-width", `${width}px`);
        host.style.setProperty("--dropdown-max-height", `${maxHeight}px`);
    }

    /**
     * 组件连接时调用
     *
     * @param {Object} disposable - 可追踪事件的对象
     */
    onConnect(disposable) {
        super.onConnect(disposable);

        disposable.trackEvent(this.shadowRoot, EVENT_NAMES.CLICK, this.#handlePanelClick.bind(this));
        disposable.trackEvent(this.shadowRoot, EVENT_NAMES.INPUT, this.#handlePanelInput.bind(this));

        if (this.#filterMode === "condition") {
            this.#switchMode("condition");
        }
    }

    /**
     * 组件断开连接时调用
     */
    onDisconnect() {
        if (this.#virtualList) {
            this.#virtualList.destroy();
            this.#virtualList = null;
        }
        super.onDisconnect();
    }

    /**
     * 处理面板点击事件
     *
     * @param {Event} e - 点击事件
     * @private
     */
    #handlePanelClick(e) {
        const target = e.target;

        if (target.classList.contains("filter-tab")) {
            const mode = target.dataset.mode;
            this.#switchMode(mode);
            return;
        }

        if (target.classList.contains("filter-clear-btn")) {
            this.#searchKeyword = "";
            const searchInput = this.shadowRoot.querySelector(".filter-search-input");
            if (searchInput) searchInput.value = "";
            this.#uncheckedValues = new Set();
            this.#conditionOperator = null;
            this.#conditionValue = null;

            this.#renderContent();

            this.#onClear?.();
            return;
        }

        if (target.classList.contains("filter-apply-btn")) {
            this.#applyCurrentFilter();
        }
    }

    /**
     * 处理面板输入事件
     *
     * @param {Event} e - 输入事件
     * @private
     */
    #handlePanelInput(e) {
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
    }

    /**
     * 切换筛选模式
     *
     * @param {string} mode - 模式："values" 或 "condition"
     * @private
     */
    #switchMode(mode) {
        this.#filterMode = mode;

        const tabs = this.shadowRoot.querySelectorAll(".filter-tab");
        tabs.forEach((tab) => {
            tab.classList.toggle("active", tab.dataset.mode === mode);
        });

        const searchBox = this.shadowRoot.querySelector(".filter-search-box");
        const valuesPanel = this.shadowRoot.querySelector(".filter-panel.values");
        const conditionPanel = this.shadowRoot.querySelector(".filter-panel.condition");

        if (mode === "values") {
            searchBox.style.display = "";
            valuesPanel.style.transform = "translateX(0)";
            valuesPanel.classList.remove("hidden");
            conditionPanel.style.transform = "translateX(-100%)";
            conditionPanel.classList.add("hidden");
            this.#renderContent();
        } else {
            searchBox.style.display = "none";
            valuesPanel.style.transform = "translateX(-100%)";
            valuesPanel.classList.add("hidden");
            conditionPanel.style.transform = "translateX(0)";
            conditionPanel.classList.remove("hidden");
            this.#renderConditionOperators();
        }
    }

    /**
     * 获取过滤后的值列表
     *
     * 根据搜索关键词过滤值列表
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
     * @private
     */
    #renderContent() {
        const contentArea = this.shadowRoot.querySelector(".filter-content");
        if (!contentArea) return;

        const filteredValues = this.#getFilteredValues();
        const shouldVirtualize = this.#shouldVirtualize(filteredValues);

        const currentlyVirtual = contentArea.classList.contains("virtual");
        const virtualListReady = this.#virtualList && typeof this.#virtualList.updateItems === "function";

        if (shouldVirtualize && currentlyVirtual && virtualListReady) {
            this.#virtualList.updateItems(filteredValues, this.#uncheckedValues);
            return;
        }

        contentArea.innerHTML = "";
        contentArea.classList.remove("virtual");
        this.#virtualList = null;

        if (shouldVirtualize) {
            contentArea.classList.add("virtual");
            this.#renderVirtualValueList(contentArea, filteredValues);
        } else {
            this.#renderDirectValueList(contentArea, filteredValues);
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
            <span>${this.escapeHtml(value)}</span>
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

    /**
     * 渲染条件操作符
     *
     * 根据列类型显示对应的操作符列表
     * @private
     */
    #renderConditionOperators() {
        const select = this.shadowRoot.querySelector(".filter-condition-operator");
        const valuesRow = this.shadowRoot.querySelector(".filter-condition-values");
        const startInput = this.shadowRoot.querySelector(".filter-condition-value-start");
        const endInput = this.shadowRoot.querySelector(".filter-condition-value-end");
        const separator = this.shadowRoot.querySelector(".filter-condition-separator");

        if (!select || !valuesRow) return;

        const operators = this.#getOperatorsByColumnType();
        const operatorLabels = this.#getOperatorLabels();

        if (!this.#conditionOperator && operators.length > 0) {
            this.#conditionOperator = operators[0];
        }

        select.innerHTML = "";
        operators.forEach((op) => {
            const option = document.createElement("option");
            option.value = op;
            option.textContent = operatorLabels[op] || op;
            if (op === this.#conditionOperator) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        this.#updateConditionValueVisibility();

        if (this.#columnType === "date") {
            startInput.type = "date";
            endInput.type = "date";
            startInput.placeholder = "开始日期...";
            endInput.placeholder = "结束日期...";
            if (this.#conditionValue) {
                startInput.value = this.#conditionValue;
            }
            if (this.#conditionValueEnd) {
                endInput.value = this.#conditionValueEnd;
            }
        } else {
            startInput.type = "text";
            endInput.type = "text";
            startInput.placeholder = "起始值...";
            endInput.placeholder = "结束值...";
            startInput.value = this.#conditionValue || "";
            endInput.value = this.#conditionValueEnd || "";
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
                "dateEq", "dateNeq",
                "dateBefore", "dateAfter",
                "dateBetween",
                "dateToday", "dateYesterday", "dateTomorrow",
                "dateThisWeek", "dateLastWeek", "dateNextWeek",
                "dateThisMonth", "dateLastMonth", "dateNextMonth",
                "dateThisYear", "dateLastYear"
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
     * @private
     */
    #updateConditionValueVisibility() {
        const valuesRow = this.shadowRoot.querySelector(".filter-condition-values");
        const separator = this.shadowRoot.querySelector(".filter-condition-separator");
        const endInput = this.shadowRoot.querySelector(".filter-condition-value-end");

        const rangeOperators = ["between", "dateBetween"];

        if (rangeOperators.includes(this.#conditionOperator)) {
            separator.style.display = "inline-block";
            endInput.style.display = "inline-block";
        } else {
            separator.style.display = "none";
            endInput.style.display = "none";
        }
    }

    /**
     * 应用当前筛选
     *
     * 根据当前模式构建筛选配置并调用 onApply 回调
     * @private
     */
    #applyCurrentFilter() {
        console.log(
            "[FilterDropdown] #applyCurrentFilter, #uncheckedValues:",
            Array.from(this.#uncheckedValues),
            "size:",
            this.#uncheckedValues.size,
        );
        let filter;

        if (this.#filterMode === "values") {
            filter = {
                type: "values",
                uncheckedValues: new Set(this.#uncheckedValues),
            };
            console.log("[FilterDropdown] filter created:", filter);
        } else {
            filter = {
                type: "condition",
                operator: this.#conditionOperator,
                value: this.#conditionValue,
                valueEnd: this.#conditionValueEnd,
            };
            console.log("[FilterDropdown] condition filter created:", filter);
        }

        this.#onApply?.(filter);
    }
}

customElements.define("filter-dropdown", FilterDropdown);