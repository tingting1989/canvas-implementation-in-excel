/**
 * 滚动轴方向枚举
 * @description 定义工作区可滚动的轴向，用于控制视图滚动行为
 * @constant {Object}
 * @property {string} HORIZONTAL - 水平滚动轴（值："h"），控制左右方向的滚动，通常用于浏览列
 * @property {string} VERTICAL - 垂直滚动轴（值："v"），控制上下方向的滚动，通常用于浏览行
 */
export const SCROLL_AXIS = Object.freeze({
    HORIZONTAL: "h",
    VERTICAL: "v",
});