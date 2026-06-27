/**
 * 表格全局常量配置
 *
 * 按功能分组：
 * - 数据规模：MAX_ROWS / MAX_COLS
 * - 默认尺寸：DEFAULT_COL_WIDTH / DEFAULT_ROW_HEIGHT / HEADER_WIDTH / HEADER_HEIGHT
 * - 瓦片分块：CHUNK_ROW_SIZE / CHUNK_COL_SIZE / TILE_SIZE / TILE_CACHE_MAX
 * - 字体：DEFAULT_FONT / DEFAULT_FONT_SIZE
 * - 选区：SELECTION_COLOR
 * - 禁用单元格：DISABLED_BG / DISABLED_COLOR
 * - 斑马纹：ZEBRA_LIGHT / ZEBRA_DARK
 * - 行列头：HEADER_BG / HEADER_HIGHLIGHT_BG / HEADER_HIGHLIGHT_COLOR
 * - 网格线：GRID_COLOR
 * - DOM 标识：CANVAS_ID / WRAP_ID
 * - 滚动条：SCROLLBAR_WIDTH / SCROLLBAR_MIN_SIZE
 * - Sheet 标签栏：SHEET_TAB_HEIGHT
 * - 列宽/行高调整：RESIZE_HIT_AREA / MIN_COL_WIDTH / MIN_ROW_HEIGHT
 */
export const CONFIG = {
    /** 最大行数（系统上限） */
    MAX_ROWS: 10000000,

    /** 最大列数（系统上限） */
    MAX_COLS: 70000,

    /** 默认初始行数（未配置 maxRows 时使用） */
    DEFAULT_START_ROWS: 100,

    /** 默认初始列数（未配置 maxCols 时使用） */
    DEFAULT_START_COLS: 26,

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

    /** 行分块大小，每个 chunk 包含的行数 */
    CHUNK_ROW_SIZE: 1024,

    /** 列分块大小，每个 chunk 包含的列数 */
    CHUNK_COL_SIZE: 256,

    /** 瓦片渲染尺寸（px），每个瓦片的正方形边长 */
    TILE_SIZE: 256,

    /** 瓦片缓存上限数量 */
    TILE_CACHE_MAX: 512,

    DPR: window.devicePixelRatio || 1,

    /** 默认字体族 */
    DEFAULT_FONT: "Segoe UI",

    /** 默认字号（px） */
    DEFAULT_FONT_SIZE: 12,

    /** 选区边框及手柄颜色 */
    SELECTION_COLOR: "#217346",

    /** 禁用单元格背景色 */
    DISABLED_BG: "#f5f5f5",

    /** 禁用单元格文字颜色 */
    DISABLED_COLOR: "#888",

    /** 斑马纹浅色行背景 */
    ZEBRA_LIGHT: "#fff",

    /** 斑马纹深色行背景 */
    ZEBRA_DARK: "#fafafa",

    /** 行列头默认背景色 */
    HEADER_BG: "#f0f0f0",

    /** 行列头选中/高亮背景色 */
    HEADER_HIGHLIGHT_BG: "#dcdcdc",

    /** 行列头选中/高亮文字颜色 */
    HEADER_HIGHLIGHT_COLOR: "#217346",

    /** 网格线颜色 */
    GRID_COLOR: "#ddd",

    /** Canvas 元素 ID */
    CANVAS_ID: "grid",

    /** Canvas 父容器 ID */
    WRAP_ID: "wrap",

    /** 滚动条轨道宽度（px） */
    SCROLLBAR_WIDTH: 14,

    /** 滚动条滑块最小尺寸（px），防止内容过多时滑块过小无法点击 */
    SCROLLBAR_MIN_SIZE: 30,

    /** Sheet 标签栏高度（px），位于 canvas 底部与水平滚动条同行 */
    SHEET_TAB_HEIGHT: 30,

    /** 列宽/行高调整的命中检测区域（px），鼠标在边框附近此范围内触发拖拽调整 */
    RESIZE_HIT_AREA: 5,

    /** 列最小宽度（px），拖拽调整列宽时不可低于此值 */
    MIN_COL_WIDTH: 30,

    /** 行最小高度（px），拖拽调整行高时不可低于此值 */
    MIN_ROW_HEIGHT: 10,

    /** 单元格文字内边距（px），左右两侧各保留此宽度 */
    CELL_PADDING: 6,

    /** 单元格文字溢出时是否显示省略号（...），设为 false 则直接裁剪 */
    TEXT_OVERFLOW_ELLIPSIS: true,

    /** 行轴标识 */
    AXIS_ROW: "row",

    /** 列轴标识 */
    AXIS_COL: "col",

    /** Sheet 名称 */
    DEFAULT_SHEET_NAME: "Sheet",
};
