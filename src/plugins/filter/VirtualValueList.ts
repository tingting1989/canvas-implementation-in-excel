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
 * @extends HTMLElement
 * @module plugins/filter/VirtualValueList
 */
export class VirtualValueList extends HTMLElement {
    /** @private 私有字段 - 所有可选值列表 */
    #items: string[] = [];

    /** @private 私有字段 - 未勾选的值集合 */
    #uncheckedValues: Set<string> = new Set();

    /** @private 私有字段 - 值切换时的回调函数 */
    #onToggle: ((value: string, checked: boolean) => void) | null = null;

    /** @private 私有字段 - 单项高度（px） */
    #itemHeight: number = 28;

    /** @private 私有字段 - 可见项数量 */
    #visibleCount: number = 10;

    /** @private 私有字段 - 当前滚动位置 */
    #scrollTop: number = 0;

    /** @private 私有字段 - 渲染区域 DOM 引用 */
    #renderZone: HTMLElement | null = null;

    /** @private 私有字段 - 数据是否已就绪（init 已调用） */
    #dataReady: boolean = false;

    /** @private 私有字段 - 事件是否已绑定 */
    #eventsBound: boolean = false;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot!.appendChild(template.content.cloneNode(true));
    }

    /** Web Component 生命周期 - 元素挂载到 DOM 时调用 */
    connectedCallback(): void {
        this.#renderZone = this.shadowRoot!.querySelector(".virtual-render-zone");
        this.#bindEvents();

        if (this.#dataReady) {
            this.#renderVisibleItems();
        }
    }

    /** Web Component 生命周期 - 元素从 DOM 移除时调用 */
    disconnectedCallback(): void {
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
     * @param items - 所有可选值列表
     * @param uncheckedValues - 未勾选的值集合
     * @param onToggle - 值切换时的回调函数
     */
    init(items: string[], uncheckedValues: Set<string>, onToggle: (value: string, checked: boolean) => void): void {
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
     * @param items - 新值列表
     * @param uncheckedValues - 未勾选的值集合
     */
    updateItems(items: string[], uncheckedValues: Set<string>): void {
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
     */
    destroy(): void {
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
     * @private 私有方法 - 绑定事件监听器
     *
     * - 滚动事件：触发可见区域重新渲染
     * - 点击事件：切换勾选状态
     */
    #bindEvents(): void {
        if (!this.#renderZone || this.#eventsBound) return;

        this.addEventListener(EVENT_NAMES.SCROLL, this.#handleScroll);
        this.#renderZone.addEventListener(EVENT_NAMES.CLICK, this.#handleRenderZoneClick);
        this.#eventsBound = true;
    }

    /**
     * @private 私有方法 - 处理滚动事件
     */
    #handleScroll = (e: Event): void => {
        this.#scrollTop = (e.target as HTMLElement)?.scrollTop || 0;
        this.#renderVisibleItems();
    };

    /**
     * @private 私有方法 - 处理渲染区域点击事件
     *
     * 切换对应项的勾选状态
     */
    #handleRenderZoneClick = (e: Event): void => {
        const target = e.target as HTMLElement;
        const valueItem = target.closest(".virtual-item") as HTMLElement | null;
        if (!valueItem) return;

        const key = valueItem.dataset.value!;
        const checkbox = valueItem.querySelector<HTMLInputElement>('input[type="checkbox"]');

        if (target === checkbox) {
            if (checkbox!.checked) {
                this.#uncheckedValues.delete(key);
            } else {
                this.#uncheckedValues.add(key);
            }
            this.#onToggle?.(key, !this.#uncheckedValues.has(key));
        } else {
            checkbox!.checked = !checkbox!.checked;
            if (checkbox!.checked) {
                this.#uncheckedValues.delete(key);
            } else {
                this.#uncheckedValues.add(key);
            }
            this.#onToggle?.(key, checkbox!.checked);
        }
    };

    /**
     * @private 私有方法 - 渲染可见区域的列表项
     *
     * 根据当前滚动位置计算可见范围，只渲染该范围内的项。
     * 可见范围 = [startIndex, startIndex + visibleCount + 2]（含缓冲）
     */
    #renderVisibleItems(): void {
        if (!this.#renderZone) return;

        try {
            const container = this.shadowRoot!.querySelector(".virtual-container") as HTMLElement | null;
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
     * @private 私有方法 - HTML 转义
     *
     * 将特殊 HTML 字符转换为实体表示，防止 XSS
     *
     * @param text - 待转义的文本
     * @returns 转义后的安全文本
     */
    #escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
}

customElements.define("virtual-value-list", VirtualValueList);
