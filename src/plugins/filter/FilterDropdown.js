import { PopupPanel } from "../../ui/components/PopupPanel.js";
import { VirtualValueList } from "./VirtualValueList.js";
import { NullValueHandler } from "./NullValueTypes.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";

export class FilterDropdown extends PopupPanel {

    #col = -1;
    #allValues = [];
    #uncheckedValues = new Set();
    #searchKeyword = "";
    #conditionOperator = null;
    #conditionValue = null;
    #filterMode = "values";
    #virtualList = null;
    #onApply = null;
    #onClear = null;
    #options = null;

    constructor() {
        super();
    }

    get col() {
        return this.#col;
    }

    show(col, position, allValues, currentFilter, options, onApply, onClear) {
        this.#col = col;
        this.#allValues = allValues;
        this.#options = options;
        this.#onApply = onApply;
        this.#onClear = onClear;

        if (currentFilter) {
            this.#filterMode = currentFilter.type;
            if (currentFilter.type === "values") {
                this.#uncheckedValues = new Set(currentFilter.uncheckedValues);
            } else {
                this.#conditionOperator = currentFilter.operator;
                this.#conditionValue = currentFilter.value;
            }
        } else {
            this.#uncheckedValues = new Set();
            this.#conditionOperator = null;
            this.#conditionValue = null;
            this.#filterMode = "values";
        }

        super.show({
            position,
            placement: "bottom",
            zIndex: 10001,
            onClose: () => {}
        });

        this.#renderContent();
    }

    render() {
        const width = this.#options?.dropdownWidth || 240;
        const maxHeight = this.#options?.dropdownMaxHeight || 360;

        this.shadowRoot.innerHTML = `
            <style>
                .filter-dropdown-panel {
                    width: ${width}px;
                    max-height: ${maxHeight}px;
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
                .filter-dropdown-panel .filter-search-box {
                    padding: 8px 12px;
                    border-bottom: 1px solid #f0f0f0;
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
                    max-height: 250px;
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
                    display: none;
                }
                .filter-dropdown-panel .filter-condition-area.visible {
                    display: block;
                }
                .filter-dropdown-panel .filter-condition-operator,
                .filter-dropdown-panel .filter-condition-value {
                    width: 100%;
                    padding: 4px 8px;
                    border: 1px solid #d9d9d9;
                    border-radius: 4px;
                    box-sizing: border-box;
                    margin-bottom: 8px;
                    outline: none;
                }
                .filter-dropdown-panel .filter-condition-value:focus {
                    border-color: #1890ff;
                    box-shadow: 0 0 0 2px rgba(24,144,255,0.2);
                }
                .filter-dropdown-panel .filter-footer {
                    padding: 8px 12px;
                    border-top: 1px solid #f0f0f0;
                    display: flex;
                    justify-content: space-between;
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
                <div class="filter-content"></div>
                <div class="filter-condition-area">
                    <select class="filter-condition-operator"></select>
                    <input type="text" class="filter-condition-value" placeholder="输入值...">
                </div>
                <div class="filter-footer">
                    <button class="filter-clear-btn">清除筛选</button>
                    <button class="filter-apply-btn">确定</button>
                </div>
            </div>
        `;
    }

    onConnect(disposable) {
        super.onConnect(disposable);

        disposable.trackEvent(this.shadowRoot, EVENT_NAMES.CLICK, this.#handlePanelClick.bind(this));
        disposable.trackEvent(this.shadowRoot, EVENT_NAMES.INPUT, this.#handlePanelInput.bind(this));
    }

    onDisconnect() {
        if (this.#virtualList) {
            this.#virtualList.destroy();
            this.#virtualList = null;
        }
        super.onDisconnect();
    }

    #handlePanelClick(e) {
        const target = e.target;

        if (target.classList.contains("filter-tab")) {
            const mode = target.dataset.mode;
            this.#switchMode(mode);
            return;
        }

        if (target.classList.contains("filter-clear-btn")) {
            this.#onClear?.();
            return;
        }

        if (target.classList.contains("filter-apply-btn")) {
            this.#applyCurrentFilter();
            return;
        }
    }

    #handlePanelInput(e) {
        const target = e.target;

        if (target.classList.contains("filter-search-input")) {
            this.#searchKeyword = target.value;
            this.#renderContent();
            return;
        }

        if (target.classList.contains("filter-condition-value")) {
            this.#conditionValue = target.value;
            return;
        }

        if (target.classList.contains("filter-condition-operator")) {
            this.#conditionOperator = target.value;
            return;
        }
    }

    #switchMode(mode) {
        this.#filterMode = mode;

        const tabs = this.shadowRoot.querySelectorAll(".filter-tab");
        tabs.forEach(tab => {
            tab.classList.toggle("active", tab.dataset.mode === mode);
        });

        const contentArea = this.shadowRoot.querySelector(".filter-content");
        const conditionArea = this.shadowRoot.querySelector(".filter-condition-area");

