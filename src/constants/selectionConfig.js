/**
 * 选区与交互、拖拽常量配置
 */
export const SELECTION_CONFIG = Object.freeze({
    // ═══ 选区与交互 ═══

    /** 选区边框及手柄颜色 */
    SELECTION_COLOR: "#217346",

    /** 选区线宽度 */
    SELECTION_LINE_WIDTH: 2,

    /** 填充手柄尺寸（px），选区右下角的拖拽手柄 */
    FILL_HANDLE_SIZE: 5,

    /** 边框虚线模式（dashed 样式） */
    BORDER_DASH_SOLID: [4, 2],

    /** 边框点划线模式（dotted 样式） */
    BORDER_DASH_DOTTED: [1, 2],

    /** 交互元素虚线模式（调整线、选择框等） */
    UI_DASH_PATTERN: [4, 3],

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

    // ═══ 拖拽 ═══

    /** 拖拽源行头/列头的半透明高亮色 */
    MOVE_SOURCE_FILL: "rgba(76, 139, 245, 0.3)",

    /** 拖拽 ghost 填充色 */
    GHOST_FILL: "rgba(76, 139, 245, 0.15)",

    /** Ghost 文字颜色 */
    GHOST_TEXT_COLOR: "#fff",
});
