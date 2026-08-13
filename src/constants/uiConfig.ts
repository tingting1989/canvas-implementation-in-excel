/**
 * UI 基础设施常量配置
 *
 * 滚动条、Sheet 标签栏、列宽/行高调整、DOM 标识、轴标识
 */
export interface UiConfig {
    // ═══ 滚动条 ═══

    /** 滚动条轨道宽度（px） */
    readonly SCROLLBAR_WIDTH: 14;
    /** 滚动条滑块最小尺寸（px），防止内容过多时滑块过小无法点击 */
    readonly SCROLLBAR_MIN_SIZE: 28;

    // ═══ Sheet 标签栏 ═══

    /** Sheet 标签栏高度（px），位于 canvas 底部与水平滚动条同行 */
    readonly SHEET_TAB_HEIGHT: 28;
    /** Sheet 名称 */
    readonly DEFAULT_SHEET_NAME: "Sheet";

    // ═══ 列宽/行高调整 ═══

    /** 列宽/行高调整的命中检测区域（px），鼠标在边框附近此范围内触发拖拽调整 */
    readonly RESIZE_HIT_AREA: 5;
    /** 列最小宽度（px），拖拽调整列宽时不可低于此值 */
    readonly MIN_COL_WIDTH: 30;
    /** 行最小高度（px），拖拽调整行高时不可低于此值 */
    readonly MIN_ROW_HEIGHT: 10;

    // ═══ DOM 标识 ═══

    /** Canvas 元素 ID */
    readonly CANVAS_ID: "grid";

    // ═══ 轴标识 ═══

    /** 行轴标识 */
    readonly AXIS_ROW: "row";
    /** 列轴标识 */
    readonly AXIS_COL: "col";

    // ═══ 调试信息 ═══

    /** 调试信息起始 Y 坐标（px） */
    readonly DEBUG_START_Y: 20;
    /** 调试信息行高（px） */
    readonly DEBUG_LINE_HEIGHT: 16;
}

export const UI_CONFIG: UiConfig = Object.freeze({
    SCROLLBAR_WIDTH: 14,
    SCROLLBAR_MIN_SIZE: 28,

    SHEET_TAB_HEIGHT: 28,
    DEFAULT_SHEET_NAME: "Sheet",

    RESIZE_HIT_AREA: 5,
    MIN_COL_WIDTH: 30,
    MIN_ROW_HEIGHT: 10,

    CANVAS_ID: "grid",

    AXIS_ROW: "row",
    AXIS_COL: "col",

    DEBUG_START_Y: 20,
    DEBUG_LINE_HEIGHT: 16,
});