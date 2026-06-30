/**
 * 图层 Z-Index 常量定义
 *
 * 定义所有渲染图层的 z-index 值，用于控制图层叠加顺序。
 * 值越小表示图层越靠下（先渲染），值越大表示图层越靠上（后渲染）。
 *
 * ## 图层渲染顺序（从底到顶）
 * 1. TILE (10) - 瓦片层：非冻结区域的单元格数据渲染，位于最底层
 * 2. SELECTION (20) - 选区层：选区高亮、合并边框、拖拽指示器
 * 3. FROZEN (30) - 冻结层：冻结区域的瓦片和叠加效果
 * 4. INTERACTION (40) - 交互层：冻结线、调整指示线、编辑框、调试信息
 * 5. HEADER (50) - 表头层：行号和列标题
 *
 * @module constants/layerZIndex
 */
export const LAYER_Z_INDEX = {
    TILE: 10,

    SELECTION: 20,

    FROZEN: 30,

    INTERACTION: 40,

    HEADER: 50,
};