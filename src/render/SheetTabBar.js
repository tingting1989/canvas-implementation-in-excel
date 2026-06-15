import { CONFIG } from "../constants/config";
import { EVENT_NAMES } from "../constants/eventNames";

let sheetTabStyleInjected = false;

function injectSheetTabStyles() {
    if (sheetTabStyleInjected) return;
    sheetTabStyleInjected = true;

    const style = document.createElement("style");
    style.textContent = `
.cs-sheet-tab-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 50%;
  height: ${CONFIG.SHEET_TAB_HEIGHT}px;
  background: #f5f5f5;
  border-top: 1px solid #ddd;
  display: flex;
  align-items: center;
  z-index: 12;
  user-select: none;
}
.cs-sheet-add-btn {
  width: ${CONFIG.SHEET_TAB_HEIGHT}px;
  height: ${CONFIG.SHEET_TAB_HEIGHT}px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #555;
  cursor: pointer;
  flex-shrink: 0;
  border-right: 1px solid #ddd;
}
.cs-sheet-add-btn:hover {
  background: #e0e0e0;
  color: #217346;
}
.cs-sheet-tabs-scroll {
  flex: 1;
  overflow: hidden;
  height: 100%;
  position: relative;
}
.cs-sheet-tabs {
  display: flex;
  align-items: center;
  height: 100%;
  white-space: nowrap;
  transition: transform 0.15s ease;
}
.cs-sheet-tab {
  display: inline-flex;
  align-items: center;
  padding: 0 16px;
  height: 100%;
  font-size: 12px;
  color: #444;
  cursor: pointer;
  border-right: 1px solid #ddd;
  position: relative;
  flex-shrink: 0;
  background: #eaeaea;
}
.cs-sheet-tab:hover {
  background: #ddd;
}
.cs-sheet-tab.active {
  background: #fff;
  color: #217346;
  font-weight: 600;
}
.cs-sheet-tab-close {
  display: none;
  margin-left: 6px;
  width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  font-size: 11px;
  border-radius: 50%;
  color: #888;
  cursor: pointer;
}
.cs-sheet-tab-close:hover {
  background: #c0c0c0;
  color: #333;
}
.cs-sheet-tab.active .cs-sheet-tab-close,
.cs-sheet-tab:hover .cs-sheet-tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cs-sheet-rename-input {
  border: none;
  outline: none;
  background: #fff;
  font: inherit;
  color: inherit;
  padding: 0;
  width: 60px;
  box-sizing: border-box;
}`;
    document.head.appendChild(style);
}

export class SheetTabBar {
    #bar = null;
    #tabsContainer = null;
    #scrollWrap = null;
    #addBtn = null;
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
    #handleAddClick = null;
    #handleTabClick = null;
    #handleWheel = null;

    constructor(wrap, workbook) {
        this.#workbook = workbook;
        injectSheetTabStyles();
        this.#createDOM(wrap);
        this.#bindEvents();
        this.refresh();
    }

    #createDOM(wrap) {
        this.#bar = document.createElement("div");
        this.#bar.className = "cs-sheet-tab-bar";

        this.#addBtn = document.createElement("div");
        this.#addBtn.className = "cs-sheet-add-btn";
        this.#addBtn.textContent = "+";

        this.#scrollWrap = document.createElement("div");
        this.#scrollWrap.className = "cs-sheet-tabs-scroll";

        this.#tabsContainer = document.createElement("div");
        this.#tabsContainer.className = "cs-sheet-tabs";

        this.#scrollWrap.appendChild(this.#tabsContainer);
        this.#bar.appendChild(this.#addBtn);
        this.#bar.appendChild(this.#scrollWrap);
        wrap.appendChild(this.#bar);
    }

    #bindEvents() {
        this.#handleAddClick = () => {
            if (this.#onAdd) {
                this.#onAdd();
            }
        };

        this.#handleTabClick = (e) => {
            if (this.#renaming) return;

            const tabEl = e.target.closest(".cs-sheet-tab");
            if (!tabEl) return;

            const closeBtn = e.target.closest(".cs-sheet-tab-close");
            if (closeBtn) {
                e.stopPropagation();
                const name = tabEl.dataset.sheetName;
                if (this.#onRemove) {
                    this.#onRemove(name);
                }
                return;
            }

            const name = tabEl.dataset.sheetName;
            const now = Date.now();

            if (this.#lastClickName === name && now - this.#lastClickTime < 400) {
                this.#lastClickName = null;
                this.#lastClickTime = 0;

                const activeTab = this.#tabsContainer.querySelector(".cs-sheet-tab.active");
                if (activeTab) {
                    this.#startRename(activeTab);
                }
                return;
            }

            this.#lastClickName = name;
            this.#lastClickTime = now;

            if (this.#onSwitch) {
                this.#onSwitch(name);
            }
        };

        this.#handleWheel = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
            this.#scrollOffset += delta;
            this.#clampScroll();
            this.#applyScroll();
        };

        this.#addBtn.addEventListener(EVENT_NAMES.CLICK, this.#handleAddClick);
        this.#tabsContainer.addEventListener(EVENT_NAMES.CLICK, this.#handleTabClick);
        this.#bar.addEventListener(EVENT_NAMES.WHEEL, this.#handleWheel, { passive: false });
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

    destroy() {
        this.#cleanupRename();

        if (this.#addBtn && this.#handleAddClick) {
            this.#addBtn.removeEventListener(EVENT_NAMES.CLICK, this.#handleAddClick);
        }
        if (this.#tabsContainer && this.#handleTabClick) {
            this.#tabsContainer.removeEventListener(EVENT_NAMES.CLICK, this.#handleTabClick);
        }
        if (this.#bar && this.#handleWheel) {
            this.#bar.removeEventListener(EVENT_NAMES.WHEEL, this.#handleWheel);
        }

        if (this.#bar && this.#bar.parentElement) {
            this.#bar.parentElement.removeChild(this.#bar);
        }
        this.#bar = null;
        this.#tabsContainer = null;
        this.#scrollWrap = null;
        this.#addBtn = null;
        this.#workbook = null;
        this.#handleAddClick = null;
        this.#handleTabClick = null;
        this.#handleWheel = null;
        this.#onSwitch = null;
        this.#onAdd = null;
        this.#onRemove = null;
        this.#onRename = null;
    }
}