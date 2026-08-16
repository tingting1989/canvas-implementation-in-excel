import { Disposable } from "../../core/Disposable.js";
import { SHEET_TAB_EVENTS } from "./sheetTabEvents.js";
import "./SheetTabBarElement.js";
import type { SheetTabBarElement } from "./SheetTabBarElement.js";

interface WorkbookLike {
    sheets: Map<string, any>;
    activeSheet?: { name: string; readOnly?: boolean } | null;
}

type SheetTabCallback = (...args: any[]) => void;

export class SheetTabManager extends Disposable {
    #element: SheetTabBarElement | null = null;
    #workbook: WorkbookLike | null = null;

    #onSwitch: SheetTabCallback | null = null;
    #onAdd: SheetTabCallback | null = null;
    #onRemove: SheetTabCallback | null = null;
    #onRename: SheetTabCallback | null = null;
    #onCopy: SheetTabCallback | null = null;
    #onHide: SheetTabCallback | null = null;

    constructor(wrap: HTMLElement, workbook: WorkbookLike) {
        super();
        this.#workbook = workbook;
        this.#createDOM(wrap);
        this.#bindEvents();
        this.refresh();
    }

    #createDOM(wrap: HTMLElement): void {
        this.#element = document.createElement("sheet-tab-bar");
        this.#element.style.position = "absolute";
        this.#element.style.bottom = "0";
        this.#element.style.left = "0";
        this.#element.style.zIndex = "12";
        wrap.appendChild(this.#element);
    }

    updateLayout(showHScrollbar: boolean): void {
        if (!this.#element) return;
        this.#element.style.width = showHScrollbar ? "calc((100% - 14px) / 2)" : "100%";
    }

    #bindEvents(): void {
        this.trackEvent(this.#element!, SHEET_TAB_EVENTS.SWITCH, (e: CustomEvent) => {
            if (this.#onSwitch) this.#onSwitch(e.detail.name);
        });

        this.trackEvent(this.#element!, SHEET_TAB_EVENTS.CLOSE, (e: CustomEvent) => {
            if (this.#onRemove) this.#onRemove(e.detail.name);
        });

        this.trackEvent(this.#element!, SHEET_TAB_EVENTS.RENAME, (e: CustomEvent) => {
            if (this.#onRename) this.#onRename(e.detail.oldName, e.detail.newName);
        });

        this.trackEvent(this.#element!, SHEET_TAB_EVENTS.ADD, () => {
            if (this.#onAdd) this.#onAdd();
        });

        this.trackEvent(this.#element!, SHEET_TAB_EVENTS.COPY, (e: CustomEvent) => {
            if (this.#onCopy) this.#onCopy(e.detail.name);
        });

        this.trackEvent(this.#element!, SHEET_TAB_EVENTS.HIDE, (e: CustomEvent) => {
            if (this.#onHide) this.#onHide(e.detail.name);
        });
    }

    refresh(): void {
        if (this.isDisposed || !this.#element || !this.#workbook) return;
        this.#element.refresh(this.#workbook.sheets, this.#workbook.activeSheet?.name ?? "");
        this.#element.readOnly = this.#workbook.activeSheet?.readOnly || false;
    }

    scrollToTab(sheetName: string): void {
        if (this.#element) this.#element.scrollToTab(sheetName);
    }

    set onSwitch(fn: SheetTabCallback) {
        this.#onSwitch = fn;
    }

    set onAdd(fn: SheetTabCallback) {
        this.#onAdd = fn;
    }

    set onRemove(fn: SheetTabCallback) {
        this.#onRemove = fn;
    }

    set onRename(fn: SheetTabCallback) {
        this.#onRename = fn;
    }

    set onCopy(fn: SheetTabCallback) {
        this.#onCopy = fn;
    }

    set onHide(fn: SheetTabCallback) {
        this.#onHide = fn;
    }

    set workbook(wb: WorkbookLike) {
        this.#workbook = wb;
    }

    onDestroy(): void {
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
        this.#onCopy = null;
        this.#onHide = null;
    }
}
