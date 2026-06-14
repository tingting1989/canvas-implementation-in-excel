import {BasePlugin} from "./BasePlugin.js";
import {ColumnMoveStrategy} from "../editor/strategies/ColumnMoveStrategy.js";

export class ColumnMovePlugin extends BasePlugin {
    static get PLUGIN_NAME() { return 'columnMove'; }

    #strategy = null;

    init(options = {}) {
        super.init(options);
        this.#strategy = new ColumnMoveStrategy(this.eventHandler);
        this.addStrategy('columnMove', this.#strategy);

        if (options.enabled === false) {
            this.disable();
        }
    }

    destroy() {
        this.#strategy = null;
        super.destroy();
    }

    enable() {
        super.enable();
        this.#strategy?.enable();
    }

    disable() {
        super.disable();
        this.#strategy?.disable();
    }
}