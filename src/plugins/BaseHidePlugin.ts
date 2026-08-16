import { BasePlugin } from "./BasePlugin.js";
import { CONFIG } from "../constants/config.js";
import { errorHandler } from "../core/ErrorHandler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";

export class BaseHidePlugin extends BasePlugin {
    static AXIS_ROW: string = CONFIG.AXIS_ROW;
    static AXIS_COL: string = CONFIG.AXIS_COL;
    static DIM_ROW: string = "Row";
    static DIM_COLUMN: string = "Column";

    static get AXIS(): string {
        errorHandler.throw(ERROR_CODE.PLUGIN_ABSTRACT_METHOD, "AXIS must be overridden in subclass");
        return "";
    }

    static get AFTER_HIDE_HOOK(): string {
        errorHandler.throw(ERROR_CODE.PLUGIN_ABSTRACT_METHOD, "AFTER_HIDE_HOOK must be overridden in subclass");
        return "";
    }

    static get AFTER_SHOW_HOOK(): string {
        errorHandler.throw(ERROR_CODE.PLUGIN_ABSTRACT_METHOD, "AFTER_SHOW_HOOK must be overridden in subclass");
        return "";
    }

    #active: boolean = false;

    get #axis(): string {
        return (this.constructor as typeof BaseHidePlugin).AXIS;
    }

    get #isRow(): boolean {
        return this.#axis === BaseHidePlugin.AXIS_ROW;
    }

    get #dimCapitalized(): string {
        return this.#isRow ? BaseHidePlugin.DIM_ROW : BaseHidePlugin.DIM_COLUMN;
    }

    #rcHide(index: number): boolean {
        return this.#isRow ? this.sheet.rowColManager.hideRow(index) : this.sheet.rowColManager.hideColumn(index);
    }

    #rcShow(index: number): boolean {
        return this.#isRow ? this.sheet.rowColManager.showRow(index) : this.sheet.rowColManager.showColumn(index);
    }

    #rcIsHidden(index: number): boolean {
        return this.#isRow ? this.sheet.rowColManager.isRowHidden(index) : this.sheet.rowColManager.isColumnHidden(index);
    }

    #rcGetHidden(): number[] {
        return this.#isRow ? this.sheet.rowColManager.getHiddenRows() : this.sheet.rowColManager.getHiddenColumns();
    }

    #rcClearHidden(): void {
        return this.#isRow ? this.sheet.rowColManager.clearHiddenRows() : this.sheet.rowColManager.clearHiddenColumns();
    }

    #rcVisibleCount(): number {
        return this.#isRow ? this.sheet.rowColManager.visibleRowCount : this.sheet.rowColManager.visibleColCount;
    }

    init(options: Record<string, any> = {}): void {
        super.init(options);

        const itemsKey = this.#isRow ? "rows" : "columns";
        if (Array.isArray(options[itemsKey])) {
            for (const idx of options[itemsKey] as number[]) {
                if (idx >= 0) this.#rcHide(idx);
            }
        }

        this.#active = true;
        this.#adjustSelection();
        this.renderEngine?.invalidateAll();
        this.render();
    }

    get active(): boolean {
        return this.#active;
    }

    get hiddenItems(): number[] {
        return this.sheet ? this.#rcGetHidden() : [];
    }

    get hiddenCount(): number {
        return this.sheet ? this.#rcGetHidden().length : 0;
    }

    hideOne(index: number): void {
        if (index < 0 || this.isHidden(index)) return;

        this.#rcHide(index);
        this.#adjustSelection();
        this.renderEngine?.invalidateAll();
        this.render();
        this.hooks?.runHooks((this.constructor as typeof BaseHidePlugin).AFTER_HIDE_HOOK, index, true);
    }

    hideMultiple(items: number[]): void {
        if (!Array.isArray(items) || items.length === 0) return;

        let changed = false;
        for (const idx of items) {
            if (idx >= 0 && !this.isHidden(idx)) {
                this.#rcHide(idx);
                changed = true;
            }
        }
        if (changed) {
            this.#adjustSelection();
            this.renderEngine?.invalidateAll();
            this.render();
            for (const idx of items) {
                this.hooks?.runHooks((this.constructor as typeof BaseHidePlugin).AFTER_HIDE_HOOK, idx, true);
            }
        }
    }

    showOne(index: number): void {
        if (!this.isHidden(index)) return;

        this.#rcShow(index);
        this.renderEngine?.invalidateAll();
        this.render();
        this.hooks?.runHooks((this.constructor as typeof BaseHidePlugin).AFTER_SHOW_HOOK, index, false);
    }

    showMultiple(items: number[]): void {
        if (!Array.isArray(items) || items.length === 0) return;

        let changed = false;
        for (const idx of items) {
            if (this.isHidden(idx)) {
                this.#rcShow(idx);
                changed = true;
            }
        }
        if (changed) {
            this.renderEngine?.invalidateAll();
            this.render();
            for (const idx of items) {
                this.hooks?.runHooks((this.constructor as typeof BaseHidePlugin).AFTER_SHOW_HOOK, idx, false);
            }
        }
    }

    isHidden(index: number): boolean {
        return this.sheet ? this.#rcIsHidden(index) : false;
    }

    getHiddenItems(): number[] {
        return this.hiddenItems;
    }

    get visibleCount(): number {
        return this.sheet ? this.#rcVisibleCount() : 0;
    }

    #adjustSelection(): void {
        const sheet = this.sheet;
        if (!sheet) return;

        const selection = sheet.selection;
        const range = selection.getRange();
        const [focusRow, focusCol] = selection.getFocus();

        const focusIdx = this.#isRow ? focusRow : focusCol;
        const topIdx = this.#isRow ? range.topRow : range.topCol;
        const bottomIdx = this.#isRow ? range.bottomRow : range.bottomCol;

        const focusIdxReal = focusIdx;
        const topIdxReal = topIdx;
        const bottomIdxReal = bottomIdx;

        if (!this.#rcIsHidden(focusIdxReal) && !this.#rcIsHidden(topIdxReal) && !this.#rcIsHidden(bottomIdxReal)) {
            return;
        }

        const newIdx = this.#findNearestVisible(focusIdxReal);
        if (newIdx < 0) return;

        const newTop = this.#findNearestVisible(topIdxReal);
        const newBottom = this.#findNearestVisible(bottomIdxReal);

        if (this.#isRow) {
            if (newTop >= 0 && newBottom >= 0) {
                selection.setRange(newTop, range.topCol, newBottom, range.bottomCol);
            }
            selection.setActive(newIdx, focusCol);
        } else {
            if (newTop >= 0 && newBottom >= 0) {
                selection.setRange(range.topRow, newTop, range.bottomRow, newBottom);
            }
            selection.setActive(focusRow, newIdx);
        }
    }

    #findNearestVisible(idx: number): number {
        if (!this.#rcIsHidden(idx)) return idx;

        for (let i = idx + 1; i < idx + 100; i++) {
            if (!this.#rcIsHidden(i)) return i;
        }

        for (let i = idx - 1; i >= 0; i--) {
            if (!this.#rcIsHidden(i)) return i;
        }
        return -1;
    }

    enable(): void {
        super.enable();
        this.#active = true;
    }

    disable(): void {
        super.disable();
        this.#active = false;

        const sheet = this.sheet;
        if (sheet) {
            this.#rcClearHidden();
        }
        this.renderEngine?.invalidateAll();
        this.render();
    }

    destroy(): void {
        this.disable();
        super.destroy();
    }
}
