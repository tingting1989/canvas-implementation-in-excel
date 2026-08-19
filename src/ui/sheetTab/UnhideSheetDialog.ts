import { EVENT_NAMES } from "../../constants/eventNames.js";
import { PopupPanel } from "../components/PopupPanel.js";
import { PopupManager } from "../components/PopupManager.js";

interface UnhideDialogCallbacks {
    onConfirm: (selectedSheets: string[]) => void;
    onCancel: () => void;
}

const template = document.createElement("template");
template.innerHTML = `
<style>
  :host {
    display: block;
  }

  .dialog-content {
    padding: 16px;
    min-width: 320px;
    max-width: 400px;
  }

  .dialog-title {
    font-size: 13px;
    font-weight: 600;
    color: #333;
    margin-bottom: 12px;
  }

  .sheet-list {
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
    background: #fff;
  }

  .sheet-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    user-select: none;
    transition: background-color 0.15s;
    border-bottom: 1px solid #f0f0f0;
  }

  .sheet-item:last-child {
    border-bottom: none;
  }

  .sheet-item:hover {
    background: #f5f5f5;
  }

  .sheet-item.selected {
    background: #e6f7ff;
  }

  .sheet-checkbox {
    width: 16px;
    height: 16px;
    margin-right: 8px;
    cursor: pointer;
    accent-color: #1890ff;
  }

  .sheet-name {
    font-size: 12px;
    color: #333;
    flex: 1;
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #e5e6eb;
  }

  .btn {
    padding: 6px 20px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    border: 1px solid #d9d9d9;
    background: #fff;
    color: #333;
    transition: all 0.2s;
  }

  .btn:hover {
    border-color: #40a9ff;
    color: #40a9ff;
  }

  .btn-primary {
    background: #1890ff;
    border-color: #1890ff;
    color: #fff;
  }

  .btn-primary:hover {
    background: #40a9ff;
    border-color: #40a9ff;
    color: #fff;
  }

  .btn-primary:disabled {
    background: #d9d9d9;
    border-color: #d9d9d9;
    color: rgba(0, 0, 0, 0.25);
    cursor: not-allowed;
  }
</style>
<div class="dialog-content">
  <div class="dialog-title">取消隐藏工作表</div>
  <div class="sheet-list"></div>
  <div class="dialog-footer">
    <button class="btn btn-primary btn-confirm" disabled>确定</button>
    <button class="btn btn-cancel">取消</button>
  </div>
</div>
`;

export class UnhideSheetDialog extends HTMLElement {
    #callbacks: UnhideDialogCallbacks | null = null;
    #contentEl: HTMLElement | null = null;
    #sheetListEl: HTMLElement | null = null;
    #confirmBtn: HTMLButtonElement | null = null;
    #cancelBtn: HTMLButtonElement | null = null;
    #selectedSheets: Set<string> = new Set();
    #popupId: symbol | null = null;
    #popupPanel: InstanceType<typeof PopupPanel> | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot!.appendChild(template.content.cloneNode(true));

        this.#contentEl = this.shadowRoot!.querySelector(".dialog-content");
        this.#sheetListEl = this.shadowRoot!.querySelector(".sheet-list");
        this.#confirmBtn = this.shadowRoot!.querySelector(".btn-confirm") as HTMLButtonElement;
        this.#cancelBtn = this.shadowRoot!.querySelector(".btn-cancel") as HTMLButtonElement;

        this.#bindEvents();
    }

    #bindEvents(): void {
        if (!this.#confirmBtn || !this.#cancelBtn || !this.#sheetListEl) return;

        this.#confirmBtn.addEventListener(EVENT_NAMES.CLICK, () => {
            if (this.#callbacks?.onConfirm) {
                this.#callbacks.onConfirm([...this.#selectedSheets]);
            }
            this.close();
        });

        this.#cancelBtn.addEventListener(EVENT_NAMES.CLICK, () => {
            if (this.#callbacks?.onCancel) {
                this.#callbacks.onCancel();
            }
            this.close();
        });

        this.#sheetListEl.addEventListener("click", (e: Event) => {
            const target = e.target as HTMLElement;
            const item = target.closest(".sheet-item") as HTMLElement | null;
            if (!item) return;

            const sheetName = item.dataset.name!;
            const checkbox = item.querySelector(".sheet-checkbox") as HTMLInputElement;

            if (this.#selectedSheets.has(sheetName)) {
                this.#selectedSheets.delete(sheetName);
                item.classList.remove("selected");
                checkbox.checked = false;
            } else {
                this.#selectedSheets.add(sheetName);
                item.classList.add("selected");
                checkbox.checked = true;
            }

            this.#updateConfirmButtonState();
        });
    }

    #updateConfirmButtonState(): void {
        if (this.#confirmBtn) {
            this.#confirmBtn.disabled = this.#selectedSheets.size === 0;
        }
    }

    open(hiddenSheets: string[], callbacks: UnhideDialogCallbacks): void {
        this.#callbacks = callbacks;
        this.#selectedSheets.clear();

        this.#renderSheetList(hiddenSheets);

        this.#popupPanel = new PopupPanel();
        this.#popupId = PopupManager.getInstance().register(this.#popupPanel);

        this.#popupPanel.show({
            content: this,
            title: "取消隐藏",
            draggable: true,
            mask: true,
            closeOnEscape: true,
            showHeader: true,
            closeOnClickOutside: false,
            zIndex: 10003,
            onClose: (reason: string) => {
                if (reason === "close-btn" || reason === "escape") {
                    if (this.#callbacks?.onCancel) {
                        this.#callbacks.onCancel();
                    }
                }
                if (this.#popupId) {
                    try {
                        PopupManager.getInstance().unregister(this.#popupId);
                    } catch {}
                    this.#popupId = null;
                }
                this.#popupPanel = null;
            },
        });

        requestAnimationFrame(() => {
            const panelEl = this.#popupPanel?._panel;
            if (!panelEl) return;

            const panelWidth = panelEl.offsetWidth || 360;
            const panelHeight = panelEl.offsetHeight || 350;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            const centerX = Math.max(4, (viewportWidth - panelWidth) / 2);
            const centerY = Math.max(4, (viewportHeight - panelHeight) / 2);

            panelEl.style.left = `${centerX}px`;
            panelEl.style.top = `${centerY}px`;
        });
    }

    close(): void {
        if (this.#popupPanel) {
            this.#popupPanel.hide("user");
            if (this.#popupId) {
                try {
                    PopupManager.getInstance().unregister(this.#popupId);
                } catch {}
                this.#popupId = null;
            }
            this.#popupPanel = null;
        }
    }

    #renderSheetList(sheetNames: string[]): void {
        if (!this.#sheetListEl) return;

        this.#sheetListEl.innerHTML = "";

        for (const name of sheetNames) {
            const item = document.createElement("div");
            item.className = "sheet-item";
            item.dataset.name = name;

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "sheet-checkbox";

            const label = document.createElement("span");
            label.className = "sheet-name";
            label.textContent = name;

            item.appendChild(checkbox);
            item.appendChild(label);
            this.#sheetListEl!.appendChild(item);
        }

        this.#updateConfirmButtonState();
    }
}

customElements.define("unhide-sheet-dialog", UnhideSheetDialog);

declare global {
    interface HTMLElementTagNameMap {
        "unhide-sheet-dialog": UnhideSheetDialog;
    }
}
