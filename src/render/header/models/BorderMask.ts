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
} as const);

export type BorderMaskValue = (typeof BorderMask)[keyof typeof BorderMask];
