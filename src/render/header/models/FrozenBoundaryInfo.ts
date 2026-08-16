import type { LogicalCell } from "./LogicalCell.js";

export interface FrozenBoundaryInfoOpts {
    fixedCols: number;
    fixedRows: number;
}

export class FrozenBoundaryInfo {
    fixedCols: number;
    fixedRows: number;

    get hasHorizontalBoundary(): boolean {
        return this.fixedCols > 0;
    }

    get hasVerticalBoundary(): boolean {
        return this.fixedRows > 0;
    }

    splitsCellHorizontally(cell: LogicalCell): boolean {
        return this.hasHorizontalBoundary && cell.crossesBoundary(this.fixedCols);
    }

    splitsCellVertically(cell: LogicalCell): boolean {
        return this.hasVerticalBoundary && cell.crossesBoundary(this.fixedRows);
    }

    constructor(opts: FrozenBoundaryInfoOpts) {
        this.fixedCols = opts.fixedCols;
        this.fixedRows = opts.fixedRows;
    }
}
