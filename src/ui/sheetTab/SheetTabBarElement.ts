import { WebComponent } from "../../core/WebComponent.js";
import { SHEET_TAB_EVENTS } from "./sheetTabEvents.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";
import { SheetTabUIManager } from "./SheetTabUIManager.js";
import type { SheetTabMenuItemData } from "./SheetTabDropdown.js";
import { UnhideSheetDialog } from "./UnhideSheetDialog.js";

interface ContextMenuItem {
    action: string;
    label: string;
}

const CONTEXT_MENU_ITEMS: ContextMenuItem[] = [
    { action: "rename", label: "重命名" },
    { action: "delete", label: "删除" },
    { action: "copy", label: "复制" },
    { action: "hide", label: "隐藏" },
    { action: "unhide", label: "取消隐藏..." },
];

const template = document.createElement("template");
template.innerHTML = `
    <style>
        :host {
            display: flex;
            align-items: stretch;
            height: 28px;
            background: #e7e7e7;
            user-select: none;
            font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
            position: relative;
        }

        .nav-group {
            display: flex;
            flex-shrink: 0;
            border-right: 1px solid #c6c6c6;
        }

        .nav-btn {
            width: 24px;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: #555;
            font-size: 12px;
        }

        .nav-btn:hover {
            background: #d8d8d8;
            color: #217346;
        }

        .nav-btn.prev {
            border-right: 1px solid #c6c6c6;
        }

        .nav-btn svg {
            width: 12px;
            height: 12px;
        }

        .tabs-scroll {
            flex: 1;
            overflow-x: auto;
            overflow-y: hidden;
            height: 100%;
            position: relative;
            display: flex;
            align-items: stretch;
            min-width: 0;
            scrollbar-width: none;
        }

        .tabs-scroll::-webkit-scrollbar {
            display: none;
        }

        .tabs {
            display: flex;
            align-items: stretch;
            height: 100%;
            white-space: nowrap;
            flex-shrink: 0;
        }

        .tab {
            display: inline-flex;
            align-items: center;
            padding: 0 12px;
            height: 100%;
            font-size: 11px;
            color: #444;
            cursor: pointer;
            background: transparent;
            position: relative;
            flex-shrink: 0;
            user-select: none;
        }

        .tab + .tab::before {
            content: "";
            position: absolute;
            left: 0;
            top: 5px;
            bottom: 5px;
            width: 1px;
            background: #c6c6c6;
        }

        .tab:hover {
            background: #e2f0da;
            color: #217346;
        }

        .tab.active {
            background: #fff;
            color: #217346;
            font-weight: 600;
        }

        .tab.active:hover {
            background: #fff;
            color: #217346;
        }

        .tab.active + .tab::before,
        .tab + .tab.active::before {
            display: none;
        }

        .tab .label {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 150px;
            line-height: 1;
        }

        .rename-input {
            border: none;
            outline: none;
            background: transparent;
            font: inherit;
            color: #217346;
            padding: 0;
            min-width: 40px;
            box-sizing: border-box;
        }

        .add-btn.in-scroll {
            position: sticky;
            right: 0;
            width: 28px;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            color: #444;
            cursor: pointer;
            flex-shrink: 0;
            background: #e7e7e7;
            border-left: 1px solid #c6c6c6;
        }

        .add-btn.in-scroll:hover {
            background: #d8d8d8;
            color: #217346;
        }
    </style>
    <div class="nav-group">
        <div class="nav-btn prev">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="8,2 4,6 8,10"></polyline>
            </svg>
        </div>
        <div class="nav-btn next">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4,2 8,6 4,10"></polyline>
            </svg>
        </div>
    </div>
    <div class="tabs-scroll">
        <div class="tabs"></div>
        <div class="add-btn in-scroll">+</div>
    </div>
`;

export class SheetTabBarElement extends WebComponent {
    static get observedAttributes(): string[] {
        return [];
    }

