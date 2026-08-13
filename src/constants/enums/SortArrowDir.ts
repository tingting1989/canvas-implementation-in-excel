/**
 * 排序箭头方向枚举
 * @description 定义排序指示箭头的显示方向，用于UI中标识当前排序列及排序状态
 * @constant
 */
export type SortArrowDirValue = "up" | "down";

export interface SortArrowDir {
    /** 向上箭头，表示升序排列（A-Z、0-9、从小到大） */
    readonly UP: "up";
    /** 向下箭头，表示降序排列（Z-A、9-0、从大到小） */
    readonly DOWN: "down";
}

export const SORT_ARROW_DIR: SortArrowDir = Object.freeze({
    UP: "up",
    DOWN: "down",
});