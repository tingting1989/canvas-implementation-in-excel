export interface MenuItemData {
    key: string;
    label: string;
    icon?: string;
    html?: string;
    render?: (el: HTMLElement) => void;
    disabled?: boolean;
}

interface ContextMenuDropdownCallbacks {
    onItemSelect: (key: string) => void;
    onClose: () => void;
}

interface RenderOptions {
    width?: number;
    maxHeight?: number;
}

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host {
        display: block;
    }
    .ctx-menu-content {
        background: #fff;
        border-radius: 6px;
        padding: 4px 0;
        min-width: 180px;
        max-height: 400px;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        user-select: none;
    }
    .ctx-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 16px;
        cursor: pointer;
        color: #333;
    }
    .ctx-item:hover {
        background: #f0f4ff;
    }
    .ctx-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
    }
    .ctx-label {
        flex: 1;
        white-space: nowrap;
    }
    .ctx-item.disabled {
        opacity: 0.45;
        cursor: not-allowed;
        pointer-events: none;
    }
    .ctx-separator {
        height: 1px;
        background: #e0e0e0;
        margin: 4px 8px;
    }
</style>
<div class="ctx-menu-content"></div>
`;

export class ContextMenuDropdown extends HTMLElement {
    #callbacks: ContextMenuDropdownCallbacks | null = null;
    #contentEl: HTMLElement | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot!.appendChild(template.content.cloneNode(true));
        this.#contentEl = this.shadowRoot!.querySelector(".ctx-menu-content");

        this.#contentEl!.addEventListener("click", (e: Event) => {
            const target = e.target as HTMLElement;
            const el = target.closest(".ctx-item") as HTMLElement | null;
            if (!el || !this.#callbacks?.onItemSelect) return;
            this.#callbacks.onItemSelect(el.dataset.key!);
        });
    }

    initCallbacks(callbacks: ContextMenuDropdownCallbacks): void {
        this.#callbacks = callbacks;
    }

    renderItems(items: (MenuItemData | null)[], options: RenderOptions = {}): void {
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
                sep.className = "ctx-separator";
                this.#contentEl.appendChild(sep);
            } else {
                const el = document.createElement("div");
                el.className = "ctx-item";
                if (item.disabled) el.classList.add("disabled");
                el.dataset.key = item.key;

                if (item.render) {
                    item.render(el);
                } else if (item.html) {
                    el.innerHTML = item.html;
                } else {
                    if (item.icon) {
                        const iconEl = document.createElement("span");
                        iconEl.className = "ctx-icon";
                        iconEl.innerHTML = item.icon;
                        el.appendChild(iconEl);
                    }
                    const labelEl = document.createElement("span");
                    labelEl.className = "ctx-label";
                    labelEl.textContent = item.label;
                    el.appendChild(labelEl);
                }

                this.#contentEl.appendChild(el);
            }
        }
    }
}

customElements.define("context-menu-dropdown", ContextMenuDropdown);

declare global {
    interface HTMLElementTagNameMap {
        "context-menu-dropdown": ContextMenuDropdown;
    }
}