        if (mode === "values") {
            contentArea.style.display = "block";
            conditionArea.classList.remove("visible");
            this.#renderContent();
        } else {
            contentArea.style.display = "none";
            conditionArea.classList.add("visible");
            this.#renderConditionOperators();
        }
    }

    #getFilteredValues() {
        let filtered = this.#allValues;

        if (this.#searchKeyword) {
            const keyword = this.#searchKeyword.toLowerCase();
            filtered = filtered.filter(v => {
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

    #shouldVirtualize(values) {
        const threshold = this.#options?.virtualScrollThreshold || 200;
        return values.length > threshold;
    }

    #renderContent() {
        const contentArea = this.shadowRoot.querySelector(".filter-content");
        if (!contentArea) return;

        contentArea.innerHTML = "";

        const filteredValues = this.#getFilteredValues();

        if (this.#shouldVirtualize(filteredValues)) {
            this.#renderVirtualValueList(contentArea, filteredValues);
        } else {
            this.#renderDirectValueList(contentArea, filteredValues);
        }
    }

    #renderDirectValueList(container, values) {
        const normalValues = values.filter(v => v !== NullValueHandler.NULL_KEY);
        const hasBlankValue = values.includes(NullValueHandler.NULL_KEY);

        const allNormalChecked = normalValues.every(v => !this.#uncheckedValues.has(v));
        const blankChecked = hasBlankValue && !this.#uncheckedValues.has(NullValueHandler.NULL_KEY);

        const selectAllItem = document.createElement("div");
        selectAllItem.className = "filter-value-item";
        
        const allChecked = allNormalChecked && (!hasBlankValue || blankChecked);
        selectAllItem.innerHTML = `
            <input type="checkbox" ${allChecked ? "checked" : ""}>
            <span>(全选)</span>
        `;
        
        selectAllItem.addEventListener("click", () => {
            if (allChecked) {
                values.forEach(v => this.#uncheckedValues.add(v));
            } else {
                values.forEach(v => this.#uncheckedValues.delete(v));
            }
            this.#renderContent();
        });
        container.appendChild(selectAllItem);

        normalValues.forEach(value => {
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
            
            blankItem.addEventListener("click", () => {
                if (this.#uncheckedValues.has(NullValueHandler.NULL_KEY)) {
                    this.#uncheckedValues.delete(NullValueHandler.NULL_KEY);
                } else {
                    this.#uncheckedValues.add(NullValueHandler.NULL_KEY);
                }
            });
            
            container.appendChild(blankItem);
        }

        const separator = document.createElement("div");
        separator.style.cssText = "height: 1px; background: #f0f0f0; margin: 4px 12px;";
        container.appendChild(separator);
    }

    #createValueItem(value) {
        const item = document.createElement("div");
        item.className = "filter-value-item";
        item.dataset.value = value;

        const checked = !this.#uncheckedValues.has(value);
        item.innerHTML = `
            <input type="checkbox" ${checked ? "checked" : ""}>
            <span>${this.escapeHtml(value)}</span>
        `;

        item.addEventListener("click", () => {
            if (this.#uncheckedValues.has(value)) {
                this.#uncheckedValues.delete(value);
            } else {
                this.#uncheckedValues.add(value);
            }
        });

        return item;
    }

    #renderVirtualValueList(container, values) {
        if (this.#virtualList) {
            this.#virtualList.updateItems(values, this.#uncheckedValues);
            return;
        }

        this.#virtualList = document.createElement("virtual-value-list");
        container.appendChild(this.#virtualList);

        this.#virtualList.init(
            values,
            this.#uncheckedValues,
            (value, checked) => {
                if (checked) {
                    this.#uncheckedValues.delete(value);
                } else {
                    this.#uncheckedValues.add(value);
                }
            }
        );
    }

    #renderConditionOperators() {
        const select = this.shadowRoot.querySelector(".filter-condition-operator");
        if (!select) return;

        const operators = this.#options?.conditionOperators || [
            "eq", "neq", "contains", "notContains"
        ];

        const operatorLabels = {
            eq: "等于",
            neq: "不等于",
            contains: "包含",
            notContains: "不包含",
            startsWith: "开头是",
            endsWith: "结尾是",
            gt: "大于",
            gte: "大于等于",
            lt: "小于",
            lte: "小于等于"
        };

        select.innerHTML = "";
        operators.forEach(op => {
            const option = document.createElement("option");
            option.value = op;
            option.textContent = operatorLabels[op] || op;
            if (op === this.#conditionOperator) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    #applyCurrentFilter() {
        let filter;

        if (this.#filterMode === "values") {
            filter = {
                type: "values",
                uncheckedValues: new Set(this.#uncheckedValues)
            };
        } else {
            filter = {
                type: "condition",
                operator: this.#conditionOperator,
                value: this.#conditionValue
            };
        }

        this.#onApply?.(filter);
    }
}

customElements.define("filter-dropdown", FilterDropdown);
