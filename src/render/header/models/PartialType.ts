/**
 * 片段类型常量
 *
 * 标记 Fragment 是完整单元格还是被冻结边界切割后的部分：
 * - FULL：完整单元格，未被切割
 * - FROZEN：冻结侧部分（不画靠近边界的边框）
 * - SCROLL：滚动侧部分（不画靠近边界的边框）
 */
export const PARTIAL_TYPE = Object.freeze({
    FULL: "full",
    FROZEN: "frozen",
    SCROLL: "scroll",
} as const);

/** 片段类型联合类型 */
export type PartialType = (typeof PARTIAL_TYPE)[keyof typeof PARTIAL_TYPE];
