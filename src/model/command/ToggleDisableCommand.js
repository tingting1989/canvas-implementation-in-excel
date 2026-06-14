import { Command } from "./Command.js";

export class ToggleDisableCommand extends Command {
    constructor(store, row, col, oldState) {
        super();
        this.store = store;
        this.row = row;
        this.col = col;
        this.oldState = oldState;
    }

    redo() {
        const cell = this.store.get(this.row, this.col);
        if (cell) cell.disabled = !this.oldState;
    }

    undo() {
        const cell = this.store.get(this.row, this.col);
        if (cell) cell.disabled = this.oldState;
    }
}