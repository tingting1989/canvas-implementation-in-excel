export interface LogicalCellStyle {
    textAlign?: string;
    color?: string;
    backgroundColor?: string;
    fontStyle?: string;
    fontWeight?: string;
    fontSize?: string;
    [key: string]: unknown;
}

export interface LogicalCellOpts {
    layerIndex: number;
    startCol: number;
    endCol: number;
    colspan: number;
    label: string;
    style: LogicalCellStyle | null;
}

export class LogicalCell {
    layerIndex: number;
    startCol: number;
    endCol: number;
    colspan: number;
    label: string;
    style: LogicalCellStyle | null;

    get isMerged(): boolean {
        return this.colspan > 1;
    }

    crossesBoundary(boundaryCol: number): boolean {
        return this.startCol < boundaryCol && this.endCol >= boundaryCol;
    }

    constructor(opts: LogicalCellOpts) {
        this.layerIndex = opts.layerIndex;
        this.startCol = opts.startCol;
        this.endCol = opts.endCol;
        this.colspan = opts.colspan;
        this.label = opts.label;
        this.style = opts.style;
    }
}
