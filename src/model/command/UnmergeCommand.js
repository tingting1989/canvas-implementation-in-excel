export class UnmergeCommand {
    constructor(manager, row, col) {
        this.manager = manager;
        this.row = row;
        this.col = col;
        this.oldMerge = null;
    }

    redo() {
        this.oldMerge = this.manager.getMerge(this.row, this.col);
        if (this.oldMerge) {
            this.manager.unmerge(this.row, this.col);
        }
    }

    undo() {
        if (this.oldMerge) {
            this.manager.merge(this.oldMerge.topRow, this.oldMerge.topCol, this.oldMerge.bottomRow, this.oldMerge.bottomCol);
        }
    }
}
