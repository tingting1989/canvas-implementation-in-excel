import { WebComponent } from "@/core/WebComponent";
import { SHEET_TAB_EVENTS } from "./SheetTabEvents.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";
import "./SheetTabItemElement.js";

/**
 * SheetTabBarElement — 工作表标签栏 Web Component
 *
 * 使用方式：
 * <sheet-tab-bar></sheet-tab-bar>
 *
 * 方法：
 * - refresh(sheets, activeName): 刷新标签列表
 * - scrollToTab(sheetName): 滚动到指定标签
 *
 * 事件：
 * - switch: 点击标签时触发（detail: { name }）
 * - close: 点击关闭按钮时触发（detail: { name }）
 * - rename: 双击标签确认重命名时触发（detail: { oldName, newName }）
 * - add: 点击添加按钮时触发
 */
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
        const addBtn = this.shadowRoot.querySelector(".add-btn");
        const scrollWrap = this.shadowRoot.querySelector(".tabs-scroll");
        const tabsContainer = this.shadowRoot.querySelector(".tabs");

        disposable.trackEvent(addBtn, EVENT_NAMES.CLICK, () => {
            this.emit(SHEET_TAB_EVENTS.ADD);
        });

        disposable.trackEvent(tabsContainer, SHEET_TAB_EVENTS.SWITCH, (e) => {
            if (this.#renaming) return;
            this.emit(SHEET_TAB_EVENTS.SWITCH, { name: e.detail.name });
        });

        disposable.trackEvent(tabsContainer, SHEET_TAB_EVENTS.CLOSE, (e) => {
            if (this.#renaming) return;
            this.emit(SHEET_TAB_EVENTS.CLOSE, { name: e.detail.name });
        });

        disposable.trackEvent(tabsContainer, SHEET_TAB_EVENTS.RENAME, (e) => {
            if (this.#renaming) return;
            const tab = this.#tabs.get(e.detail.name);
            if (tab) this.#startRename(tab);
        });

        disposable.trackEvent(
            this,
            EVENT_NAMES.WHEEL,
            (e) => {
                e.preventDefault();
                e.stopPropagation();
                const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
                this.#scrollOffset += delta;
                this.#clampScroll();
                this.#applyScroll();
            },
            { passive: false },
        );
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
        }

        .add-btn:hover {
            background: #d8d8d8;
            color: #217346;
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

        .rename-input {
            border: 1px solid #217346;
            outline: none;
            background: #fff;
            font: inherit;
            color: #000;
            padding: 0 4px;
            width: 60px;
            box-sizing: border-box;
        }
    `;

    render() {
        if (!this.shadowRoot.querySelector(".tabs")) {
            this.shadowRoot.innerHTML = `
                <style>${this.#styleText}</style>
                <div class="add-btn">+</div>
                <div class="tabs-scroll">
                    <div class="tabs"></div>
                </div>
            `;
        }
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

        for (const [name, tab] of this.#tabs) {
            tab.destroy();
        }
        this.#tabs.clear();

        for (const [name] of sheets) {
            const tab = document.createElement("sheet-tab-item");
            tab.setAttribute("name", name);
            if (name === activeName) tab.setAttribute("active", "");
            if (sheets.size > 1) tab.setAttribute("closable", "");

            tabsContainer.appendChild(tab);
            this.#tabs.set(name, tab);
        }

        this.#scrollOffset = 0;
        this.#applyScroll();
    }

    #startRename(tabElement) {
        const oldName = tabElement.getAttribute("name");
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

        const label = tabElement.shadowRoot.querySelector(".label");
        if (label) {
            label.style.display = "none";
            tabElement.shadowRoot.appendChild(input);
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
                const tabElement = this.#renameInput.closest("sheet-tab-item");
                if (tabElement) {
                    const label = tabElement.shadowRoot.querySelector(".label");
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
        for (const [name, tab] of this.#tabs) {
            tab.destroy();
        }
        this.#tabs.clear();
        this.#cleanupRename();
        this.#currentSheets = null;
        this.#currentActiveName = null;
    }
}

customElements.define("sheet-tab-bar", SheetTabBarElement);