import { BaseHidePlugin } from "./BaseHidePlugin.js";
import { HOOKS } from "../constants/hookNames.js";

export class HiddenRowsPlugin extends BaseHidePlugin {
    static get PLUGIN_NAME(): string {
        return "hiddenRows";
    }

    static get AXIS(): string {
        return BaseHidePlugin.AXIS_ROW;
    }

    static get AFTER_HIDE_HOOK(): string {
        return HOOKS.AFTER_HIDE_ROW;
    }

    static get AFTER_SHOW_HOOK(): string {
        return HOOKS.AFTER_SHOW_ROW;
    }

    hideRow(row: number): void {
        this.hideOne(row);
    }

    hideRows(rows: number[]): void {
        this.hideMultiple(rows);
    }

    showRow(row: number): void {
        this.showOne(row);
    }

    showRows(rows: number[]): void {
        this.showMultiple(rows);
    }

    getHiddenRows(): number[] {
        return this.getHiddenItems();
    }

    get hiddenRows(): number[] {
        return this.hiddenItems;
    }

    get visibleRowCount(): number {
        return this.visibleCount;
    }
}
