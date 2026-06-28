import { CONFIG } from "../constants/config";
import { EVENT_NAMES } from "../constants/eventNames";
import { DOMComponent } from "../core/DOMComponent.js";
import "./sheetTabBar.css";

export class SheetTabBar extends DOMComponent {
    #tabsContainer = null;
    #scrollWrap = null;
    #workbook = null;
    #onSwitch = null;
    #onAdd = null;
    #onRemove = null;
    #onRename = null;
    #scrollOffset = 0;
    #renaming = false;
    #lastClickName = null;
    #lastClickTime = 0;
    #renameInput = null;
    #renameHandleMousedown = null;
    #renameHandleKeydown = null;
    #renameHandleBlur = null;

    constructor(wrap, workbook) {
        super();
        this.#workbook = workbook;
        this.#createDOM(wrap);
        this.#bindEvents();
        this.refresh();
    }

    #createDOM(wrap) {
        const bar = this.createElement("div", { className: "cs-sheet-tab-bar" }, wrap);

        const addBtn = this.createElement(
            "div",
            {
                className: "cs-sheet-add-btn",
                textContent: "+",
            },
            bar,
        );

        this.#scrollWrap = this.createElement("div", { className: "cs-sheet-tabs-scroll" }, bar);
        this.#tabsContainer = this.createElement("div", { className: "cs-sheet-tabs" }, this.#scrollWrap);

        // 保存引用供外部方法使用
        this._addBtn = addBtn;
        this._bar = bar;
    }

    #bindEvents() {
        this.trackEvent(this._addBtn, EVENT_NAMES.CLICK, () => {
            if (this.#onAdd) this.#onAdd();
        });

        this.trackEvent(this.#tabsContainer, EVENT_NAMES.CLICK, (e) => {
            if (this.#renaming) return;

            const tabEl = e.target.closest(".cs-sheet-tab");
            if (!tabEl) return;

            const closeBtn = e.target.closest(".cs-sheet-tab-close");
            if (closeBtn) {
                e.stopPropagation();
                const name = tabEl.dataset.sheetName;
                if (this.#onRemove) this.#onRemove(name);
                return;
            }

            const name = tabEl.dataset.sheetName;
            const now = Date.now();

            if (this.#lastClickName === name && now - this.#lastClickTime < 400) {
                this.#lastClickName = null;
                this.#lastClickTime = 0;
                const activeTab = this.#tabsContainer.querySelector(".cs-sheet-tab.active");
                if (activeTab) this.#startRename(activeTab);
                return;
            }

            this.#lastClickName = name;
            this.#lastClickTime = now;
            if (this.#onSwitch) this.#onSwitch(name);
        });

        this.trackEvent(
            this._bar,
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

    #clampScroll() {
        const maxScroll = this.#getMaxScroll();
        this.#scrollOffset = Math.max(0, Math.min(this.#scrollOffset, maxScroll));
    }

    #getMaxScroll() {
        if (!this.#scrollWrap || !this.#tabsContainer) return 0;
        const contentW = this.#tabsContainer.scrollWidth;
        const viewW = this.#scrollWrap.clientWidth;
        return Math.max(0, contentW - viewW);
    }

    #applyScroll() {
        if (this.#tabsContainer) {
            this.#tabsContainer.style.transform = `translateX(${-this.#scrollOffset}px)`;
        }
    }

    scrollToTab(sheetName) {
        const tabs = this.#tabsContainer.querySelectorAll(".cs-sheet-tab");
        for (const tab of tabs) {
            if (tab.dataset.sheetName === sheetName) {
                const tabLeft = tab.offsetLeft;
                const tabWidth = tab.offsetWidth;
                const viewW = this.#scrollWrap.clientWidth;

                if (tabLeft < this.#scrollOffset) {
                    this.#scrollOffset = tabLeft;
                } else if (tabLeft + tabWidth > this.#scrollOffset + viewW) {
                    this.#scrollOffset = tabLeft + tabWidth - viewW;
                }

                this.#clampScroll();
                this.#applyScroll();
                break;
            }
        }
    }

    set onSwitch(fn) {
        this.#onSwitch = fn;
    }

    set onAdd(fn) {
        this.#onAdd = fn;
    }

    set onRemove(fn) {
        this.#onRemove = fn;
    }

    set onRename(fn) {
        this.#onRename = fn;
    }

    set workbook(wb) {
        this.#workbook = wb;
    }

    #startRename(tabEl) {
        const oldName = tabEl.dataset.sheetName;
        const label = tabEl.querySelector("span:not(.cs-sheet-tab-close)");
        if (!label) return;

        this.#cleanupRename();
        this.#renaming = true;

        const input = document.createElement("input");
        input.className = "cs-sheet-rename-input";
        input.value = oldName;
        this.#renameInput = input;

        let committed = false;

        const commit = () => {
            if (committed) return;
            committed = true;
            this.#renaming = false;

            const newName = input.value.trim();
            this.#cleanupRename();
            if (newName && newName !== oldName && this.#onRename) {
                this.#onRename(oldName, newName);
            } else {
                this.refresh();
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
                this.refresh();
            }
        };

        this.#renameHandleBlur = commit;

        input.addEventListener(EVENT_NAMES.MOUSEDOWN, this.#renameHandleMousedown);
        input.addEventListener(EVENT_NAMES.KEYDOWN, this.#renameHandleKeydown);
        input.addEventListener(EVENT_NAMES.BLUR, this.#renameHandleBlur);

        tabEl.replaceChild(input, label);
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
            this.#renameInput = null;
        }
        this.#renameHandleMousedown = null;
        this.#renameHandleKeydown = null;
        this.#renameHandleBlur = null;
        this.#renaming = false;
    }

    refresh() {
        if (!this.#workbook) return;

        const sheets = this.#workbook.sheets;
        const activeName = this.#workbook.activeSheet?.name;

        this.#cleanupRename();
        this.#tabsContainer.innerHTML = "";

        for (const [name, sheet] of sheets) {
            const tab = document.createElement("div");
            tab.className = "cs-sheet-tab" + (name === activeName ? " active" : "");
            tab.dataset.sheetName = name;

            const label = document.createElement("span");
            label.textContent = name;
            tab.appendChild(label);

            if (sheets.size > 1) {
                const closeBtn = document.createElement("span");
                closeBtn.className = "cs-sheet-tab-close";
                closeBtn.textContent = "\u00D7";
                tab.appendChild(closeBtn);
            }

            this.#tabsContainer.appendChild(tab);
        }

        this.#scrollOffset = 0;
        this.#applyScroll();
    }

    /** @override */
    onDestroy() {
        this.#cleanupRename();
        this.#workbook = null;
        this.#onSwitch = null;
        this.#onAdd = null;
        this.#onRemove = null;
        this.#onRename = null;
        super.onDestroy();
    }
}