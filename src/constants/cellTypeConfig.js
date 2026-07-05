/**
 * 单元格类型渲染常量配置
 *
 * 进度条、迷你图、星级评分、颜色预览、布尔复选框、多行文本
 */
export const CELL_TYPE_CONFIG = Object.freeze({
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

    /** 进度条高度比（占单元格高度） */
    PROGRESS_BAR_HEIGHT_RATIO: 0.6,

    /** 进度条圆角半径（px） */
    PROGRESS_BAR_BORDER_RADIUS: 4,

    /** 进度条内边距（px） */
    PROGRESS_BAR_PADDING: 6,

    // ═══ 迷你图 ═══

    /** 迷你图折线默认颜色 */
    SPARKLINE_LINE_COLOR: "#2196f3",

    /** 迷你图折线默认填充色 */
    SPARKLINE_FILL_COLOR: "rgba(33,150,243,0.2)",

    /** 迷你图柱状图默认颜色 */
    SPARKLINE_BAR_COLOR: "#4caf50",

    /** 迷你图默认线宽 */
    SPARKLINE_LINE_WIDTH: 1.5,

    /** 迷你图折线数据点半径 */
    SPARKLINE_DOT_RADIUS: 2,

    /** 迷你图内边距（px） */
    SPARKLINE_PADDING: 4,

    /** 迷你图柱状图间距（px） */
    SPARKLINE_BAR_GAP: 1,

    // ═══ 星级评分 ═══

    /** 星级评分默认填充色 */
    STAR_RATING_FILLED_COLOR: "#ffc107",

    /** 星级评分默认空星色 */
    STAR_RATING_EMPTY_COLOR: "#e0e0e0",

    /** 星级评分边框线宽 */
    STAR_RATING_LINE_WIDTH: 1,

    /** 星级评分默认最大星数 */
    STAR_RATING_MAX_STARS: 5,

    /** 星级评分默认星形大小（px） */
    STAR_RATING_STAR_SIZE: 16,

    /** 星级评分星形间距比例 */
    STAR_RATING_GAP_RATIO: 0.2,

    // ═══ 颜色预览 ═══

    /** 颜色预览边框颜色 */
    COLOR_PREVIEW_BORDER_COLOR: "#ccc",

    /** 颜色预览圆角半径（px） */
    COLOR_PREVIEW_BORDER_RADIUS: 4,

    /** 颜色预览内边距（px） */
    COLOR_PREVIEW_PADDING: 4,

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

    /** 布尔复选框尺寸比（占单元格较小边） */
    CHECKBOX_SIZE_RATIO: 0.6,

    /** 布尔复选框圆角比例 */
    CHECKBOX_CORNER_RADIUS_RATIO: 0.15,

    /** 布尔复选框对勾尺寸比例 */
    CHECKBOX_CHECK_MARK_SIZE_RATIO: 0.5,

    // ═══ 多行文本 ═══

    /** 多行文本默认行高比（相对于字号） */
    TEXTAREA_LINE_HEIGHT_RATIO: 1.4,

    /** 多行文本省略号后缀 */
    TEXTAREA_ELLIPSIS: "...",

    // ═══ 自动超链接 ═══

    /** 自动超链接文本颜色 */
    AUTO_LINK_COLOR: "#0066cc",

    /** 自动悬停时的链接颜色（供 UI 层使用） */
    AUTO_LINK_HOVER_COLOR: "#004499",

    /** 自动访问过的链接颜色（供 UI 层使用） */
    AUTO_LINK_VISITED_COLOR: "#551a8b",

    /** 链接下划线偏移量（px，相对于文字基线） */
    AUTO_LINK_UNDERLINE_OFFSET: 2,

    /** 链接下划线宽度（px） */
    AUTO_LINK_UNDERLINE_WIDTH: 1,
});