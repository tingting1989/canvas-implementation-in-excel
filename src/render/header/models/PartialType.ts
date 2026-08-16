export const PARTIAL_TYPE = Object.freeze({
    FULL: "full",
    FROZEN: "frozen",
    SCROLL: "scroll",
} as const);

export type PartialType = (typeof PARTIAL_TYPE)[keyof typeof PARTIAL_TYPE];
