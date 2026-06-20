import { BasePlugin } from "./BasePlugin.js";
import { HOOKS } from "../constants/hookNames.js";

export class FreezePlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "freeze";
    }

    #active = false;

    init(options = {}) {
        super.init(options);
        if (options.fixedRowsTop !== undefined || options.fixedColumnsStart !== undefined) {
            const sheet = this.sheet;
            if (sheet) {
                if (typeof options.fixedRowsTop === "number" && options.fixedRowsTop > 0) {
                    sheet.fixedRowsTop = options.fixedRowsTop;
                }
                if (typeof options.fixedColumnsStart === "number" && options.fixedColumnsStart > 0) {
                    sheet.fixedColumnsStart = options.fixedColumnsStart;
                }
            }
        }

        this.#active = true;
        this.renderEngine?.invalidateAll();
        this.render();
    }

    get active() {
        return this.#active;
    }

    get fixedRowsTop() {
        return this.sheet ? this.sheet.fixedRowsTop : 0;
    }

    get fixedColumnsStart() {
        return this.sheet ? this.sheet.fixedColumnsStart : 0;
    }

    setFixedRowsTop(count) {
        const sheet = this.sheet;
        if (!sheet) return;
        const oldRows = sheet.fixedRowsTop;
        const oldCols = sheet.fixedColumnsStart;
        sheet.fixedRowsTop = Math.max(0, Math.floor(count));
        this.#applyAndNotify(oldRows, oldCols);
    }

    setFixedColumnsStart(count) {
        const sheet = this.sheet;
        if (!sheet) return;
        const oldRows = sheet.fixedRowsTop;
        const oldCols = sheet.fixedColumnsStart;
        sheet.fixedColumnsStart = Math.max(0, Math.floor(count));
        this.#applyAndNotify(oldRows, oldCols);
    }

    freeze(rows, cols) {
        const sheet = this.sheet;
        if (!sheet) return;
        sheet.fixedRowsTop = Math.max(0, Math.floor(rows || 0));
        sheet.fixedColumnsStart = Math.max(0, Math.floor(cols || 0));
        this.renderEngine?.invalidateAll();
        this.render();
        this.#notifyFreezeChange();
    }

    unfreeze() {
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

    isFrozen() {
        const sheet = this.sheet;
        return sheet ? (sheet.fixedRowsTop > 0 || sheet.fixedColumnsStart > 0) : false;
    }

    #applyAndNotify(oldRows, oldCols) {
        this.renderEngine?.invalidateAll();
        this.render();
        this.#notifyFreezeChange(oldRows, oldCols);
    }

    #notifyFreezeChange(oldRows, oldCols) {
        const sheet = this.sheet;
        if (!sheet) return;
        if (sheet.fixedRowsTop > 0 || sheet.fixedColumnsStart > 0) {
            this.hooks?.runHooks(HOOKS.AFTER_FREEZE, sheet.fixedRowsTop, sheet.fixedColumnsStart);
        } else if ((oldRows ?? 0) > 0 || (oldCols ?? 0) > 0) {
            this.hooks?.runHooks(HOOKS.AFTER_UNFREEZE);
        }
    }

    enable() {
        super.enable();
        this.#active = true;
    }

    disable() {
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

    destroy() {
        this.disable();
        super.destroy();
    }
}