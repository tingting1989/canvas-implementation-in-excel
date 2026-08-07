export interface CellCoordinate {
    row: number;
    col: number;
}

export interface CellRange {
    start: CellCoordinate;
    end: CellCoordinate;
}

export type CellValue = string | number | boolean | null | undefined;

export interface StyleObject {
    fontWeight?: string;
    color?: string;
    backgroundColor?: string;
    textAlign?: "left" | "center" | "right";
    verticalAlign?: "top" | "middle" | "bottom";
    fontSize?: number;
    fontFamily?: string;
    italic?: boolean;
    underline?: boolean;
    rotation?: number;
}

export type EventType = string;

export type EventCallback<T = any> = (data: T) => void;

export interface CellData {
    value: CellValue;
    displayValue?: string;
    style?: StyleObject;
    formula?: string;
    isMerged?: boolean;
}

export interface MergeRange {
    topRow: number;
    topCol: number;
    bottomRow: number;
    bottomCol: number;
}

export interface EventEnvelope<T = any> {
    source: string;
    sheetId: string;
    timestamp: number;
    type: string;
    payload: T;
}

export interface ColumnConfig {
    type?: string;
    defaultValue?: unknown;
    options?: Record<string, unknown>;
    readOnly?: boolean;
    width?: number;
}

export interface CellConfigItem {
    row: number;
    col: number;
    style?: StyleObject;
    type?: string;
}

export interface WorkbookOptions {
    data?: Array<Array<unknown>>;
    sheetName?: string;
    colHeaders?: true | string[] | ((col: number) => string);
    rowHeaders?: true | string[] | ((row: number) => string);
    width?: number;
    height?: number;
    rowHeights?: number | number[];
    startRows?: number;
    startCols?: number;
    plugins?: string[];
    pluginOptions?: Record<string, unknown>;
    hooks?: Record<string, (...args: unknown[]) => unknown>;
    mergeCells?: Array<{
        row: number;
        col: number;
        rowspan: number;
        colspan: number;
    }>;
    conditionalStyles?: Array<{
        range: MergeRange;
        condition: (...args: unknown[]) => boolean;
        style: StyleObject;
    }>;
    cell?: Array<{
        row: number;
        col: number;
        style?: StyleObject;
        type?: string;
    }>;
    cells?: (row: number, col: number) => Partial<CellConfigItem>;
    columns?: Array<ColumnConfig | ((col: number) => ColumnConfig)>;
    afterInit?: () => void;
    autoInit?: boolean;
    defaultStyle?: StyleObject;
}