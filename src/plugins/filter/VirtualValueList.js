import { WebComponent } from "../../core/WebComponent.js";
import { NullValueHandler } from "./NullValueTypes.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";

export class VirtualValueList extends WebComponent {

    #items = [];
    #uncheckedValues = new Set();
    #onToggle = null;
    #itemHeight = 28;
    #visibleCount = 10;
    #scrollTop = 0;
    #renderZone = null;

    init(items, uncheckedValues, onToggle) {
        this.#items = items;
        this.#uncheckedValues = new Set(uncheckedValues);
        this.#onToggle = onToggle;
    }

    updateItems(items, uncheckedValues) {
        this.#items = items;
        this.#uncheckedValues = new Set(uncheckedValues);
        this.#renderVisibleItems();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    height: ${this.#visibleCount * this.#itemHeight}px;
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
    }

    onConnect(disposable) {
        disposable.trackEvent(this, EVENT_NAMES.SCROLL, this.#handleScroll.bind(this));
        this.#renderVisibleItems();
    }

    onDisconnect() {
        this.#items = [];
        this.#uncheckedValues.clear();
        this.#onToggle = null;
    }

    #handleScroll() {
        this.#scrollTop = this.scrollTop;
        this.#renderVisibleItems();
    }

    #renderVisibleItems() {
        if (!this.#renderZone) return;

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
        this.#bindRenderZoneEvents();
    }

    #bindRenderZoneEvents() {
        if (!this.#renderZone) return;

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
            } else {
                checkbox.checked = !checkbox.checked;
                if (checkbox.checked) {
                    this.#uncheckedValues.delete(key);
                } else {
                    this.#uncheckedValues.add(key);
                }
            }

            this.#onToggle?.(key);
        });
    }
}

customElements.define("virtual-value-list", VirtualValueList);