    #renaming: boolean = false;
    #tabs: Map<string, HTMLDivElement> = new Map();
    #renameInput: HTMLInputElement | null = null;
    #renameHandleMousedown: ((e: MouseEvent) => void) | null = null;
    #renameHandleKeydown: ((e: KeyboardEvent) => void) | null = null;
    #renameHandleBlur: (() => void) | null = null;
    #currentSheets: Map<string, any> | null = null;
    #currentActiveName: string | null = null;
    #hiddenSheets: string[] = [];
    #contextTargetName: string | null = null;
    #readOnly: boolean = false;
    #uiManager: SheetTabUIManager = new SheetTabUIManager();

    get readOnly(): boolean {
        return this.#readOnly;
    }

    set readOnly(v: boolean) {
        this.#readOnly = !!v;
        const addBtn = this.shadowRoot?.querySelector(".add-btn.in-scroll") as HTMLElement | null;
        if (addBtn) {
            addBtn.style.display = this.#readOnly ? "none" : "";
        }
    }

    onConnect(disposable: import("../../core/Disposable.js").Disposable): void {
        const prevBtn = this.shadowRoot!.querySelector(".nav-btn.prev") as HTMLElement;
        const nextBtn = this.shadowRoot!.querySelector(".nav-btn.next") as HTMLElement;
        const addBtnInScroll = this.shadowRoot!.querySelector(".add-btn.in-scroll") as HTMLElement;
        const tabsContainer = this.shadowRoot!.querySelector(".tabs") as HTMLElement;

        disposable.trackEvent(prevBtn, EVENT_NAMES.CLICK, () => {
            this.#scrollBy(-120);
        });

        disposable.trackEvent(nextBtn, EVENT_NAMES.CLICK, () => {
            this.#scrollBy(120);
        });

        disposable.trackEvent(addBtnInScroll, EVENT_NAMES.CLICK, () => {
            this.emit(SHEET_TAB_EVENTS.ADD);
        });

        disposable.trackEvent(tabsContainer, EVENT_NAMES.CLICK, (e: Event) => {
            if (this.#renaming) return;
            const tab = (e.target as HTMLElement).closest(".tab") as HTMLElement | null;
            if (!tab) return;
            this.emit(SHEET_TAB_EVENTS.SWITCH, { name: tab.dataset.name });
        });

        disposable.trackEvent(tabsContainer, EVENT_NAMES.DBLCLICK, (e: Event) => {
            if (this.#renaming || this.#readOnly) return;
            const tab = (e.target as HTMLElement).closest(".tab") as HTMLElement | null;
            if (!tab) return;
            this.#startRename(tab);
        });

        disposable.trackEvent(tabsContainer, EVENT_NAMES.CONTEXTMENU, (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            const tab = (e.target as HTMLElement).closest(".tab") as HTMLElement | null;
            if (!tab || this.#readOnly) return;
            this.emit(SHEET_TAB_EVENTS.SWITCH, { name: tab.dataset.name });
            this.#showContextMenu(tab, (e as MouseEvent).clientX, (e as MouseEvent).clientY);
        });
    }

    render(): void {
        if (!this.shadowRoot!.querySelector(".tabs")) {
            this.shadowRoot!.appendChild(template.content.cloneNode(true));
        }
    }

    #scrollBy(delta: number): void {
        const scrollWrap = this.shadowRoot?.querySelector(".tabs-scroll") as HTMLElement | null;
        if (scrollWrap) {
            scrollWrap.scrollLeft += delta;
        }
    }

    scrollToTab(sheetName: string): void {
        const tab = this.#tabs.get(sheetName);
        if (!tab) return;

        const scrollWrap = this.shadowRoot!.querySelector(".tabs-scroll") as HTMLElement;
        const tabLeft = tab.offsetLeft;
        const tabWidth = tab.offsetWidth;
        const viewW = scrollWrap.clientWidth;
        const scrollLeft = scrollWrap.scrollLeft;

        if (tabLeft < scrollLeft) {
            scrollWrap.scrollLeft = tabLeft;
        } else if (tabLeft + tabWidth > scrollLeft + viewW) {
            scrollWrap.scrollLeft = tabLeft + tabWidth - viewW;
        }
    }

    refresh(sheets: Map<string, any>, activeName: string, hiddenSheets: string[] = []): void {
        if (this.isDestroyed) return;

        this.#currentSheets = sheets;
        this.#currentActiveName = activeName;
        this.#hiddenSheets = hiddenSheets;
        this.#cleanupRename();

        const tabsContainer = this.shadowRoot!.querySelector(".tabs") as HTMLElement | null;
        if (!tabsContainer) return;

        tabsContainer.innerHTML = "";
        this.#tabs.clear();

        for (const [name] of sheets) {
            const tab = document.createElement("div");
            tab.className = "tab";
            tab.dataset.name = name;
            if (name === activeName) tab.classList.add("active");

            const label = document.createElement("span");
            label.className = "label";
            label.textContent = name;
            tab.appendChild(label);

            tabsContainer.appendChild(tab);
            this.#tabs.set(name, tab);
        }

        const scrollWrap = this.shadowRoot!.querySelector(".tabs-scroll") as HTMLElement | null;
        if (scrollWrap) {
            scrollWrap.scrollLeft = 0;
        }
    }

    #buildContextMenuItems(): (SheetTabMenuItemData | null)[] {
        const items: (SheetTabMenuItemData | null)[] = [];
        const sheetCount = this.#currentSheets ? this.#currentSheets.size : 1;
        const hasHiddenSheets = this.#hiddenSheets.length > 0;

        for (const item of CONTEXT_MENU_ITEMS) {
            if (item === null) {
                items.push(null);
                continue;
            }

            const data: SheetTabMenuItemData = {
                key: item.action,
                label: item.label,
            };

            if (item.action === "delete") {
                if (sheetCount <= 1) {
                    data.disabled = true;
                } else {
                    data.danger = true;
                }
            }

            if (item.action === "unhide") {
                if (!hasHiddenSheets) {
                    data.disabled = true;
                }
            }

            items.push(data);
        }

        return items;
    }

    #showContextMenu(tab: HTMLElement, clientX: number, clientY: number): void {
        this.#uiManager.close();

        this.#contextTargetName = tab.dataset.name ?? null;
        const items = this.#buildContextMenuItems();

        this.#uiManager.open({ x: clientX, y: clientY }, items, (key: string) => this.#handleContextAction(key));
    }

