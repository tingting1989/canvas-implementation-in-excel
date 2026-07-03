/**
 * 边框掩码（位域）
 *
 * 使用位运算声明四边的可见性，避免散落的 if-else。
 *
 * 用法：
 *   const mask = BorderMask.TOP | BorderMask.BOTTOM;
 *   if (mask & BorderMask.RIGHT) { ... } // 不画右边框
 */

const TOP = 0b0001;
const RIGHT = 0b0010;
const BOTTOM = 0b0100;
const LEFT = 0b1000;

export const BorderMask = Object.freeze({
    NONE: 0b0000,
    TOP,
    RIGHT,
    BOTTOM,
    LEFT,

    ALL: 0b1111,

    MERGED_DEFAULT: TOP | BOTTOM | LEFT,

    FROZEN_SIDE: TOP | BOTTOM | LEFT,

    SCROLL_SIDE: TOP | BOTTOM | RIGHT,
});
