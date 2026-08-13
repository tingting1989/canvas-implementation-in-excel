/**
 * 核心常量配置
 *
 * 数据规模、默认尺寸、瓦片分块、字体、单元格、网格线、禁用状态、斑马纹
 */
export interface CoreConfig {
    // ═══ 数据规模 ═══

    /** 最大行数（系统上限） */
    readonly MAX_ROWS: 10000000;
    /** 最大列数（系统上限） */
    readonly MAX_COLS: 70000;
    /** 默认初始行数（未配置 maxRows 时使用） startRows 覆盖该值 */
    readonly DEFAULT_START_ROWS: 1000;
    /** 默认初始列数（未配置 maxCols 时使用） startCols 覆盖该值 */
    readonly DEFAULT_START_COLS: 26;

    // ═══ 默认尺寸 ═══

    /** 默认列宽（px） */
    readonly DEFAULT_COL_WIDTH: 100;
    /** 默认行高（px） */
    readonly DEFAULT_ROW_HEIGHT: 28;
    /** 行号列宽度（px） */
    readonly HEADER_WIDTH: 46;
    /** 列号行每层高度（px），嵌套表头时每层均为此高度 */
    readonly HEADER_HEIGHT: 28;
    /** 嵌套表头默认行数（不配置 nestedHeaders 时保持单层） */
    readonly NESTED_HEADER_ROWS: 1;

    // ═══ 瓦片分块 ═══

    /** 行分块大小，每个 chunk 包含的行数 */
    readonly CHUNK_ROW_SIZE: 1024;
    /** 列分块大小，每个 chunk 包含的列数 */
    readonly CHUNK_COL_SIZE: 256;
    /** 瓦片渲染尺寸（px），每个瓦片的正方形边长 */
    readonly TILE_SIZE: 256;
    /** 瓦片缓存上限数量 */
    readonly TILE_CACHE_MAX: 512;
    /** 设备像素比 */
    readonly DPR: number;

    // ═══ 字体 ═══

    /** 默认字体族（通用回退） */
    readonly DEFAULT_FONT_FAMILY: "Microsoft YaHei";
    /** 默认等宽字体族 */
    readonly MONO_FONT_FAMILY: "monospace";
    /** 默认字号（px） */
    readonly DEFAULT_FONT_SIZE: 14;

    // ═══ 单元格 ═══

    /** 单元格文字内边距（px），左右两侧各保留此宽度 */
    readonly CELL_PADDING: 6;
    /** 单元格文字溢出时是否显示省略号（...），设为 false 则直接裁剪 */
    readonly TEXT_OVERFLOW_ELLIPSIS: true;
    /** 单元格默认文字颜色 */
    readonly CELL_TEXT_COLOR: "#000";
    /** 单元格默认边框颜色 */
    readonly CELL_BORDER_COLOR: "#000";

    // ═══ 网格线 ═══

    /** 网格线颜色 */
    readonly GRID_COLOR: "#ddd";
    /** 网格线宽度 */
    readonly GRID_LINE_WIDTH: 1;

    // ═══ 禁用状态 ═══

    /** 禁用单元格背景色 */
    readonly DISABLED_BG: "#f5f5f5";
    /** 禁用单元格文字颜色 */
    readonly DISABLED_COLOR: "#888";

    // ═══ 斑马纹 ═══

    /** 斑马纹浅色行背景 */
    readonly ZEBRA_LIGHT: "#fff";
    /** 斑马纹深色行背景 */
    readonly ZEBRA_DARK: "#fafafa";
}

export const CORE_CONFIG: CoreConfig = Object.freeze({
    MAX_ROWS: 10000000,
    MAX_COLS: 70000,
    DEFAULT_START_ROWS: 1000,
    DEFAULT_START_COLS: 26,

    DEFAULT_COL_WIDTH: 100,
    DEFAULT_ROW_HEIGHT: 28,
    HEADER_WIDTH: 46,
    HEADER_HEIGHT: 28,
    NESTED_HEADER_ROWS: 1,

    CHUNK_ROW_SIZE: 1024,
    CHUNK_COL_SIZE: 256,
    TILE_SIZE: 256,
    TILE_CACHE_MAX: 512,
    DPR: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,

    DEFAULT_FONT_FAMILY: "Microsoft YaHei",
    MONO_FONT_FAMILY: "monospace",
    DEFAULT_FONT_SIZE: 14,

    CELL_PADDING: 6,
    TEXT_OVERFLOW_ELLIPSIS: true,
    CELL_TEXT_COLOR: "#000",
    CELL_BORDER_COLOR: "#000",

    GRID_COLOR: "#ddd",
    GRID_LINE_WIDTH: 1,

    DISABLED_BG: "#f5f5f5",
    DISABLED_COLOR: "#888",

    ZEBRA_LIGHT: "#fff",
    ZEBRA_DARK: "#fafafa",
});