    #handleContextAction(action: string): void {
        const name = this.#contextTargetName;
        this.#uiManager.close();

        if (!name && action !== "unhide") return;

        switch (action) {
            case "delete":
                this.emit(SHEET_TAB_EVENTS.CLOSE, { name });
                break;
            case "rename":
                if (!this.#renaming) {
                    const tab = this.#tabs.get(name!);
                    if (tab) this.#startRename(tab);
                }
                break;
            case "copy":
                this.emit(SHEET_TAB_EVENTS.COPY, { name });
                break;
            case "hide":
                this.emit(SHEET_TAB_EVENTS.HIDE, { name });
                break;
            case "unhide":
                this.#handleUnhideAction();
                break;
        }
    }

    #handleUnhideAction(): void {
        if (this.#hiddenSheets.length === 0) return;

        if (this.#hiddenSheets.length === 1) {
            this.emit(SHEET_TAB_EVENTS.UNHIDE, { name: this.#hiddenSheets[0] });
            return;
        }

        const dialog = document.createElement("unhide-sheet-dialog") as InstanceType<typeof UnhideSheetDialog>;

        dialog.open(this.#hiddenSheets, {
            onConfirm: (selectedSheets: string[]) => {
                for (const name of selectedSheets) {
                    this.emit(SHEET_TAB_EVENTS.UNHIDE, { name });
                }
            },
            onCancel: () => {},
        });
    }

    #startRename(tabElement: HTMLElement): void {
        const oldName = tabElement.dataset.name!;
        this.#cleanupRename();
        this.#uiManager.close();
        this.#renaming = true;

        const tabOriginalWidth = tabElement.offsetWidth;

        const input = document.createElement("input");
        input.className = "rename-input";
        input.value = oldName;
        this.#renameInput = input;

        let committed = false;

        const commit = (): void => {
            if (committed) return;
            committed = true;
            this.#renaming = false;

            const newName = input.value.trim();
            this.#cleanupRename();
            if (newName && newName !== oldName) {
                this.emit(SHEET_TAB_EVENTS.RENAME, { oldName, newName });
            } else {
                this.refresh(this.#currentSheets!, this.#currentActiveName!);
            }
        };

        this.#renameHandleMousedown = (e: MouseEvent) => {
            e.stopPropagation();
        };

        this.#renameHandleKeydown = (e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === "Enter") {
                e.preventDefault();
                input.blur();
            } else if (e.key === "Escape") {
                e.preventDefault();
                committed = true;
                this.#renaming = false;
                this.#cleanupRename();
                this.refresh(this.#currentSheets!, this.#currentActiveName!);
            }
        };

        this.#renameHandleBlur = commit;

        input.addEventListener(EVENT_NAMES.MOUSEDOWN, this.#renameHandleMousedown);
        input.addEventListener(EVENT_NAMES.KEYDOWN, this.#renameHandleKeydown);
        input.addEventListener(EVENT_NAMES.BLUR, this.#renameHandleBlur);

        const label = tabElement.querySelector(".label") as HTMLElement | null;
        if (label) {
            label.style.display = "none";
            tabElement.appendChild(input);
        }

        input.focus();
        input.select();

        this.#syncInputWidth(input, tabOriginalWidth);
        input.addEventListener(EVENT_NAMES.INPUT, () => this.#syncInputWidth(input, tabOriginalWidth));
    }

    #syncInputWidth(input: HTMLInputElement, minWidth: number): void {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        const computedStyle = getComputedStyle(input);
        ctx.font = `${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`;
        const textWidth = ctx.measureText(input.value || input.placeholder).width;
        const newWidth = Math.max(minWidth, textWidth + 16);
        input.style.width = newWidth + "px";
    }

    #cleanupRename(): void {
        if (this.#renameInput) {
            if (this.#renameHandleMousedown) {
                this.#renameInput.removeEventListener(EVENT_NAMES.MOUSEDOWN, this.#renameHandleMousedown);
            }
            if (this.#renameHandleKeydown) {
                this.#renameInput.removeEventListener(EVENT_NAMES.KEYDOWN, this.#renameHandleKeydown);
            }
            if (this.#renameHandleBlur) {
                this.#renameInput.removeEventListener(EVENT_NAMES.BLUR, this.#renameHandleBlur);
            }

            if (this.#renameInput.parentElement) {
                const tabElement = this.#renameInput.closest(".tab") as HTMLElement | null;
                if (tabElement) {
                    const label = tabElement.querySelector(".label") as HTMLElement | null;
                    if (label) {
                        label.style.display = "";
                    }
                }
                this.#renameInput.remove();
            }

            this.#renameInput = null;
        }
        this.#renameHandleMousedown = null;
        this.#renameHandleKeydown = null;
        this.#renameHandleBlur = null;
        this.#renaming = false;
    }

    onDisconnect(): void {
        this.#tabs.clear();
        this.#cleanupRename();
        this.#uiManager.close();
        this.#currentSheets = null;
        this.#currentActiveName = null;
    }
}

customElements.define("sheet-tab-bar", SheetTabBarElement);

declare global {
    interface HTMLElementTagNameMap {
        "sheet-tab-bar": SheetTabBarElement;
    }
}
