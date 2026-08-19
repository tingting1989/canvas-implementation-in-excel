import { BasePlugin } from "./BasePlugin.js";
import { ContextMenuStrategy } from "../editor/strategies/ContextMenuStrategy.js";

/** 右键菜单插件配置选项 */
interface ContextMenuPluginOptions {
    enabled: boolean;
    closeOnClickOutside: boolean;
    closeOnEscape: boolean;
    zIndex: number;
    dropdownWidth: number;
    dropdownMaxHeight: number;
    hiddenItems: string[];
    disabledItems: string[];
}

export class ContextMenuPlugin extends BasePlugin {
    static get PLUGIN_NAME(): string {
        return "contextMenu";
    }

    static DEFAULT_OPTIONS: ContextMenuPluginOptions = {
        enabled: true,
        closeOnClickOutside: true,
        closeOnEscape: true,
        zIndex: 10001,
        dropdownWidth: 180,
        dropdownMaxHeight: 400,
        hiddenItems: [],
        disabledItems: [],
    };

    #strategy: ContextMenuStrategy | null = null;

    init(options: Partial<ContextMenuPluginOptions> & Record<string, any> = {}): void {
        const mergedOptions = { ...ContextMenuPlugin.DEFAULT_OPTIONS, ...options };
        super.init(mergedOptions);

        this.#strategy = new ContextMenuStrategy(this.eventHandler, mergedOptions);
        this.addStrategy("contextMenu", this.#strategy);

        if (mergedOptions.enabled === false) {
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
