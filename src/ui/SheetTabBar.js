import { CONFIG } from "../constants/config";
import { EVENT_NAMES } from "../constants/eventNames";
import { DOMComponent } from "../core/DOMComponent.js";
import "./SheetTabElement.js";  // ✅ 导入 Web Component
import "./sheetTabBar.css";

/**
 * SheetTabBar — 工作表标签栏（重构版）
 * 
 * ✅ 使用 Web Components（SheetTabElement）
 * ✅ 不向后兼容，彻底重构
 * ✅ 显式销毁标签
 */
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
    #tabs = new Map();  // ✅ 跟踪所有标签（用于显式销毁）
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

        this._addBtn = addBtn;
        this._bar = bar;
    }

    #bindEvents() {
        // ✅ 监听 Web Component 事件
        this.trackEvent(this.#tabsContainer, 'switch', (e) => {
            if (this.#renaming) return;
            if (this.#onSwitch) this.#onSwitch(e.detail.name);
        });

        this.trackEvent(this.#tabsContainer, 'close', (e) => {
            if (this.#renaming) return;
            if (this.#onRemove) this.#onRemove(e.detail.name);
        });

        this.trackEvent(this.#tabsContainer, 'rename', (e) => {
            if (this.#renaming) return;
            const tab = this.#tabs.get(e.detail.name);
            if (tab) this.#startRename(tab);
        });

        this.trackEvent(this._addBtn, EVENT_NAMES.CLICK, () => {
            if (this.#onAdd) this.#onAdd();
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
        const tab = this.#tabs.get(sheetName);
        if (!tab) return;

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

    #startRename(tabElement) {
        const oldName = tabElement.getAttribute('name');
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

        // ✅ 替换 Web Component 的 label 部分
        const label = tabElement.shadowRoot.querySelector('.label');
        if (label) {
            label.style.display = 'none';
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
            
            // ✅ 移除输入框，恢复 label
            if (this.#renameInput.parentElement) {
                const tabElement = this.#renameInput.closest('sheet-tab');
                if (tabElement) {
                    const label = tabElement.shadowRoot.querySelector('.label');
                    if (label) {
                        label.style.display = '';
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

    refresh() {
        if (!this.#workbook) return;

        const sheets = this.#workbook.sheets;
        const activeName = this.#workbook.activeSheet?.name;

        this.#cleanupRename();

        // ✅ 显式销毁旧标签（关键）
        for (const [name, tab] of this.#tabs) {
            tab.destroy();  // 触发 disconnectedCallback → 真正销毁
        }
        this.#tabs.clear();

        // ✅ 使用 Web Components 创建新标签
        for (const [name, sheet] of sheets) {
            const tab = document.createElement('sheet-tab');
            tab.setAttribute('name', name);
            if (name === activeName) tab.setAttribute('active', '');
            if (sheets.size > 1) tab.setAttribute('closable', '');
            
            this.#tabsContainer.appendChild(tab);
            this.#tabs.set(name, tab);  // ✅ 跟踪标签
        }

        this.#scrollOffset = 0;
        this.#applyScroll();
    }

    /** @override */
    onDestroy() {
        // ✅ 显式销毁所有标签（关键）
        for (const [name, tab] of this.#tabs) {
            tab.destroy();
        }
        this.#tabs.clear();
        
        this.#cleanupRename();
        this.#workbook = null;
        this.#onSwitch = null;
        this.#onAdd = null;
        this.#onRemove = null;
        this.#onRename = null;
        super.onDestroy();
    }
}