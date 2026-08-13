/**
 * 虚拟值列表组件 (Virtual Value List)
 *
 * 职责：大数据量时的虚拟滚动优化，只渲染可见区域的选项。
 *
 * 功能支持：
 * - 虚拟滚动（只渲染可见项）
 * - 复选框勾选状态管理
 * - 空值显示
 *
 * 设计原则：
 * 1. **纯内容组件**:
 *    - 继承 HTMLElement，由 FilterDropdown 创建和管理
 *    - 通过 init() 接收数据和回调
 *
 * 2. **防御性编程**:
 *    - 渲染失败时通过 errorHandler 记录错误
 *    - 不向上抛出异常（避免影响主流程）
 *
 * 3. **性能优化**:
 *    - 仅渲染可见区域 + 缓冲项
 *    - 滚动时复用 DOM 节点（通过 innerHTML 批量更新）
 *
 * 使用示例：
 * ```javascript
 * const list = document.createElement("virtual-value-list");
 * list.init(items, uncheckedValues, (value, checked) => { ... });
 * container.appendChild(list);
 * ```
 *
 * @class VirtualValueList
 * @extends HTMLElement
 * @see {@link FilterDropdown} - 父组件
 */
import { EVENT_NAMES } from "../../constants/eventNames.js";
import { NullValueHandler } from "./NullValueTypes.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

const template = document.createElement("template");
template.innerHTML = `
    <style>
        :host {
            flex: 1;
            overflow-y: auto;
            position: relative;
            --item-height: 28px;
        }
        .virtual-container {
            height: 100%;
            position: relative;
        }
        .virtual-item {
            position: absolute;
            left: 0;
            right: 0;
            height: var(--item-height);
            display: flex;
            align-items: center;
            padding: 0 12px;
            cursor: pointer;
            box-sizing: border-box;
        }
        .virtual-item:hover {
            background: #f5f5f5;
        }
        .virtual-item input[type="checkbox"] {
            margin-right: 8px;
        }
        .virtual-blank-item span {
            font-style: italic;
            color: #999;
        }
    </style>
    <div class="virtual-container">
        <div class="virtual-render-zone"></div>
    </div>
`;

export class VirtualValueList extends HTMLElement {
    /** @type {string[]} 所有可选值列表 */
    #items = [];

    /** @type {Set<string>} 未勾选的值集合 */
    #uncheckedValues = new Set();

    /** @type {Function|null} 值切换时的回调函数 */
    #onToggle = null;

    /** @type {number} 单项高度（px） */
    #itemHeight = 28;

    /** @type {number} 可见项数量 */
    #visibleCount = 10;

    /** @type {number} 当前滚动位置 */
    #scrollTop = 0;

    /** @type {HTMLElement|null} 渲染区域 DOM 引用 */
    #renderZone = null;

    /** @type {boolean} 数据是否已就绪（init 已调用） */
    #dataReady = false;

    /** @type {boolean} 事件是否已绑定 */
    #eventsBound = false;

    /**
     * 创建虚拟值列表实例
     *
     * 初始化时仅创建 Shadow DOM，不立即渲染内容。
     * 需要调用 init() 后才会渲染。
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
     * 1. 缓存渲染区域 DOM 引用
     * 2. 绑定事件
     * 3. 如果数据已就绪，渲染可见项
     */
    connectedCallback() {
        this.#renderZone = this.shadowRoot.querySelector(".virtual-render-zone");
        this.#bindEvents();

        if (this.#dataReady) {
            this.#renderVisibleItems();
        }
    }

    /**
     * 组件断开连接时调用
     *
     * 清理内部状态和引用
     */
    disconnectedCallback() {
        this.#items = [];
        this.#uncheckedValues.clear();
        this.#onToggle = null;
        this.#renderZone = null;
        this.#eventsBound = false;
    }

    /**
     * 初始化组件
     *
     * 由 FilterDropdown 在创建组件后调用。
     * 如果组件已连接到 DOM，立即渲染；否则在 connectedCallback 时渲染。
     *
     * @public
     * @param {string[]} items - 所有可选值列表
     * @param {Set<string>} uncheckedValues - 未勾选的值集合
     * @param {Function} onToggle - 值切换时的回调函数 (value, checked) => void
     */
    init(items, uncheckedValues, onToggle) {
        this.#items = items;
        this.#uncheckedValues = new Set(uncheckedValues);
        this.#onToggle = onToggle;
        this.#dataReady = true;

        if (this.isConnected) {
            this.#renderVisibleItems();
        }
    }

