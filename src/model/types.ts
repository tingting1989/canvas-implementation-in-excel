/** 像素矩形区域（位置 + 尺寸） */
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** 矩形单元格范围（行列坐标） */
export interface CellRange {
    topRow: number;
    topCol: number;
    bottomRow: number;
    bottomCol: number;
}

/** 合并区域信息（扩展自 CellRange，含跨行跨列数） */
export interface MergeInfo extends CellRange {
    rowSpan: number;
    colSpan: number;
}
