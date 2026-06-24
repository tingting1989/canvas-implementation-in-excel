export class EventBus {
    #listeners = new Map();

    on(event, listener) {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, []);
        }
        this.#listeners.get(event).push(listener);
        return () => this.off(event, listener);
    }

    once(event, listener) {
        const unsubscribe = this.on(event, (...args) => {
            listener(...args);
            unsubscribe();
        });
        return unsubscribe;
    }

    off(event, listener) {
        const list = this.#listeners.get(event);
        if (!list) return;
        const idx = list.indexOf(listener);
        if (idx > -1) list.splice(idx, 1);
        
    }

    emit(event, ...args) {
        const list = this.#listeners.get(event);
        if (!list) return undefined;
        const snapshot = [...list];
        let result;
        for (const fn of snapshot) {
            const ret = fn(...args);
            if (ret !== undefined) result = ret;
        }
        return result;
    }

    removeAll() {
        this.#listeners.clear();
    }

    listenerCount(event) {
        return this.#listeners.get(event)?.length ?? 0;
    }

    eventNames() {
        return [...this.#listeners.keys()];
    }
}