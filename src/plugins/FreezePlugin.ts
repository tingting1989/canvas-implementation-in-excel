import { BasePlugin } from "./BasePlugin.js";
import { HOOKS } from "../constants/hookNames.js";
import { isNumber } from "../utils/helper.js";

export class FreezePlugin extends BasePlugin {
    static get PLUGIN_NAME(): string {
        return "freeze";
    }

    #active: boolean = false;

    init(options: Record<string, any> = {}): void {
        super.init(options);
        if (options.fixedRowsTop !== undefined || options.fixedColumnsStart !== undefined) {
            const sheet = this.sheet;
            if (sheet) {
                if (isNumber(options.fixedRowsTop) && options.fixedRowsTop > 0) {
                    sheet.fixedRowsTop = options.fixedRowsTop;
                }
                if (isNumber(options.fixedColumnsStart) && options.fixedColumnsStart > 0) {
                    sheet.fixedColumnsStart = options.fixedColumnsStart;
                }
            }
        }

        this.#active = true;
        this.renderEngine?.invalidateAll();
        this.render();
    }

    get active(): boolean {
        return this.#active;
    }

    get fixedRowsTop(): number {
        return this.sheet ? this.sheet.fixedRowsTop : 0;
    }

    get fixedColumnsStart(): number {
        return this.sheet ? this.sheet.fixedColumnsStart : 0;
    }

    setFixedRowsTop(count: number): void {
        const sheet = this.sheet;
        if (!sheet) return;
        const oldRows = sheet.fixedRowsTop;
        const oldCols = sheet.fixedColumnsStart;
        sheet.fixedRowsTop = Math.max(0, Math.floor(count));
        this.#applyAndNotify(oldRows, oldCols);
    }

    setFixedColumnsStart(count: number): void {
        const sheet = this.sheet;
        if (!sheet) return;
        const oldRows = sheet.fixedRowsTop;
        const oldCols = sheet.fixedColumnsStart;
        sheet.fixedColumnsStart = Math.max(0, Math.floor(count));
        this.#applyAndNotify(oldRows, oldCols);
    }

    freeze(rows: number, cols: number): void {
        const sheet = this.sheet;
        if (!sheet) return;
        sheet.fixedRowsTop = Math.max(0, Math.floor(rows || 0));
        sheet.fixedColumnsStart = Math.max(0, Math.floor(cols || 0));
        this.renderEngine?.invalidateAll();
        this.render();
        this.#notifyFreezeChange();
    }

    unfreeze(): void {
        const sheet = this.sheet;
        if (!sheet) return;
        const hadFreeze = sheet.fixedRowsTop > 0 || sheet.fixedColumnsStart > 0;
        sheet.fixedRowsTop = 0;
        sheet.fixedColumnsStart = 0;
        this.renderEngine?.invalidateAll();
        this.render();
        if (hadFreeze) {
            this.hooks?.runHooks(HOOKS.AFTER_UNFREEZE);
        }
    }

    isFrozen(): boolean {
        const sheet = this.sheet;
        return sheet ? sheet.fixedRowsTop > 0 || sheet.fixedColumnsStart > 0 : false;
    }

    #applyAndNotify(oldRows: number, oldCols: number): void {
        this.renderEngine?.invalidateAll();
        this.render();
        this.#notifyFreezeChange(oldRows, oldCols);
    }

    #notifyFreezeChange(oldRows?: number, oldCols?: number): void {
        const sheet = this.sheet;
        if (!sheet) return;
        if (sheet.fixedRowsTop > 0 || sheet.fixedColumnsStart > 0) {
            this.hooks?.runHooks(HOOKS.AFTER_FREEZE, sheet.fixedRowsTop, sheet.fixedColumnsStart);
        } else if ((oldRows ?? 0) > 0 || (oldCols ?? 0) > 0) {
            this.hooks?.runHooks(HOOKS.AFTER_UNFREEZE);
        }
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
            sheet.fixedRowsTop = 0;
            sheet.fixedColumnsStart = 0;
        }
        this.renderEngine?.invalidateAll();
        this.render();
    }

    destroy(): void {
        this.disable();
        super.destroy();
    }
}
