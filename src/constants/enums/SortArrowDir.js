/**
 * 排序箭头方向枚举
 * @description 定义排序指示箭头的显示方向，用于UI中标识当前排序列及排序状态
 * @constant {Object}
 * @property {string} UP - 向上箭头，表示升序排列（A-Z、0-9、从小到大）
 * @property {string} DOWN - 向下箭头，表示降序排列（Z-A、9-0、从大到小）
 */
export const SORT_ARROW_DIR = Object.freeze({
    UP: "up",
    DOWN: "down",
});