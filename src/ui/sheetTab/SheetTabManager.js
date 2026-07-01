import { Disposable } from "../../core/Disposable.js";
import { SHEET_TAB_EVENTS } from "./SheetTabEvents.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";
import "./SheetTabElement.js";
import "./sheetTabBar.css";

/**
 * SheetTabManager — 工作表标签栏管理器
 *
 * 职责：桥接 SheetTabElement（Web Component）与 Workbook
 * - 监听 SheetTabElement 的自定义事件（switch / close / rename）
 * - 管理标签的创建、销毁、滚动
 * - 处理重命名交互
 *
 * 继承 Disposable（而非 DOMComponent）：
 * - 只需要 trackEvent() 自动解绑事件，不需要 createElement() / injectStyle()
 * - DOM 元素由 SheetTabElement（Web Component）和本类直接管理
 */
export class SheetTabManager extends Disposable {
    #bar = null;
    #addBtn = null;
    #tabsContainer = null;
    #scrollWrap = null;
    #workbook = null;
    #onSwitch = null;
    #onAdd = null;
    #onRemove = null;
    #onRename = null;
    #scrollOffset = 0;
    #renaming = false;
    #tabs = new Map();
    #renameInput = null;
    #renameHandleMousedown = null;
    #renameHandleKeydown = null;
    #renameHandleBlur = null;

    /**
     * @param {HTMLElement} wrap - 标签栏要插入到的容器元素
     * @param {import("../../workbook/Workbook.js").Workbook} workbook
     */
    constructor(wrap, workbook) {
        super();
        this.#workbook = workbook;
        this.#createDOM(wrap);
        this.#bindEvents();
        this.refresh();
    }

    #createDOM(wrap) {
        const bar = document.createElement("div");
        bar.className = "cs-sheet-tab-bar";

        const addBtn = document.createElement("div");
        addBtn.className = "cs-sheet-add-btn";
        addBtn.textContent = "+";
        bar.appendChild(addBtn);

        const scrollWrap = document.createElement("div");
        scrollWrap.className = "cs-sheet-tabs-scroll";
        bar.appendChild(scrollWrap);

        const tabsContainer = document.createElement("div");
        tabsContainer.className = "cs-sheet-tabs";
        scrollWrap.appendChild(tabsContainer);

        wrap.appendChild(bar);

        this.#bar = bar;
        this.#addBtn = addBtn;
        this.#scrollWrap = scrollWrap;
        this.#tabsContainer = tabsContainer;
    }

    #bindEvents() {
        this.trackEvent(this.#tabsContainer, SHEET_TAB_EVENTS.SWITCH, (e) => {
            if (this.#renaming) return;
            if (this.#onSwitch) this.#onSwitch(e.detail.name);
        });

        this.trackEvent(this.#tabsContainer, SHEET_TAB_EVENTS.CLOSE, (e) => {
            if (this.#renaming) return;
            if (this.#onRemove) this.#onRemove(e.detail.name);
        });

        this.trackEvent(this.#tabsContainer, SHEET_TAB_EVENTS.RENAME, (e) => {
            if (this.#renaming) return;
            const tab = this.#tabs.get(e.detail.name);
            if (tab) this.#startRename(tab);
        });

        this.trackEvent(this.#addBtn, EVENT_NAMES.CLICK, () => {
            if (this.#onAdd) this.#onAdd();
        });

        this.trackEvent(
            this.#bar,
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
        const oldName = tabElement.getAttribute("name");
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
                const tabElement = this.#renameInput.closest("sheet-tab");
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

    refresh() {
        if (this.isDisposed || !this.#workbook) return;

        const sheets = this.#workbook.sheets;
        const activeName = this.#workbook.activeSheet?.name;

        this.#cleanupRename();

        for (const [name, tab] of this.#tabs) {
            tab.destroy();
        }
        this.#tabs.clear();

        for (const [name, sheet] of sheets) {
            const tab = document.createElement("sheet-tab");
            tab.setAttribute("name", name);
            if (name === activeName) tab.setAttribute("active", "");
            if (sheets.size > 1) tab.setAttribute("closable", "");

            this.#tabsContainer.appendChild(tab);
            this.#tabs.set(name, tab);
        }

        this.#scrollOffset = 0;
        this.#applyScroll();
    }

    /** @override */
    onDestroy() {
        for (const [name, tab] of this.#tabs) {
            tab.destroy();
        }
        this.#tabs.clear();

        this.#cleanupRename();

        if (this.#bar) {
            this.#bar.remove();
            this.#bar = null;
        }

        this.#addBtn = null;
        this.#scrollWrap = null;
        this.#tabsContainer = null;
        this.#workbook = null;
        this.#onSwitch = null;
        this.#onAdd = null;
        this.#onRemove = null;
        this.#onRename = null;
    }
}