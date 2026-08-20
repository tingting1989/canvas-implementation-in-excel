import { BasePlugin } from "./base/BasePlugin.js";
import { errorHandler } from "../core/ErrorHandler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";

type Workbook = import("../workbook/Workbook.js").Workbook;
type PluginClass = typeof BasePlugin;

export class PluginManager {
    static #registry: Map<string, PluginClass> = new Map();

    #workbook: Workbook | null = null;
    #plugins: Map<string, BasePlugin> = new Map();

    constructor(workbook: Workbook) {
        this.#workbook = workbook;
    }

    static register(name: string, PluginClass: PluginClass): void {
        if (!(PluginClass.prototype instanceof BasePlugin)) {
            errorHandler.throw(ERROR_CODE.PLUGIN_INVALID_CLASS, `Plugin "${name}" must extend BasePlugin`);
        }
        PluginManager.#registry.set(name, PluginClass);
    }

    static unregister(name: string): void {
        PluginManager.#registry.delete(name);
    }

    static getRegisteredNames(): string[] {
        return Array.from(PluginManager.#registry.keys());
    }

    loadPlugin(name: string, options: Record<string, any> = {}): BasePlugin | null {
        if (this.#plugins.has(name)) {
            errorHandler.warn(ERROR_CODE.PLUGIN_ALREADY_LOADED, `Plugin "${name}" is already loaded`);
            return this.#plugins.get(name)!;
        }

        const PluginClass = PluginManager.#registry.get(name);
        if (!PluginClass) {
            errorHandler.error(ERROR_CODE.PLUGIN_NOT_REGISTERED, `Plugin "${name}" is not registered. Use PluginManager.register() first.`);
            return null;
        }

        const instance = new PluginClass(this.#workbook!);
        instance.init(options);
        this.#plugins.set(name, instance);

        return instance;
    }

    loadPluginClass(PluginClass: PluginClass, options: Record<string, any> = {}): BasePlugin {
        const name = PluginClass.PLUGIN_NAME;
        if (this.#plugins.has(name)) {
            errorHandler.warn(ERROR_CODE.PLUGIN_ALREADY_LOADED, `Plugin "${name}" is already loaded`);
            return this.#plugins.get(name)!;
        }

        const instance = new PluginClass(this.#workbook!);
        instance.init(options);
        this.#plugins.set(name, instance);

        return instance;
    }

    unloadPlugin(name: string): void {
        const plugin = this.#plugins.get(name);
        if (plugin) {
            plugin.destroy();
            this.#plugins.delete(name);
        }
    }

    getPlugin(name: string): BasePlugin | null {
        return this.#plugins.get(name) || null;
    }

    getLoadedNames(): string[] {
        return Array.from(this.#plugins.keys());
    }

    enablePlugin(name: string): void {
        const plugin = this.#plugins.get(name);
        if (plugin) {
            plugin.enable();
        }
    }

    disablePlugin(name: string): void {
        const plugin = this.#plugins.get(name);
        if (plugin) {
            plugin.disable();
        }
    }

    destroyAll(): void {
        for (const [, plugin] of this.#plugins) {
            plugin.destroy();
        }
        this.#plugins.clear();
    }

    hasPlugin(name: string): boolean {
        return this.#plugins.has(name);
    }
}
