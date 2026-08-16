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

/**
 * 边框掩码常量
 *
 * - NONE：不画任何边框
 * - TOP/RIGHT/BOTTOM/LEFT：单边标志位
 * - ALL：四边全画
 * - MERGED_DEFAULT：合并单元格默认掩码（不画右边框，由下一个单元格的左边框替代）
 * - FROZEN_SIDE：冻结侧片段掩码（不画右边框，与滚动侧共享边）
 * - SCROLL_SIDE：滚动侧片段掩码（不画左边框，与冻结侧共享边）
 */
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
} as const);

/** 边框掩码值类型 */
export type BorderMaskValue = (typeof BorderMask)[keyof typeof BorderMask];
