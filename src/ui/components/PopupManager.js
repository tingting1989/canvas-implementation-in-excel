export class PopupManager {
    static #instance = null;
    #activePopups = new Map();
    #zIndexCounter = 10000;

    static getInstance() {
        if (!PopupManager.#instance) {
            PopupManager.#instance = new PopupManager();
        }
        return PopupManager.#instance;
    }

    register(popup) {
        const id = Symbol("popup");
        this.#activePopups.set(id, popup);
        return id;
    }

    unregister(id) {
        this.#activePopups.delete(id);
    }

    getNextZIndex() {
        return ++this.#zIndexCounter;
    }

    closeAll(exceptId) {
        for (const [id, popup] of this.#activePopups) {
            if (id !== exceptId) {
                popup.hide("close-all");
            }
        }
    }
}