    /**
     * 更新列表数据
     *
     * 当数据变化时调用，会重新渲染可见区域。
     * 如果列表内容变化，重置滚动位置到顶部。
     *
     * @public
     * @param {string[]} items - 新值列表
     * @param {Set<string>} uncheckedValues - 未勾选的值集合
     */
    updateItems(items, uncheckedValues) {
        const itemsChanged = this.#items.length !== items.length || !this.#items.every((v, i) => v === items[i]);

        this.#items = items;
        this.#uncheckedValues = new Set(uncheckedValues);

        if (itemsChanged && this.isConnected) {
            this.#scrollTop = 0;
            this.scrollTop = 0;
        }

        if (this.isConnected) {
            this.#renderVisibleItems();
        }
    }

    /**
     * 销毁组件
     *
     * 清理内部状态，断开连接后由 Web Components 自动回收 DOM
     *
     * @public
     */
    destroy() {
        this.#items = [];
        this.#uncheckedValues.clear();
        this.#onToggle = null;
        this.#renderZone = null;
        this.#eventsBound = false;

        if (this.isConnected) {
            this.remove();
        }
    }

    /**
     * 绑定事件监听器
     *
     * - 滚动事件：触发可见区域重新渲染
     * - 点击事件：切换勾选状态
     *
     * @private
     */
    #bindEvents() {
        if (!this.#renderZone || this.#eventsBound) return;

        this.addEventListener(EVENT_NAMES.SCROLL, this.#handleScroll);
        this.#renderZone.addEventListener(EVENT_NAMES.CLICK, this.#handleRenderZoneClick);
        this.#eventsBound = true;
    }

    /**
     * 处理滚动事件
     *
     * @param {Event} e - 滚动事件
     * @private
     */
    #handleScroll = (e) => {
        this.#scrollTop = e.target?.scrollTop || 0;
        this.#renderVisibleItems();
    };

    /**
     * 处理渲染区域点击事件
     *
     * 切换对应项的勾选状态
     *
     * @param {Event} e - 点击事件
     * @private
     */
    #handleRenderZoneClick = (e) => {
        const valueItem = e.target.closest(".virtual-item");
        if (!valueItem) return;

        const key = valueItem.dataset.value;
        const checkbox = valueItem.querySelector('input[type="checkbox"]');

        if (e.target === checkbox) {
            if (checkbox.checked) {
                this.#uncheckedValues.delete(key);
            } else {
                this.#uncheckedValues.add(key);
            }
            this.#onToggle?.(key, !this.#uncheckedValues.has(key));
        } else {
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) {
                this.#uncheckedValues.delete(key);
            } else {
                this.#uncheckedValues.add(key);
            }
            this.#onToggle?.(key, checkbox.checked);
        }
    };

    /**
     * 渲染可见区域的列表项
     *
     * 根据当前滚动位置计算可见范围，只渲染该范围内的项。
     * 可见范围 = [startIndex, startIndex + visibleCount + 2]（含缓冲）
     *
     * @private
     */
    #renderVisibleItems() {
        if (!this.#renderZone) return;

        try {
            const container = this.shadowRoot.querySelector(".virtual-container");
            if (container) {
                container.style.height = `${this.#items.length * this.#itemHeight}px`;
            }

            const startIndex = Math.floor(this.#scrollTop / this.#itemHeight);
            const endIndex = Math.min(startIndex + this.#visibleCount + 2, this.#items.length);

            let html = "";

            for (let i = startIndex; i < endIndex; i++) {
                const value = this.#items[i];
                const isBlank = value === NullValueHandler.NULL_KEY;
                const checked = !this.#uncheckedValues.has(value);
                const top = i * this.#itemHeight;

                if (isBlank) {
                    html += `
                        <div class="virtual-item virtual-blank-item" style="top: ${top}px;" data-value="${value}">
                            <input type="checkbox" ${checked ? "checked" : ""}>
                            <span>${NullValueHandler.BLANK_DISPLAY}</span>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="virtual-item" style="top: ${top}px;" data-value="${this.#escapeHtml(value)}">
                            <input type="checkbox" ${checked ? "checked" : ""}>
                            <span>${this.#escapeHtml(value)}</span>
                        </div>
                    `;
                }
            }

            this.#renderZone.innerHTML = html;
        } catch (error) {
            errorHandler.error(ERROR_CODE.FILTER_VIRTUAL_LIST_RENDER_ERROR, "渲染虚拟列表失败", { originalError: error });
        }
    }

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

customElements.define("virtual-value-list", VirtualValueList);
