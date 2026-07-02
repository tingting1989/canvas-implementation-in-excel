import { WebComponent } from "@/core/WebComponent";
import { SHEET_TAB_EVENTS } from "./SheetTabEvents.js";
import { EVENT_NAMES } from "@/constants/eventNames";

export class SheetTabBarElement extends WebComponent {
    static get observedAttributes() {
        return [];
    }

    #scrollOffset = 0;
    #renaming = false;
    #tabs = new Map();
    #renameInput = null;
    #renameHandleMousedown = null;
    #renameHandleKeydown = null;
    #renameHandleBlur = null;
    #currentSheets = null;
    #currentActiveName = null;

    onConnect(disposable) {
        const prevBtn = this.shadowRoot.querySelector(".nav-btn.prev");
        const nextBtn = this.shadowRoot.querySelector(".nav-btn.next");
        const addBtn = this.shadowRoot.querySelector(".add-btn");
        const tabsContainer = this.shadowRoot.querySelector(".tabs");

        disposable.trackEvent(prevBtn, EVENT_NAMES.CLICK, () => {
            this.#scrollBy(-120);
        });

        disposable.trackEvent(nextBtn, EVENT_NAMES.CLICK, () => {
            this.#scrollBy(120);
        });

        disposable.trackEvent(addBtn, EVENT_NAMES.CLICK, () => {
            this.emit(SHEET_TAB_EVENTS.ADD);
        });

        disposable.trackEvent(tabsContainer, EVENT_NAMES.CLICK, (e) => {
            if (this.#renaming) return;
            const closeBtn = e.target.closest(".close-btn");
            const tab = e.target.closest(".tab");
            if (!tab) return;
            const name = tab.dataset.name;
            if (closeBtn) {
                this.emit(SHEET_TAB_EVENTS.CLOSE, { name });
            } else {
                this.emit(SHEET_TAB_EVENTS.SWITCH, { name });
            }
        });

        disposable.trackEvent(tabsContainer, EVENT_NAMES.DBLCLICK, (e) => {
            if (this.#renaming) return;
            const tab = e.target.closest(".tab");
            if (!tab || e.target.closest(".close-btn")) return;
            this.#startRename(tab);
        });
    }

    #styleText = `
        :host {
            display: flex;
            align-items: stretch;
            height: 28px;
            background: #e7e7e7;
            user-select: none;
            font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
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
            overflow: hidden;
            height: 100%;
            position: relative;
        }

        .tabs {
            display: flex;
            align-items: stretch;
            height: 100%;
            white-space: nowrap;
        }

        .tab {
            display: inline-flex;
            align-items: center;
            padding: 0 10px;
            height: 100%;
            font-size: 11px;
            color: #444;
            cursor: pointer;
            background: #e7e7e7;
            position: relative;
            flex-shrink: 0;
            user-select: none;
            border-left: 1px solid transparent;
            border-right: 1px solid transparent;
        }

        .tab:hover {
            background: #d8d8d8;
        }

        .tab.active {
            background: #fff;
            color: #000;
            font-weight: 600;
            border-left: 1px solid #b4b4b4;
            border-right: 1px solid #b4b4b4;
        }

        .tab.active:hover {
            background: #fff;
        }

        .tab .label {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 150px;
            line-height: 1;
        }

        .tab .close-btn {
            display: none;
            margin-left: 6px;
            width: 16px;
            height: 16px;
            border-radius: 2px;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            color: #666;
            cursor: pointer;
        }

        .tab.closable .close-btn,
        .tab.active .close-btn,
        .tab:hover .close-btn {
            display: inline-flex;
        }

        .tab .close-btn:hover {
            background: #c0c0c0;
            color: #333;
        }

        .rename-input {
            border: none;
            outline: none;
            background: transparent;
            font: inherit;
            color: #000;
            padding: 0;
            width: 60px;
            box-sizing: border-box;
        }

        .add-btn {
            width: 28px;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            color: #444;
            cursor: pointer;
            flex-shrink: 0;
            border-left: 1px solid #c6c6c6;
        }

        .add-btn:hover {
            background: #d8d8d8;
            color: #217346;
        }
    `;

    render() {
        if (!this.shadowRoot.querySelector(".tabs")) {
            this.shadowRoot.innerHTML = `
                <style>${this.#styleText}</style>
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
                </div>
                <div class="add-btn">+</div>
            `;
        }
    }

    #scrollBy(delta) {
        this.#scrollOffset += delta;
        this.#clampScroll();
        this.#applyScroll();
    }

    #clampScroll() {
        const maxScroll = this.#getMaxScroll();
        this.#scrollOffset = Math.max(0, Math.min(this.#scrollOffset, maxScroll));
    }

    #getMaxScroll() {
        const scrollWrap = this.shadowRoot?.querySelector(".tabs-scroll");
        const tabsContainer = this.shadowRoot?.querySelector(".tabs");
        if (!scrollWrap || !tabsContainer) return 0;
        return Math.max(0, tabsContainer.scrollWidth - scrollWrap.clientWidth);
    }

    #applyScroll() {
        const tabsContainer = this.shadowRoot?.querySelector(".tabs");
        if (tabsContainer) {
            tabsContainer.style.transform = `translateX(${-this.#scrollOffset}px)`;
        }
    }

    scrollToTab(sheetName) {
        const tab = this.#tabs.get(sheetName);
        if (!tab) return;

        const scrollWrap = this.shadowRoot.querySelector(".tabs-scroll");
        const tabLeft = tab.offsetLeft;
        const tabWidth = tab.offsetWidth;
        const viewW = scrollWrap.clientWidth;

        if (tabLeft < this.#scrollOffset) {
            this.#scrollOffset = tabLeft;
        } else if (tabLeft + tabWidth > this.#scrollOffset + viewW) {
            this.#scrollOffset = tabLeft + tabWidth - viewW;
        }

        this.#clampScroll();
        this.#applyScroll();
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
            if (sheets.size > 1) tab.classList.add("closable");

            const label = document.createElement("span");
            label.className = "label";
            label.textContent = name;
            tab.appendChild(label);

            const closeBtn = document.createElement("span");
            closeBtn.className = "close-btn";
            closeBtn.textContent = "×";
            tab.appendChild(closeBtn);

            tabsContainer.appendChild(tab);
            this.#tabs.set(name, tab);
        }

        this.#scrollOffset = 0;
        this.#applyScroll();
    }

    #startRename(tabElement) {
        const oldName = tabElement.dataset.name;
        this.#cleanupRename();
        this.#renaming = true;

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
        this.#currentSheets = null;
        this.#currentActiveName = null;
    }
}

customElements.define("sheet-tab-bar", SheetTabBarElement);