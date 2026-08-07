export interface CellCoordinate {
    row: number;
    col: number;
}

export interface CellRange {
    start: CellCoordinate;
    end: CellCoordinate;
}

export type CellValue = string | number | boolean | null | undefined;

export interface CellStyle {
    font?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
    backgroundColor?: string;
    textAlign?: "left" | "center" | "right";
    verticalAlign?: "top" | "middle" | "bottom";
}

export type EventType = string;

export type EventCallback<T = any> = (data: T) => void;

export interface CellData {
    value: CellValue;
    displayValue?: string;
    style?: CellStyle;
    formula?: string;
    isMerged?: boolean;
}