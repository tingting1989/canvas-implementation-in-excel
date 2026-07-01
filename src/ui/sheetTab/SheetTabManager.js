import { Disposable } from "../../core/Disposable.js";
import { SHEET_TAB_EVENTS } from "./SheetTabEvents.js";
import "./SheetTabBarElement.js";

/**
 * SheetTabManager — 工作表标签栏管理器
 *
 * 职责：桥接 SheetTabBarElement（Web Component）与 Workbook
 * - 监听 SheetTabBarElement 的自定义事件（switch / close / rename / add）
 * - 将事件转发给 Workbook 处理
 * - 根据工作簿状态刷新标签栏
 *
 * 继承 Disposable（而非 DOMComponent）：
 * - 只需要 trackEvent() 自动解绑事件，不需要 createElement() / injectStyle()
 * - DOM 元素由 SheetTabBarElement（Web Component）自行管理
 */
export class SheetTabManager extends Disposable {
    /** @type {SheetTabBarElement} */
    #element = null;

    /** @type {import("../../workbook/Workbook.js").Workbook} */
    #workbook = null;

    #onSwitch = null;
    #onAdd = null;
    #onRemove = null;
    #onRename = null;

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
        this.#element = document.createElement("sheet-tab-bar");
        this.#element.style.position = "absolute";
        this.#element.style.bottom = "0";
        this.#element.style.left = "0";
        this.#element.style.width = "calc((100% - 14px) / 2)";
        this.#element.style.zIndex = "12";
        wrap.appendChild(this.#element);
    }

    #bindEvents() {
        this.trackEvent(this.#element, SHEET_TAB_EVENTS.SWITCH, (e) => {
            if (this.#onSwitch) this.#onSwitch(e.detail.name);
        });

        this.trackEvent(this.#element, SHEET_TAB_EVENTS.CLOSE, (e) => {
            if (this.#onRemove) this.#onRemove(e.detail.name);
        });

        this.trackEvent(this.#element, SHEET_TAB_EVENTS.RENAME, (e) => {
            if (this.#onRename) this.#onRename(e.detail.oldName, e.detail.newName);
        });

        this.trackEvent(this.#element, SHEET_TAB_EVENTS.ADD, () => {
            if (this.#onAdd) this.#onAdd();
        });
    }

    refresh() {
        if (this.isDisposed || !this.#element || !this.#workbook) return;
        this.#element.refresh(this.#workbook.sheets, this.#workbook.activeSheet?.name);
    }

    scrollToTab(sheetName) {
        if (this.#element) this.#element.scrollToTab(sheetName);
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

    /**
     * 设置当前对象关联的工作簿实例
     * @param {Workbook} wb - 要关联的工作簿实例
     */
    set workbook(wb) {
        this.#workbook = wb;
    }

    /** @override */
    onDestroy() {
        if (this.#element) {
            this.#element.destroy();
            this.#element.remove();
            this.#element = null;
        }
        this.#workbook = null;
        this.#onSwitch = null;
        this.#onAdd = null;
        this.#onRemove = null;
        this.#onRename = null;
    }
}
