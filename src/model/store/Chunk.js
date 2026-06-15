export class Chunk {
    constructor(rowStart, colStart) {
        this.rowStart = rowStart;
        this.colStart = colStart;
        this.cells = new Map();
    }

    #key(row, col) {
        return `${row - this.rowStart}:${col - this.colStart}`;
    }

    get(row, col) {
        return this.cells.get(this.#key(row, col));
    }

    set(row, col, cell) {
        this.cells.set(this.#key(row, col), cell);
    }

    delete(row, col) {
        this.cells.delete(this.#key(row, col));
    }

    *iterate() {
        for (const [key, cell] of this.cells) {
            const [rowOffset, colOffset] = key.split(":").map(Number);
            yield {
                row: this.rowStart + rowOffset,
                col: this.colStart + colOffset,
                cell,
            };
        }
    }
}
