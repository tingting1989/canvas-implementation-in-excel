/**
 * 点击命中类型常量定义
 *
 * 定义鼠标点击在表格不同区域的命中类型，用于精确识别用户交互位置。
 * 这些常量在碰撞检测（hit testing）中使用，帮助系统判断用户点击的具体区域。
 *
 * 使用场景：
 * - 鼠标事件处理：根据点击位置执行不同的操作
 * - 光标样式切换：根据区域显示不同的鼠标指针
 * - 上下文菜单：根据右键位置显示相关菜单项
 * - 拖拽操作：判断是否触发行列大小调整
 *
 * 区域划分示意图：
 * ┌─────────────────────────────────────┐
 * │  corner  │     column headers       │
 * ├──────────┼──────────────────────────┤
 * │ row      │                          │
 * │ headers  │        cells             │
 * │          │                          │
 * └──────────┴──────────────────────────┘
 *
 * @module constants/hitType
 */
export type HitTypeValue =
    | "corner"
    | "col-header"
    | "row-header"
    | "cell"
    | "col-resize"
    | "row-resize"
    | "chart";

export interface HitType {
    /** 左上角全选按钮区域 */
    readonly CORNER: "corner";
    /** 列标题区域 */
    readonly COL_HEADER: "col-header";
    /** 行标题区域 */
    readonly ROW_HEADER: "row-header";
    /** 单元格区域 */
    readonly CELL: "cell";
    /** 列宽调整区域 */
    readonly COL_RESIZE: "col-resize";
    /** 行高调整区域 */
    readonly ROW_RESIZE: "row-resize";
    /** 图表区域 */
    readonly CHART: "chart";
}

export const HIT_TYPE: HitType = Object.freeze({
    CORNER: "corner",
    COL_HEADER: "col-header",
    ROW_HEADER: "row-header",
    CELL: "cell",
    COL_RESIZE: "col-resize",
    ROW_RESIZE: "row-resize",
    CHART: "chart",
});