export class StyleChangeRecorder {
    #changes = [];

    record(type, key, oldStyleId, newStyleId) {
        this.#changes.push({ type, key, oldStyleId, newStyleId });
    }

    buildCommand(styleManager) {
        if (this.#changes.length === 0) return null;
        const cmd = new StyleChangeCommand(styleManager, [...this.#changes]);
        this.#changes = [];
        return cmd;
    }

    reset() {
        this.#changes = [];
    }

    get size() {
        return this.#changes.length;
    }
}

export class StyleChangeCommand {
    #styleManager;
    #changes;

    constructor(styleManager, changes) {
        this.#styleManager = styleManager;
        this.#changes = changes;
    }

    redo() {
        for (const { type, key, newStyleId } of this.#changes) {
            this.#styleManager.applyStyleId(type, key, newStyleId);
        }
    }

    undo() {
        for (let i = this.#changes.length - 1; i >= 0; i--) {
            const { type, key, oldStyleId } = this.#changes[i];
            this.#styleManager.applyStyleId(type, key, oldStyleId);
        }
    }
}
