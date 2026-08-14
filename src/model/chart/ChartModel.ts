import { CHART_TYPE } from "../../constants/enums/ChartType.js";
import type { Rect } from "../types";

/** 默认系列颜色数组（9色） */
const DEFAULT_COLORS: string[] = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc"];

/** 数据范围 */
interface DataRange {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}

/** 图表样式配置 */
interface ChartStyle {
    title?: string;
    showLegend?: boolean;
    showGrid?: boolean;
    showTooltip?: boolean;
    colors?: string[];
    ignoreHiddenData?: boolean;
    fill?: boolean;
    smooth?: boolean;
    xAxisLabel?: string;
    yAxisLabel?: string;
    min?: number;
    max?: number;
    indicators?: unknown[];
}

/** 边界矩形（别名，语义化） */
type Bounds = Rect;

/** 图表模型配置选项 */
interface ChartModelOptions {
    id?: string;
    type?: string;
    anchorRow?: number;
    anchorCol?: number;
    offsetX?: number;
    offsetY?: number;
    width?: number;
    height?: number;
    dataRange?: DataRange | null;
    style?: ChartStyle;
}

/**
 * 图表数据模型 (Chart Model)
 *
 * 存储图表的所有配置信息，包括位置、尺寸、样式等。
 * 每个图表实例对应一个 ChartModel 对象。
 *
 * @class ChartModel
 */
export class ChartModel {
    /** 图表唯一标识 */
    id: string;
    /** 图表类型标识符 */
    type: string;
    /** 锚定行号 */
    anchorRow: number;
    /** 锚定列号 */
    anchorCol: number;
    /** 相对锚单元格的 X 像素偏移 */
    offsetX: number;
    /** 相对锚单元格的 Y 像素偏移 */
    offsetY: number;
    /** 图表宽度(px) */
    width: number;
    /** 图表高度(px) */
    height: number;
    /** 图表关联的数据范围 */
    dataRange: DataRange | null;
    /** 图表样式配置 */
    style: Required<Pick<ChartStyle, "title" | "showLegend" | "showGrid" | "colors" | "ignoreHiddenData" | "showTooltip">> & ChartStyle;
    /** 缓存的图表计算数据 */
    _cachedData: unknown | null;
    /** 缓存版本号 */
    _cacheVersion: number;

    /**
     * 构造图表数据模型
     * @param options - 图表配置选项
     */
    constructor(options: ChartModelOptions = {}) {
        this.id = options.id || crypto.randomUUID();
        this.type = options.type || CHART_TYPE.BAR;
        this.anchorRow = options.anchorRow ?? 0;
        this.anchorCol = options.anchorCol ?? 0;
        this.offsetX = options.offsetX ?? 0;
        this.offsetY = options.offsetY ?? 0;
        this.width = options.width ?? 400;
        this.height = options.height ?? 300;
        this.dataRange = options.dataRange || null;
        this.style = {
            title: "",
            showLegend: true,
            showGrid: true,
            colors: [...DEFAULT_COLORS],
            ignoreHiddenData: false,
            showTooltip: true,
            ...options.style,
        } as any;
        this._cachedData = null;
        this._cacheVersion = -1;
    }

    /**
     * 计算图表在视口中的边界矩形
     * @param viewport - 视口对象，需提供 colToViewX / rowToViewY 方法
     * @returns 边界矩形
     */
    getBounds(viewport?: { colToViewX: (col: number) => number; rowToViewY: (row: number) => number } | null): Bounds {
        if (!viewport) {
            return { x: this.offsetX, y: this.offsetY, w: this.width, h: this.height };
        }
        const anchorX = viewport.colToViewX(this.anchorCol);
        const anchorY = viewport.rowToViewY(this.anchorRow);
        return {
            x: anchorX + this.offsetX,
            y: anchorY + this.offsetY,
            w: this.width,
            h: this.height,
        };
    }

    /**
     * 判断指定点是否在图表边界矩形内
     * @param px - 点的 X 坐标
     * @param py - 点的 Y 坐标
     * @param viewport - 视口对象
     */
    containsPoint(px: number, py: number, viewport?: { colToViewX: (col: number) => number; rowToViewY: (row: number) => number } | null): boolean {
        const b = this.getBounds(viewport);
        return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
    }

    /**
     * 将图表模型序列化为纯 JSON 对象
     */
    toJSON(): Record<string, unknown> {
        return {
            id: this.id,
            type: this.type,
            anchorRow: this.anchorRow,
            anchorCol: this.anchorCol,
            offsetX: this.offsetX,
            offsetY: this.offsetY,
            width: this.width,
            height: this.height,
            dataRange: this.dataRange,
            style: { ...this.style },
        };
    }

    /**
     * 从 JSON 对象反序列化创建 ChartModel 实例
     * @param json - 由 toJSON() 生成的序列化对象
     */
    static fromJSON(json: ChartModelOptions & { id?: string }): ChartModel {
        return new ChartModel(json);
    }
}

export type { DataRange, ChartStyle, Bounds, ChartModelOptions };
