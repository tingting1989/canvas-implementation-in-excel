/**
 * 表格全局常量配置（Barrel 文件）
 *
 * 将所有子配置展开合并为统一的 CONFIG 对象，
 * 消费方无需改动任何 import，仍然：
 *   import { CONFIG } from ".../config"
 *
 * 子文件按功能域划分：
 *   coreConfig      — 数据规模、默认尺寸、瓦片分块、字体、单元格、网格线、禁用状态、斑马纹
 *   headerConfig    — 行列头
 *   selectionConfig — 选区与交互、拖拽
 *   uiConfig        — 滚动条、Sheet 标签栏、列宽/行高调整、DOM 标识、轴标识
 *   chartConfig     — 图表渲染 + 图表选择
 *   sortConfig      — 排序
 *   cellTypeConfig  — 进度条、迷你图、星级评分、颜色预览、布尔复选框
 */
import { CORE_CONFIG, type CoreConfig } from "./coreConfig";
import { HEADER_CONFIG, type HeaderConfig } from "./headerConfig";
import { SELECTION_CONFIG, type SelectionConfig } from "./selectionConfig";
import { UI_CONFIG, type UiConfig } from "./uiConfig";
import { CHART_CONFIG, type ChartConfig } from "./chartConfig";
import { SORT_CONFIG, type SortConfig } from "./sortConfig";
import { CELL_TYPE_CONFIG, type CellTypeConfig } from "./cellTypeConfig";
import { STYLE_LEVEL, type StyleLevel } from "./styleLevel";
import { LAYER_Z_INDEX, type LayerZIndex } from "./layerZIndex";
import { HIT_TYPE, type HitType } from "./hitType";
import { STRATEGY_PRIORITY, type StrategyPriority } from "./strategyPriority";

/**
 * 合并后的全局配置类型
 *
 * 注意：以下键名在多个子配置中冲突，spread 合并时后者覆盖前者：
 * - CELL: StyleLevel(400) → HitType("cell")，最终值为 "cell"
 * - CHART: LayerZIndex(400) → HitType("chart")，最终值为 "chart"
 * 此处 Omit 排除冲突键，以最后 spread 的值为准。
 */
export type Config = Readonly<
    CoreConfig &
        HeaderConfig &
        SelectionConfig &
        UiConfig &
        ChartConfig &
        SortConfig &
        CellTypeConfig &
        Omit<StyleLevel, "CELL"> &
        Omit<LayerZIndex, "CHART"> &
        HitType &
        StrategyPriority
>;

export const CONFIG: Config = Object.freeze({
    ...CORE_CONFIG,
    ...HEADER_CONFIG,
    ...SELECTION_CONFIG,
    ...UI_CONFIG,
    ...CHART_CONFIG,
    ...SORT_CONFIG,
    ...CELL_TYPE_CONFIG,
    ...STYLE_LEVEL,
    ...LAYER_Z_INDEX,
    ...HIT_TYPE,
    ...STRATEGY_PRIORITY,
});
