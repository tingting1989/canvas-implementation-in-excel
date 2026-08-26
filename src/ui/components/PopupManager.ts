export class PopupManager {
    static #instances: Map<string, PopupManager> = new Map();
    #activePopups: Map<symbol, { hide(reason: string): void }> = new Map();
    #zIndexCounter: number = 10000;
    #workbookId: string;

    static getInstance(workbookId?: string): PopupManager {
        const key = workbookId || "__global__";
        let instance = PopupManager.#instances.get(key);
        if (!instance) {
            instance = new PopupManager(key);
            PopupManager.#instances.set(key, instance);
        }
        return instance;
    }

    static removeInstance(workbookId: string): void {
        const instance = PopupManager.#instances.get(workbookId);
        if (instance) {
            instance.closeAll();
            PopupManager.#instances.delete(workbookId);
        }
    }

    private constructor(workbookId: string) {
        this.#workbookId = workbookId;
    }

    get workbookId(): string {
        return this.#workbookId;
    }

    register(popup: { hide(reason: string): void }): symbol {
        const id = Symbol("popup");
        this.#activePopups.set(id, popup);
        return id;
    }

    unregister(id: symbol): void {
        this.#activePopups.delete(id);
    }

    getNextZIndex(): number {
        return ++this.#zIndexCounter;
    }

    closeAll(exceptId?: symbol): void {
        for (const [id, popup] of this.#activePopups) {
            if (id !== exceptId) {
                popup.hide("close-all");
            }
        }
    }
}
