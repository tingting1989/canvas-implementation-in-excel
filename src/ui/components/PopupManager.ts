export class PopupManager {
    static #instance: PopupManager | null = null;
    #activePopups: Map<symbol, { hide(reason: string): void }> = new Map();
    #zIndexCounter: number = 10000;

    static getInstance(): PopupManager {
        if (!PopupManager.#instance) {
            PopupManager.#instance = new PopupManager();
        }
        return PopupManager.#instance;
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
