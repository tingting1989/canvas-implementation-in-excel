import { Command } from "./Command.js";

export class SetCellCommand extends Command {
    constructor(store, row, col, oldCell, newCell) {
        super();
        this.store = store;
        this.row = row;
        this.col = col;
        this.oldCell = oldCell;
        this.newCell = newCell;
    }

    redo() {
        this.store.set(this.row, this.col, this.newCell);
    }

    undo() {
        if (this.oldCell) {
            this.store.set(this.row, this.col, this.oldCell);
        } else {
            this.store.delete(this.row, this.col);
        }
    }
}