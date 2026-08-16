import { BasePlugin } from "./BasePlugin.js";
import { ContextMenuStrategy } from "../editor/strategies/ContextMenuStrategy.js";

export class ContextMenuPlugin extends BasePlugin {
    static get PLUGIN_NAME(): string {
        return "contextMenu";
    }

    #strategy: ContextMenuStrategy | null = null;

    init(options: Record<string, any> = {}): void {
        super.init(options);

        this.#strategy = new ContextMenuStrategy(this.eventHandler, options);
        this.addStrategy("contextMenu", this.#strategy);

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
