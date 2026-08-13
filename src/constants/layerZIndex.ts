/**
 * 图层 Z-Index 常量定义
 *
 * 定义所有渲染图层的 z-index 值，用于控制图层叠加顺序。
 * 值越小表示图层越靠下（先渲染），值越大表示图层越靠上（后渲染）。
 *
 * ## 图层渲染顺序（从底到顶）
 * 1. TILE (100) - 瓦片层：非冻结区域的单元格数据渲染，位于最底层
 * 2. SELECTION (200) - 选区层：选区高亮、合并边框、拖拽指示器
 * 3. FROZEN (300) - 冻结层：冻结区域的瓦片和叠加效果
 * 4. CHART (400) - 图表层：图表渲染，位于冻结层之上、交互层之下
 * 5. INTERACTION (500) - 交互层：冻结线、调整指示线、编辑框、调试信息
 * 6. HEADER (600) - 表头层：行号和列标题
 *
 * @module constants/layerZIndex
 */
export interface LayerZIndex {
    readonly TILE: 100;
    readonly SELECTION: 200;
    readonly FROZEN: 300;
    readonly CHART: 400;
    readonly INTERACTION: 500;
    readonly HEADER: 600;
}

export const LAYER_Z_INDEX: LayerZIndex = Object.freeze({
    TILE: 100,
    SELECTION: 200,
    FROZEN: 300,
    CHART: 400,
    INTERACTION: 500,
    HEADER: 600,
});