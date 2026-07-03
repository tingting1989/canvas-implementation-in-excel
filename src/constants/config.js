/**
 * 表格全局常量配置（Barrel 文件）
 *
 * 将所有子配置展开合并为统一的 CONFIG 对象，
 * 消费方无需改动任何 import，仍然：
 *   import { CONFIG } from ".../config.js"
 *
 * 子文件按功能域划分：
 *   coreConfig.js      — 数据规模、默认尺寸、瓦片分块、字体、单元格、网格线、禁用状态、斑马纹
 *   headerConfig.js    — 行列头
 *   selectionConfig.js — 选区与交互、拖拽
 *   uiConfig.js        — 滚动条、Sheet 标签栏、列宽/行高调整、DOM 标识、轴标识
 *   chartConfig.js     — 图表渲染 + 图表选择
 *   sortConfig.js      — 排序
 *   cellTypeConfig.js  — 进度条、迷你图、星级评分、颜色预览、布尔复选框
 */
import { CORE_CONFIG } from "./coreConfig.js";
import { HEADER_CONFIG } from "./headerConfig.js";
import { SELECTION_CONFIG } from "./selectionConfig.js";
import { UI_CONFIG } from "./uiConfig.js";
import { CHART_CONFIG } from "./chartConfig.js";
import { SORT_CONFIG } from "./sortConfig.js";
import { CELL_TYPE_CONFIG } from "./cellTypeConfig.js";

export const CONFIG = Object.freeze({
    ...CORE_CONFIG,
    ...HEADER_CONFIG,
    ...SELECTION_CONFIG,
    ...UI_CONFIG,
    ...CHART_CONFIG,
    ...SORT_CONFIG,
    ...CELL_TYPE_CONFIG,
});