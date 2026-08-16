import { BaseHidePlugin } from "./BaseHidePlugin.js";
import { HOOKS } from "../constants/hookNames.js";

export class HiddenColumnsPlugin extends BaseHidePlugin {
    static get PLUGIN_NAME(): string {
        return "hiddenColumns";
    }

    static get AXIS(): string {
        return BaseHidePlugin.AXIS_COL;
    }

    static get AFTER_HIDE_HOOK(): string {
        return HOOKS.AFTER_HIDE_COLUMN;
    }

    static get AFTER_SHOW_HOOK(): string {
        return HOOKS.AFTER_SHOW_COLUMN;
    }

    hideColumn(col: number): void {
        this.hideOne(col);
    }

    hideColumns(cols: number[]): void {
        this.hideMultiple(cols);
    }

    showColumn(col: number): void {
        this.showOne(col);
    }

    showColumns(cols: number[]): void {
        this.showMultiple(cols);
    }

    getHiddenColumns(): number[] {
        return this.getHiddenItems();
    }

    get hiddenColumns(): number[] {
        return this.hiddenItems;
    }

    get visibleColCount(): number {
        return this.visibleCount;
    }
}
