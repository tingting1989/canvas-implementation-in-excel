/**
 * 自动填充方向枚举
 * @description 定义单元格自动填充时支持的方向，用于拖拽填充或批量操作时的方向控制
 * @constant
 */
export type AutoFillDirValue = "up" | "down" | "left" | "right";

export interface AutoFillDir {
    /** 向上填充，将下方单元格的值向上复制或序列延伸 */
    readonly UP: "up";
    /** 向下填充，将上方单元格的值向下复制或序列延伸（最常用） */
    readonly DOWN: "down";
    /** 向左填充，将右侧单元格的值向左复制或序列延伸 */
    readonly LEFT: "left";
    /** 向右填充，将左侧单元格的值向右复制或序列延伸（最常用） */
    readonly RIGHT: "right";
}

export const AUTO_FILL_DIR: AutoFillDir = Object.freeze({
    UP: "up",
    DOWN: "down",
    LEFT: "left",
    RIGHT: "right",
});