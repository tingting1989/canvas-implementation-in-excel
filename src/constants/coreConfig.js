/**
 * 核心常量配置
 *
 * 数据规模、默认尺寸、瓦片分块、字体、单元格、网格线、禁用状态、斑马纹
 */
export const CORE_CONFIG = Object.freeze({
    // ═══ 数据规模 ═══

    /** 最大行数（系统上限） */
    MAX_ROWS: 10000000,

    /** 最大列数（系统上限） */
    MAX_COLS: 70000,

    /** 默认初始行数（未配置 maxRows 时使用） startRows 覆盖该值 */
    DEFAULT_START_ROWS: 1000,

    /** 默认初始列数（未配置 maxCols 时使用） startCols 覆盖该值 */
    DEFAULT_START_COLS: 26,

    // ═══ 默认尺寸 ═══

    /** 默认列宽（px） */
    DEFAULT_COL_WIDTH: 100,

    /** 默认行高（px） */
    DEFAULT_ROW_HEIGHT: 28,

    /** 行号列宽度（px） */
    HEADER_WIDTH: 46,

    /** 列号行每层高度（px），嵌套表头时每层均为此高度 */
    HEADER_HEIGHT: 28,

    /** 嵌套表头默认行数（不配置 nestedHeaders 时保持单层） */
    NESTED_HEADER_ROWS: 1,

    // ═══ 瓦片分块 ═══

    /** 行分块大小，每个 chunk 包含的行数 */
    CHUNK_ROW_SIZE: 1024,

    /** 列分块大小，每个 chunk 包含的列数 */
    CHUNK_COL_SIZE: 256,

    /** 瓦片渲染尺寸（px），每个瓦片的正方形边长 */
    TILE_SIZE: 256,

    /** 瓦片缓存上限数量 */
    TILE_CACHE_MAX: 512,

    DPR: window.devicePixelRatio || 1,

    // ═══ 字体 ═══

    /** 默认字体族（通用回退） */
    DEFAULT_FONT_FAMILY: "Segoe UI",

    /** 默认等宽字体族 */
    MONO_FONT_FAMILY: "monospace",

    /** 默认字号（px） */
    DEFAULT_FONT_SIZE: 12,

    // ═══ 单元格 ═══

    /** 单元格文字内边距（px），左右两侧各保留此宽度 */
    CELL_PADDING: 6,

    /** 单元格文字溢出时是否显示省略号（...），设为 false 则直接裁剪 */
    TEXT_OVERFLOW_ELLIPSIS: true,

    /** 单元格默认文字颜色 */
    CELL_TEXT_COLOR: "#222",

    /** 单元格默认边框颜色 */
    CELL_BORDER_COLOR: "#000",

    // ═══ 网格线 ═══

    /** 网格线颜色 */
    GRID_COLOR: "#ddd",

    /** 网格线宽度 */
    GRID_LINE_WIDTH: 1,

    // ═══ 禁用状态 ═══

    /** 禁用单元格背景色 */
    DISABLED_BG: "#f5f5f5",

    /** 禁用单元格文字颜色 */
    DISABLED_COLOR: "#888",

    // ═══ 斑马纹 ═══

    /** 斑马纹浅色行背景 */
    ZEBRA_LIGHT: "#fff",

    /** 斑马纹深色行背景 */
    ZEBRA_DARK: "#fafafa",
});
