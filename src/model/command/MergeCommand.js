export class MergeCommand {
    constructor(manager, topRow, topCol, bottomRow, bottomCol) {
        this.manager = manager;
        this.topRow = topRow;
        this.topCol = topCol;
        this.bottomRow = bottomRow;
        this.bottomCol = bottomCol;
        this.succeeded = false;
    }

    redo() {
        this.succeeded = this.manager.merge(
            this.topRow,
            this.topCol,
            this.bottomRow,
            this.bottomCol
        );
    }

    undo() {
        if (this.succeeded) {
            this.manager.unmerge(this.topRow, this.topCol);
        }
    }
}