import { WebComponent } from "@/core/WebComponent";
import { SHEET_TAB_EVENTS } from "./SheetTabEvents.js";
import { EVENT_NAMES } from "@/constants/eventNames";

const CONTEXT_MENU_ITEMS = [
    { action: "rename", label: "重命名" },
    { action: "delete", label: "删除" },
    { action: "copy", label: "复制" },
    { action: "hide", label: "隐藏" },
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

        .context-menu {
            position: fixed;
            background: #fff;
            border: 1px solid #d0d0d0;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            padding: 4px 0;
            z-index: 10000;
            min-width: 120px;
            font-size: 12px;
        }

        .context-menu-item {
            padding: 6px 16px;
            cursor: pointer;
            color: #333;
            white-space: nowrap;
        }

        .context-menu-item:hover {
            background: #e8f5e9;
            color: #217346;
        }

        .context-menu-item.danger {
            color: #c62828;
        }

        .context-menu-item.danger:hover {
            background: #fbe9e7;
            color: #c62828;
        }

        .context-menu-item.disabled {
            color: #bbb;
            cursor: default;
        }

        .context-menu-item.disabled:hover {
            background: transparent;
            color: #bbb;
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
    static get observedAttributes() {
        return [];
    }

    #renaming = false;
    #tabs = new Map();
    #renameInput = null;
    #renameHandleMousedown = null;
    #renameHandleKeydown = null;
    #renameHandleBlur = null;
    #currentSheets = null;
    #currentActiveName = null;
    #contextMenuEl = null;
    #contextTargetName = null;

    onConnect(disposable) {
        const prevBtn = this.shadowRoot.querySelector(".nav-btn.prev");
        const nextBtn = this.shadowRoot.querySelector(".nav-btn.next");
        const addBtnInScroll = this.shadowRoot.querySelector(".add-btn.in-scroll");
        const tabsContainer = this.shadowRoot.querySelector(".tabs");

        disposable.trackEvent(prevBtn, EVENT_NAMES.CLICK, () => {
            this.#scrollBy(-120);
        });

        disposable.trackEvent(nextBtn, EVENT_NAMES.CLICK, () => {
            this.#scrollBy(120);
        });

        disposable.trackEvent(addBtnInScroll, EVENT_NAMES.CLICK, () => {
            this.emit(SHEET_TAB_EVENTS.ADD);
        });

        disposable.trackEvent(tabsContainer, EVENT_NAMES.CLICK, (e) => {
            if (this.#renaming) return;
            const tab = e.target.closest(".tab");
            if (!tab) return;
            this.emit(SHEET_TAB_EVENTS.SWITCH, { name: tab.dataset.name });
        });

        disposable.trackEvent(tabsContainer, EVENT_NAMES.DBLCLICK, (e) => {
            if (this.#renaming) return;
            const tab = e.target.closest(".tab");
            if (!tab) return;
            this.#startRename(tab);
        });

        disposable.trackEvent(tabsContainer, EVENT_NAMES.CONTEXTMENU, (e) => {
            e.preventDefault();
            e.stopPropagation();
            const tab = e.target.closest(".tab");
            if (!tab) return;
            this.emit(SHEET_TAB_EVENTS.SWITCH, { name: tab.dataset.name });
            this.#showContextMenu(tab, e.clientX, e.clientY);
        });

        disposable.trackEvent(document, EVENT_NAMES.CLICK, (e) => {
            if (this.#contextMenuEl && !e.composedPath().includes(this.#contextMenuEl)) {
                this.#hideContextMenu();
            }
        });

        disposable.trackEvent(document, EVENT_NAMES.KEYDOWN, (e) => {
            if (e.key === "Escape" && this.#contextMenuEl) {
                this.#hideContextMenu();
            }
        });
    }

    render() {
        if (!this.shadowRoot.querySelector(".tabs")) {
            this.shadowRoot.appendChild(template.content.cloneNode(true));
        }
    }

    #scrollBy(delta) {
        const scrollWrap = this.shadowRoot?.querySelector(".tabs-scroll");
        if (scrollWrap) {
            scrollWrap.scrollLeft += delta;
        }
    }

    scrollToTab(sheetName) {
        const tab = this.#tabs.get(sheetName);
        if (!tab) return;

        const scrollWrap = this.shadowRoot.querySelector(".tabs-scroll");
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

    refresh(sheets, activeName) {
        if (this.isDestroyed) return;

        this.#currentSheets = sheets;
        this.#currentActiveName = activeName;
        this.#cleanupRename();

        const tabsContainer = this.shadowRoot.querySelector(".tabs");
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

        const scrollWrap = this.shadowRoot.querySelector(".tabs-scroll");
        if (scrollWrap) {
            scrollWrap.scrollLeft = 0;
        }
    }

    #showContextMenu(tab, clientX, clientY) {
        this.#hideContextMenu();

        this.#contextTargetName = tab.dataset.name;
        const menu = document.createElement("div");
        menu.className = "context-menu";

        const sheetCount = this.#currentSheets ? this.#currentSheets.size : 1;

        for (const item of CONTEXT_MENU_ITEMS) {
            const menuItem = document.createElement("div");
            menuItem.className = "context-menu-item";
            menuItem.textContent = item.label;
            menuItem.dataset.action = item.action;

            if (item.action === "delete" && sheetCount <= 1) {
                menuItem.classList.add("disabled");
            } else if (item.action === "delete") {
                menuItem.classList.add("danger");
            }

            if (!menuItem.classList.contains("disabled")) {
                menuItem.addEventListener(EVENT_NAMES.CLICK, () => {
                    this.#handleContextAction(item.action);
                });
            }

            menu.appendChild(menuItem);
        }

        this.shadowRoot.appendChild(menu);
        this.#contextMenuEl = menu;

        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;
        const vpWidth = window.innerWidth;
        const vpHeight = window.innerHeight;

        let left = clientX;
        let top = clientY;

        if (left + menuWidth > vpWidth) {
            left = vpWidth - menuWidth - 4;
        }
        if (left < 0) {
            left = 4;
        }
        if (top + menuHeight > vpHeight) {
            top = clientY - menuHeight;
        }
        if (top < 0) {
            top = 4;
        }

        menu.style.left = left + "px";
        menu.style.top = top + "px";
    }

    #hideContextMenu() {
        if (this.#contextMenuEl) {
            this.#contextMenuEl.remove();
            this.#contextMenuEl = null;
        }
        this.#contextTargetName = null;
    }

    #handleContextAction(action) {
        const name = this.#contextTargetName;
        this.#hideContextMenu();

        if (!name) return;

        switch (action) {
            case "delete":
                this.emit(SHEET_TAB_EVENTS.CLOSE, { name });
                break;
            case "rename":
                if (!this.#renaming) {
                    const tab = this.#tabs.get(name);
                    if (tab) this.#startRename(tab);
                }
                break;
            case "copy":
                this.emit(SHEET_TAB_EVENTS.COPY, { name });
                break;
            case "hide":
                this.emit(SHEET_TAB_EVENTS.HIDE, { name });
                break;
        }
    }

    #startRename(tabElement) {
        const oldName = tabElement.dataset.name;
        this.#cleanupRename();
        this.#hideContextMenu();
        this.#renaming = true;

        const tabOriginalWidth = tabElement.offsetWidth;

        const input = document.createElement("input");
        input.className = "rename-input";
        input.value = oldName;
        this.#renameInput = input;

        let committed = false;

        const commit = () => {
            if (committed) return;
            committed = true;
            this.#renaming = false;

            const newName = input.value.trim();
            this.#cleanupRename();
            if (newName && newName !== oldName) {
                this.emit(SHEET_TAB_EVENTS.RENAME, { oldName, newName });
            } else {
                this.refresh(this.#currentSheets, this.#currentActiveName);
            }
        };

        this.#renameHandleMousedown = (e) => {
            e.stopPropagation();
        };

        this.#renameHandleKeydown = (e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
                e.preventDefault();
                input.blur();
            } else if (e.key === "Escape") {
                e.preventDefault();
                committed = true;
                this.#renaming = false;
                this.#cleanupRename();
                this.refresh(this.#currentSheets, this.#currentActiveName);
            }
        };

        this.#renameHandleBlur = commit;

        input.addEventListener(EVENT_NAMES.MOUSEDOWN, this.#renameHandleMousedown);
        input.addEventListener(EVENT_NAMES.KEYDOWN, this.#renameHandleKeydown);
        input.addEventListener(EVENT_NAMES.BLUR, this.#renameHandleBlur);

        const label = tabElement.querySelector(".label");
        if (label) {
            label.style.display = "none";
            tabElement.appendChild(input);
        }

        input.focus();
        input.select();

        this.#syncInputWidth(input, tabOriginalWidth);
        input.addEventListener(EVENT_NAMES.INPUT, () => this.#syncInputWidth(input, tabOriginalWidth));
    }

    #syncInputWidth(input, minWidth) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const computedStyle = getComputedStyle(input);
        ctx.font = `${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`;
        const textWidth = ctx.measureText(input.value || input.placeholder).width;
        const newWidth = Math.max(minWidth, textWidth + 16);
        input.style.width = newWidth + "px";
    }

    #cleanupRename() {
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
                const tabElement = this.#renameInput.closest(".tab");
                if (tabElement) {
                    const label = tabElement.querySelector(".label");
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

    onDisconnect() {
        this.#tabs.clear();
        this.#cleanupRename();
        this.#hideContextMenu();
        this.#currentSheets = null;
        this.#currentActiveName = null;
    }
}

customElements.define("sheet-tab-bar", SheetTabBarElement);
