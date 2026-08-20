import { BasePlugin } from "./BasePlugin.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

type EventStrategy = import("../../editor/strategies/EventStrategy.js").EventStrategy;

export class BaseMovePlugin extends BasePlugin {
    #strategy: EventStrategy | null = null;

    _createStrategy(): EventStrategy {
        errorHandler.throw(ERROR_CODE.PLUGIN_ABSTRACT_METHOD, "_createStrategy() must be overridden in subclass");
        return null as any;
    }

    init(options: Record<string, any> = {}): void {
        super.init(options);

        this.#strategy = this._createStrategy();
        this.addStrategy((this.constructor as typeof BasePlugin).PLUGIN_NAME, this.#strategy);

        if (options.enabled === false) {
            this.disable();
        }
    }

    destroy(): void {
        this.#strategy = null;
        super.destroy();
    }

    enable(): void {
        super.enable();
        this.#strategy?.enable();
    }

    disable(): void {
        super.disable();
        this.#strategy?.disable();
    }
}
