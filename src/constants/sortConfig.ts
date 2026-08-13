/**
 * 排序常量配置
 */
export interface SortConfig {
    /** 排序指示器活跃色 */
    readonly SORT_ACTIVE_COLOR: "#1890ff";
    /** 排序指示器非活跃色（未排序状态的双向箭头） */
    readonly SORT_INACTIVE_COLOR: "#8c8c8c";
    /** 排序列高亮填充色 */
    readonly SORT_COLUMN_HIGHLIGHT_FILL: "rgba(24, 144, 255, 0.08)";
    /** 排序指示器箭头大小 */
    readonly SORT_ARROW_SIZE: 12;
    /** 排序指示器箭头内边距 */
    readonly SORT_ARROW_PADDING: 6;
    /** 排序指示器箭头线宽 */
    readonly SORT_ARROW_LINE_WIDTH: 1.5;
    /** 排序指示器非活跃透明度（已弃用，使用实心颜色） */
    readonly SORT_INACTIVE_ALPHA: 1.0;
}

export const SORT_CONFIG: SortConfig = Object.freeze({
    SORT_ACTIVE_COLOR: "#1890ff",
    SORT_INACTIVE_COLOR: "#8c8c8c",
    SORT_COLUMN_HIGHLIGHT_FILL: "rgba(24, 144, 255, 0.08)",
    SORT_ARROW_SIZE: 12,
    SORT_ARROW_PADDING: 6,
    SORT_ARROW_LINE_WIDTH: 1.5,
    SORT_INACTIVE_ALPHA: 1.0,
});
