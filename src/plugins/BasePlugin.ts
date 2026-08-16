import { errorHandler } from "../core/ErrorHandler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";

type Workbook = import("../workbook/Workbook.js").Workbook;
type EventStrategy = import("../editor/strategies/EventStrategy.js").EventStrategy;

interface HookRef {
    hookName: string;
    callback: (...args: any[]) => any;
}

interface DOMEventRef {
    target: EventTarget;
    eventType: string;
    handler: EventListener;
    options?: AddEventListenerOptions | boolean;
}

export class BasePlugin {
    #workbook: Workbook | null = null;
    #initialized: boolean = false;
    #enabled: boolean = true;
    #options: Record<string, any> = {};
    #registeredHooks: HookRef[] = [];
    #registeredStrategies: string[] = [];
    #registeredDOMEvents: DOMEventRef[] = [];

    constructor(workbook: Workbook) {
        this.#workbook = workbook;
    }

    static get PLUGIN_NAME(): string {
        errorHandler.throw(ERROR_CODE.PLUGIN_ABSTRACT_METHOD, "PLUGIN_NAME must be overridden in subclass");
        return "";
    }

    get workbook(): Workbook | null {
        return this.#workbook;
    }

    get sheet(): any {
        return this.#workbook?.activeSheet;
    }

    get renderEngine(): any {
        return this.#workbook?.renderEngine;
    }

    get eventHandler(): any {
        return this.#workbook?.eventHandler;
    }

    get editor(): any {
        return this.#workbook?.editor;
    }

    get hooks(): any {
        return this.#workbook?.eventHandler?.hooks;
    }

    get clipboard(): any {
        return this.#workbook?.clipboard;
    }

    get options(): Record<string, any> {
        return this.#options;
    }

    get initialized(): boolean {
        return this.#initialized;
    }

    get enabled(): boolean {
        return this.#enabled;
    }

    init(options: Record<string, any> = {}): void {
        this.#options = options;
        this.#initialized = true;
    }

    destroy(): void {
        this.clearOwnHooks();
        this.removeOwnStrategies();
        this.removeOwnDOMEvents();
        this.#initialized = false;
        this.#enabled = false;
    }

    enable(): void {
        this.#enabled = true;
    }

    disable(): void {
        this.#enabled = false;
    }

    addHook(hookName: string, callback: (...args: any[]) => any): void {
        const guardedCallback = (...args: any[]): any => {
            if (!this.#enabled) return;
            return callback(...args);
        };
        this.hooks?.addHook(hookName, guardedCallback);
        this.#registeredHooks.push({ hookName, callback: guardedCallback });
    }

    addHookOnce(hookName: string, callback: (...args: any[]) => any): void {
        let fired = false;
        let onceCallback: ((...args: any[]) => any) | null = null;
        onceCallback = (...args: any[]): any => {
            if (fired) return;
            fired = true;
            if (!this.#enabled) return;
            const result = callback(...args);
            this.hooks?.removeHook(hookName, onceCallback);
            this.#registeredHooks = this.#registeredHooks.filter((h) => h.callback !== onceCallback);
            return result;
        };
        this.hooks?.addHook(hookName, onceCallback);
        this.#registeredHooks.push({ hookName, callback: onceCallback });
    }

    clearOwnHooks(): void {
        for (const { hookName, callback } of this.#registeredHooks) {
            this.hooks?.removeHook(hookName, callback);
        }
        this.#registeredHooks = [];
    }

    addStrategy(name: string, strategy: EventStrategy): void {
        this.eventHandler?.addStrategy(name, strategy);
        this.#registeredStrategies.push(name);
    }

    removeOwnStrategies(): void {
        for (const name of this.#registeredStrategies) {
            this.eventHandler?.removeStrategy(name);
        }
        this.#registeredStrategies = [];
    }

    addDOMEvent(target: EventTarget, eventType: string, handler: EventListener, options?: AddEventListenerOptions | boolean): void {
        target.addEventListener(eventType, handler, options);
        this.#registeredDOMEvents.push({ target, eventType, handler, options });
    }

    removeOwnDOMEvents(): void {
        for (const { target, eventType, handler, options } of this.#registeredDOMEvents) {
            target.removeEventListener(eventType, handler, options);
        }
        this.#registeredDOMEvents = [];
    }

    render(): void {
        this.#workbook?.render();
    }

    getPlugin(pluginName: string): BasePlugin | null {
        return this.#workbook?.getPlugin(pluginName) || null;
    }
}
