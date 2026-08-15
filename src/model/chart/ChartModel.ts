import { CHART_TYPE } from "../../constants/enums/ChartType.js";
import type { Rect } from "../types";

/**
 * @static @private 静态私有常量 - 默认系列颜色数组（9色）
 *
 * 当用户未指定自定义颜色时，图表系列按此数组顺序取色。
 */
const DEFAULT_COLORS: string[] = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc"];

/**
 * 数据范围
 *
 * 描述图表关联的单元格区域，使用行列号表示矩形范围。
 */
interface DataRange {
    /** 起始行号（0-based，含） */
    startRow: number;
    /** 起始列号（0-based，含） */
    startCol: number;
    /** 结束行号（0-based，含） */
    endRow: number;
    /** 结束列号（0-based，含） */
    endCol: number;
}

/**
 * 图表样式配置
 *
 * 控制图表的视觉呈现，包括标题、图例、网格、颜色等。
 * 部分字段仅对特定图表类型生效（如 smooth 仅对折线图有效）。
 */
interface ChartStyle {
    /** 图表标题文本 */
    title?: string;
    /** 是否显示图例 */
    showLegend?: boolean;
    /** 是否显示网格线 */
    showGrid?: boolean;
    /** 是否启用悬浮提示 */
    showTooltip?: boolean;
    /** 系列颜色数组，覆盖默认配色 */
    colors?: string[];
    /** 是否忽略隐藏行/列中的数据 */
    ignoreHiddenData?: boolean;
    /** 是否填充区域面积（面积图类型） */
    fill?: boolean;
    /** 是否使用平滑曲线（折线图类型） */
    smooth?: boolean;
    /** X 轴标签文本 */
    xAxisLabel?: string;
    /** Y 轴标签文本 */
    yAxisLabel?: string;
    /** Y 轴最小值 */
    min?: number;
    /** Y 轴最大值 */
    max?: number;
    /** 指标线配置数组 */
    indicators?: unknown[];
}

/**
 * 边界矩形（语义化别名）
 *
 * 复用 Rect 类型，用于描述图表在视口中的位置和尺寸。
 */
type Bounds = Rect;

/**
 * 图表模型配置选项
 *
 * 构造 ChartModel 时传入的可选配置，所有字段均有默认值。
 */
interface ChartModelOptions {
    /** 图表唯一标识，未指定时自动生成 UUID */
    id?: string;
    /** 图表类型标识符，默认为柱状图 */
    type?: string;
    /** 锚定行号，默认 0 */
    anchorRow?: number;
    /** 锚定列号，默认 0 */
    anchorCol?: number;
    /** 相对锚单元格的 X 像素偏移，默认 0 */
    offsetX?: number;
    /** 相对锚单元格的 Y 像素偏移，默认 0 */
    offsetY?: number;
    /** 图表宽度(px)，默认 400 */
    width?: number;
    /** 图表高度(px)，默认 300 */
    height?: number;
    /** 图表关联的数据范围，默认 null（无数据） */
    dataRange?: DataRange | null;
    /** 图表样式配置 */
    style?: ChartStyle;
}

/**
 * 图表数据模型
 *
 * 存储图表的所有配置信息，包括位置、尺寸、样式等。
 * 每个图表实例对应一个 ChartModel 对象。
 * 支持序列化/反序列化（toJSON / fromJSON）以及视口坐标计算。
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
    /** 图表样式配置（含必填默认值与可选扩展） */
    style: Required<Pick<ChartStyle, "title" | "showLegend" | "showGrid" | "colors" | "ignoreHiddenData" | "showTooltip">> & ChartStyle;
    /**
     * @private 私有字段 - 缓存的图表计算数据
     *
     * 渲染引擎计算后的中间数据缓存，避免重复计算。
     * 当数据源或样式变更时需配合 _cacheVersion 做失效判断。
     */
    _cachedData: unknown | null;
    /**
     * @private 私有字段 - 缓存版本号
     *
     * 每次数据源变更时递增，渲染引擎据此判断缓存是否过期。
     * 初始值为 -1，表示尚未计算。
     */
    _cacheVersion: number;

    /**
     * 构造图表数据模型
     *
     * 未指定的字段将使用合理的默认值：
     * - id: 自动生成 UUID
     * - type: 柱状图 (CHART_TYPE.BAR)
     * - 位置/偏移: 0
     * - 尺寸: 400×300
     * - style: 合并默认样式与用户传入样式
     *
     * @param options - 图表配置选项，所有字段均可选
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
        // 默认样式与用户样式浅合并，确保必填字段始终有值
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
     *
     * 若提供 viewport 参数，则根据锚单元格的视口坐标加上偏移量计算绝对位置；
     * 否则仅返回偏移量 + 尺寸的相对矩形。
     *
     * @param viewport - 视口对象，需提供 colToViewX / rowToViewY 方法；传 null 或 undefined 则忽略锚点
     * @returns 边界矩形 { x, y, w, h }
     */
    getBounds(viewport?: { colToViewX: (col: number) => number; rowToViewY: (row: number) => number } | null): Bounds {
        if (!viewport) {
            // 无视口时返回相对偏移矩形
            return { x: this.offsetX, y: this.offsetY, w: this.width, h: this.height };
        }
        // 有视口时：锚单元格视口坐标 + 偏移 = 绝对位置
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
     *
     * 用于点击检测（hit testing），判断鼠标/触摸坐标是否落在图表区域内。
     *
     * @param px - 点的 X 坐标（视口像素）
     * @param py - 点的 Y 坐标（视口像素）
     * @param viewport - 视口对象；传 null 或 undefined 则使用相对偏移矩形
     * @returns 点在图表边界内返回 true，否则返回 false
     */
    containsPoint(px: number, py: number, viewport?: { colToViewX: (col: number) => number; rowToViewY: (row: number) => number } | null): boolean {
        const b = this.getBounds(viewport);
        return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
    }

    /**
     * 将图表模型序列化为纯 JSON 对象
     *
     * 输出对象不包含内部缓存字段（_cachedData / _cacheVersion），
     * 可安全用于持久化存储或跨上下文传输。
     *
     * @returns 可 JSON.stringify 的纯对象
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
     * @static 静态公共方法 - 从 JSON 对象反序列化创建 ChartModel 实例
     *
     * 与 toJSON() 配对使用，将序列化后的纯对象还原为 ChartModel 实例。
     *
     * @param json - 由 toJSON() 生成的序列化对象
     * @returns 还原后的 ChartModel 实例
     */
    static fromJSON(json: ChartModelOptions & { id?: string }): ChartModel {
        return new ChartModel(json);
    }
}

export type { DataRange, ChartStyle, Bounds, ChartModelOptions };
