import { BasePlugin } from "../base/BasePlugin.js";
import { AutoFillStrategy } from "./AutoFillStrategy.js";

export class AutoFillPlugin extends BasePlugin {
    static get PLUGIN_NAME(): string {
        return "autoFill";
    }

    #strategy: AutoFillStrategy | null = null;

    init(options: Record<string, any> = {}): void {
        super.init(options);

        this.#strategy = new AutoFillStrategy(this.eventHandler);
        this.addStrategy("autoFill", this.#strategy);

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
