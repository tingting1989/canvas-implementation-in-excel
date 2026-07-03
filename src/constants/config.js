/**
 * 表格全局常量配置
 *
 * 按功能分组管理，便于查找和维护。
 * 每组以 `// ═══ 分组名 ═══` 格式分隔。
 */
export const CONFIG = Object.freeze({

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

    /** 默认字体族（UI 主字体） */
    DEFAULT_FONT: "Segoe UI",

    /** 默认字体族（通用回退） */
    DEFAULT_FONT_FAMILY: "sans-serif",

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

    // ═══ 行列头 ═══

    /** 行列头默认背景色 */
    HEADER_BG: "#f0f0f0",

    /** 行列头选中/高亮背景色 */
    HEADER_HIGHLIGHT_BG: "#dcdcdc",

    /** 行列头选中/高亮文字颜色 */
    HEADER_HIGHLIGHT_COLOR: "#217346",

    /** 普通表头文字颜色 */
    HEADER_TEXT_COLOR: "#555",

    /** 表头边框颜色，需与 HEADER_BG 有足够对比度 */
    HEADER_BORDER_COLOR: "#c8c8c8",

    // ═══ 选区与交互 ═══

    /** 选区边框及手柄颜色 */
    SELECTION_COLOR: "#217346",

    /** 选区线宽度 */
    SELECTION_LINE_WIDTH: 2,

    /** 选区高亮范围填充色（极低透明度） */
    RANGE_HIGHLIGHT_FILL: "rgba(76, 139, 245, 0.08)",

    /** 选区行列头高亮填充色（中等透明度） */
    HEADER_HIGHLIGHT_FILL: "rgba(76, 139, 245, 0.18)",

    /** 活动单元格高亮填充色 */
    ACTIVE_CELL_HIGHLIGHT_FILL: "rgba(76, 139, 245, 0.12)",

    /** 交互层 hover 填充色 */
    INTERACTION_HOVER_FILL: "rgba(76, 139, 245, 0.06)",

    /** 错误提示填充色 */
    ERROR_HIGHLIGHT_FILL: "rgba(255, 0, 0, 0.8)",

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

    // ═══ 拖拽 ═══

    /** 拖拽源行头/列头的半透明高亮色 */
    MOVE_SOURCE_FILL: "rgba(76, 139, 245, 0.3)",

    /** 拖拽 ghost 填充色 */
    GHOST_FILL: "rgba(76, 139, 245, 0.15)",

    /** Ghost 文字颜色 */
    GHOST_TEXT_COLOR: "#fff",

    // ═══ 滚动条 ═══

    /** 滚动条轨道宽度（px） */
    SCROLLBAR_WIDTH: 14,

    /** 滚动条滑块最小尺寸（px），防止内容过多时滑块过小无法点击 */
    SCROLLBAR_MIN_SIZE: 30,

    // ═══ Sheet 标签栏 ═══

    /** Sheet 标签栏高度（px），位于 canvas 底部与水平滚动条同行 */
    SHEET_TAB_HEIGHT: 28,

    /** Sheet 名称 */
    DEFAULT_SHEET_NAME: "Sheet",

    // ═══ 列宽/行高调整 ═══

    /** 列宽/行高调整的命中检测区域（px），鼠标在边框附近此范围内触发拖拽调整 */
    RESIZE_HIT_AREA: 5,

    /** 列最小宽度（px），拖拽调整列宽时不可低于此值 */
    MIN_COL_WIDTH: 30,

    /** 行最小高度（px），拖拽调整行高时不可低于此值 */
    MIN_ROW_HEIGHT: 10,

    // ═══ DOM 标识 ═══

    /** Canvas 元素 ID */
    CANVAS_ID: "grid",

    /** Canvas 父容器 ID */
    WRAP_ID: "wrap",

    // ═══ 轴标识 ═══

    /** 行轴标识 */
    AXIS_ROW: "row",

    /** 列轴标识 */
    AXIS_COL: "col",

    // ═══ 图表 ═══

    /** 图表字体族 */
    CHART_FONT_FAMILY: "sans-serif",

    /** 图表字号（px） */
    CHART_FONT_SIZE: 11,

    /** 图表默认文字颜色 */
    CHART_TEXT_COLOR: "#333",

    /** 图表网格线颜色 */
    CHART_GRID_COLOR: "#e0e0e0",

    /** 图表网格线宽度 */
    CHART_GRID_LINE_WIDTH: 0.5,

    /** 图表轴线颜色 */
    CHART_AXIS_COLOR: "#666",

    /** 图表轴线宽度 */
    CHART_AXIS_LINE_WIDTH: 1,

    /** 图表 tooltip 边框颜色 */
    CHART_TOOLTIP_BORDER: "#fff",

    /** 图表 tooltip 边框宽度 */
    CHART_TOOLTIP_BORDER_WIDTH: 2,

    /** 图表柱状图边框颜色 */
    CHART_BAR_BORDER_COLOR: "rgba(0,0,0,0.15)",

    /** 图表面积图线宽 */
    CHART_AREA_LINE_WIDTH: 2,

    /** 图表散点图点半径 */
    CHART_SCATTER_DOT_RADIUS: 4,

    /** 图表图例字号（px） */
    CHART_LEGEND_FONT_SIZE: 11,

    /** 图表图例色块尺寸 */
    CHART_LEGEND_ITEM_SIZE: 12,

    /** 图表图例色块间距 */
    CHART_LEGEND_ITEM_WIDTH: 80,

    /** 图表图例偏移量 */
    CHART_LEGEND_OFFSET_Y: 24,

    // ═══ 图表选择 ═══

    /** 图表选择边框颜色 */
    CHART_SELECTION_BORDER_COLOR: "#217346",

    /** 图表选择边框线宽 */
    CHART_SELECTION_BORDER_WIDTH: 2,

    /** 图表选择手柄大小 */
    CHART_SELECTION_HANDLE_SIZE: 6,

    /** 图表选择手柄线宽 */
    CHART_SELECTION_HANDLE_LINE_WIDTH: 1.5,

    /** 图表选择手柄填充色 */
    CHART_SELECTION_HANDLE_FILL: "#fff",

    // ═══ 排序 ═══

    /** 排序指示器活跃色 */
    SORT_ACTIVE_COLOR: "#1890ff",

    /** 排序指示器非活跃色 */
    SORT_INACTIVE_COLOR: "#bfbfbf",

    /** 排序列高亮填充色 */
    SORT_COLUMN_HIGHLIGHT_FILL: "rgba(24, 144, 255, 0.08)",

    /** 排序指示器箭头大小 */
    SORT_ARROW_SIZE: 8,

    /** 排序指示器箭头内边距 */
    SORT_ARROW_PADDING: 4,

    /** 排序指示器箭头线宽 */
    SORT_ARROW_LINE_WIDTH: 2,

    // ═══ 进度条 ═══

    /** 进度条背景轨道颜色 */
    PROGRESS_BAR_TRACK_COLOR: "#e0e0e0",

    /** 进度条低百分比颜色 */
    PROGRESS_BAR_LOW_COLOR: "#f44336",

    /** 进度条中百分比颜色 */
    PROGRESS_BAR_MEDIUM_COLOR: "#ff9800",

    /** 进度条高百分比颜色 */
    PROGRESS_BAR_HIGH_COLOR: "#4caf50",

    /** 进度条文字字号（px） */
    PROGRESS_BAR_FONT_SIZE: 11,

    // ═══ 迷你图 ═══

    /** 迷你图折线默认颜色 */
    SPARKLINE_LINE_COLOR: "#2196f3",

    /** 迷你图折线默认填充色 */
    SPARKLINE_FILL_COLOR: "rgba(33,150,243,0.2)",

    /** 迷你图柱状图默认颜色 */
    SPARKLINE_BAR_COLOR: "#4caf50",

    /** 迷你图默认线宽 */
    SPARKLINE_LINE_WIDTH: 1.5,

    // ═══ 星级评分 ═══

    /** 星级评分默认填充色 */
    STAR_RATING_FILLED_COLOR: "#ffc107",

    /** 星级评分默认空星色 */
    STAR_RATING_EMPTY_COLOR: "#e0e0e0",

    /** 星级评分边框线宽 */
    STAR_RATING_LINE_WIDTH: 1,

    // ═══ 颜色预览 ═══

    /** 颜色预览边框颜色 */
    COLOR_PREVIEW_BORDER_COLOR: "#ccc",

    // ═══ 布尔复选框 ═══

    /** 布尔复选框未选中颜色 */
    CHECKBOX_UNCHECKED_COLOR: "#999",

    /** 布尔复选框选中颜色 */
    CHECKBOX_CHECKED_COLOR: "#4caf50",

    /** 布尔复选框对勾颜色 */
    CHECKBOX_CHECK_MARK_COLOR: "#fff",

    /** 布尔复选框边框线宽 */
    CHECKBOX_BORDER_LINE_WIDTH: 2,

    /** 布尔复选框对勾线宽 */
    CHECKBOX_CHECK_MARK_LINE_WIDTH: 2.5,

    /** 布尔复选框禁用填充色 */
    CHECKBOX_DISABLED_FILL: "#ccc",

    /** 布尔复选框禁用透明度 */
    CHECKBOX_DISABLED_ALPHA: 0.4,
});