export interface SheetTabMenuItemData {
    key: string;
    label: string;
    disabled?: boolean;
    danger?: boolean;
}

interface SheetTabDropdownCallbacks {
    onItemSelect: (key: string) => void;
    onClose: () => void;
}

interface SheetTabRenderOptions {
    width?: number;
    maxHeight?: number;
}

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host {
        display: block;
    }
    .st-menu-content {
        background: #fff;
        border-radius: 6px;
        padding: 4px 0;
        min-width: 120px;
        max-height: 300px;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        user-select: none;
    }
    .st-item {
        display: flex;
        align-items: center;
        padding: 6px 16px;
        cursor: pointer;
        color: #333;
        white-space: nowrap;
    }
    .st-item:hover {
        background: #e8f5e9;
        color: #217346;
    }
    .st-item.danger {
        color: #c62828;
    }
    .st-item.danger:hover {
        background: #fbe9e7;
        color: #c62828;
    }
    .st-item.disabled {
        opacity: 0.45;
        cursor: not-allowed;
        pointer-events: none;
    }
    .st-separator {
        height: 1px;
        background: #e0e0e0;
        margin: 4px 8px;
    }
</style>
<div class="st-menu-content"></div>
`;

export class SheetTabDropdown extends HTMLElement {
    #callbacks: SheetTabDropdownCallbacks | null = null;
    #contentEl: HTMLElement | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot!.appendChild(template.content.cloneNode(true));
        this.#contentEl = this.shadowRoot!.querySelector(".st-menu-content");

        this.#contentEl!.addEventListener("click", (e: Event) => {
            const target = e.target as HTMLElement;
            const el = target.closest(".st-item") as HTMLElement | null;
            if (!el || el.classList.contains("disabled") || !this.#callbacks?.onItemSelect) return;
            this.#callbacks.onItemSelect(el.dataset.key!);
        });
    }

    initCallbacks(callbacks: SheetTabDropdownCallbacks): void {
        this.#callbacks = callbacks;
    }

    renderItems(items: (SheetTabMenuItemData | null)[], options: SheetTabRenderOptions = {}): void {
        if (!this.#contentEl) return;
        this.#contentEl.innerHTML = "";

        if (options.width !== undefined) {
            this.#contentEl.style.minWidth = `${options.width}px`;
        }
        if (options.maxHeight !== undefined) {
            this.#contentEl.style.maxHeight = `${options.maxHeight}px`;
        }

        for (const item of items) {
            if (item === null) {
                const sep = document.createElement("div");
                sep.className = "st-separator";
                this.#contentEl.appendChild(sep);
            } else {
                const el = document.createElement("div");
                el.className = "st-item";
                if (item.disabled) el.classList.add("disabled");
                if (item.danger) el.classList.add("danger");
                el.dataset.key = item.key;
                el.textContent = item.label;
                this.#contentEl.appendChild(el);
            }
        }
    }
}

customElements.define("sheet-tab-dropdown", SheetTabDropdown);

declare global {
    interface HTMLElementTagNameMap {
        "sheet-tab-dropdown": SheetTabDropdown;
    }
}
