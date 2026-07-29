import {WebComponent} from "@/core/WebComponent";
import {EVENT_NAMES} from "@/constants/eventNames";
import {NullValueHandler} from "@/plugins/filter/NullValueTypes";

export class VirtualValueList extends WebComponent {
    #items = [];
    #uncheckedValues = new Set();
    #onToggle = null;
    #itemHeight = 28;
    #visibleCount = 10;
    #scrollTop = 0;
    #renderZone = null;
    #eventsBound = false;  // ← 新增：标记事件是否已绑定

    init(items, uncheckedValues, onToggle) {
        this.#items = items;
        this.#uncheckedValues = new Set(uncheckedValues);
        this.#onToggle = onToggle;
    }

    updateItems(items, uncheckedValues) {
        this.#items = items;
        this.#uncheckedValues = new Set(uncheckedValues);
        this.#scrollTop = 0;
        // 重置滚动位置
        if (this.shadowRoot) {
            this.scrollTop = 0;  // ← 直接设置，因为 this 就是 host element
        }
        this.#renderVisibleItems();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    height: 240px;
                    overflow-y: auto;
                    position: relative;
                }
                .virtual-container {
                    height: ${this.#items.length * this.#itemHeight}px;
                    position: relative;
                }
                .virtual-item {
                    position: absolute;
                    left: 0;
                    right: 0;
                    height: ${this.#itemHeight}px;
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

        this.#renderZone = this.shadowRoot.querySelector(".virtual-render-zone");
        this.#eventsBound = false;  // ← render 后需要重新绑定
        this.#bindRenderZoneEvents();  // ← 只在 render 时绑定一次
    }

    onConnect(disposable) {
        disposable.trackEvent(this, EVENT_NAMES.SCROLL, this.#handleScroll);
        this.#renderVisibleItems();
    }

    onDisconnect() {
        this.#items = [];
        this.#uncheckedValues.clear();
        this.#onToggle = null;
        this.#renderZone = null;
        this.#eventsBound = false;
    }

    #handleScroll(e) {
        this.#scrollTop = e.target?.scrollTop || 0;
        this.#renderVisibleItems();
    }

    #renderVisibleItems() {
        if (!this.#renderZone) return;

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
                    <div class="virtual-item" style="top: ${top}px;" data-value="${this.escapeHtml(value)}">
                        <input type="checkbox" ${checked ? "checked" : ""}>
                        <span>${this.escapeHtml(value)}</span>
                    </div>
                `;
            }
        }

        this.#renderZone.innerHTML = html;
        // ← 注意：不再在这里调用 #bindRenderZoneEvents()
    }

    #bindRenderZoneEvents() {
        if (!this.#renderZone || this.#eventsBound) return;  // ← 防止重复绑定

        this.#renderZone.addEventListener(EVENT_NAMES.CLICK, (e) => {
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
        });

        this.#eventsBound = true;  // ← 标记已绑定
    }
}

customElements.define("virtual-value-list", VirtualValueList);