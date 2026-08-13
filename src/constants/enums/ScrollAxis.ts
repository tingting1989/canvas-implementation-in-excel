/**
 * 滚动轴方向枚举
 * @description 定义工作区可滚动的轴向，用于控制视图滚动行为
 * @constant
 */
export type ScrollAxisValue = "h" | "v";

export interface ScrollAxis {
    /** 水平滚动轴（值："h"），控制左右方向的滚动，通常用于浏览列 */
    readonly HORIZONTAL: "h";
    /** 垂直滚动轴（值："v"），控制上下方向的滚动，通常用于浏览行 */
    readonly VERTICAL: "v";
}

export const SCROLL_AXIS: ScrollAxis = Object.freeze({
    HORIZONTAL: "h",
    VERTICAL: "v",
});