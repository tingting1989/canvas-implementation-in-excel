/**
 * 单元格数据模型
 *
 * 设计意图：
 * - Cell 是最轻量的数据载体，仅存储值、样式引用和禁用状态，不包含坐标信息。
 * - 坐标由 ChunkedCellStore / Chunk 层级管理，Cell 本身是"纯数据"对象。
 * - 保持极简字段设计：避免在 Cell 上堆积格式、合并、条件规则等属性，
 *   这些由 StyleManager、MergeManager、ConditionalRule 等独立模块管理。
 * - 图片、图表等富内容由外部模块（如 ClipboardManager）独立管理，不侵入 Cell。
 *
 * 字段说明：
 * - value：单元格的值，可以是字符串、数字等（实际类型由使用方决定）。
 * - formula：公式字符串（如 "=SUM(A1:A10)"），设置后 value 为其计算结果。
 * - styleId：指向 StyleManager 中样式表的索引（0 表示默认样式）。
 * - disabled：是否为禁用单元格（禁用后不可编辑，渲染为灰色背景）。
 *
 * 构造方式：
 * - 通常由 Sheet.setCell() / Sheet.setCellData() 创建，而非手动 new。
 * - 示例：new Cell("hello", 0, false) → 值为 "hello"，默认样式，可编辑。
 *
 * 生命周期：
 * - Cell 实例存储在 Chunk.cells Map 中，由 ChunkedCellStore 统一管理。
 * - 删除单元格时 Chunk.delete() 移除 Map 条目，Cell 实例随之被 GC。
 */
export class Cell {
    /**
     * @param {*} value - 单元格值（字符串、数字等）
     * @param {number} [styleId=0] - 样式 ID，0 表示默认样式
     * @param {boolean} [disabled=false] - 是否禁用
     * @param {string|null} [formula=null] - 公式字符串（如 "=SUM(A1:A10)"），非公式单元格为 null
     */
    constructor(value = "", styleId = 0, disabled = false, formula = null) {
        /** @type {*} 单元格的值 */
        this.value = value;
        /** @type {number} 样式 ID，引用 StyleManager 中的样式表 */
        this.styleId = styleId;
        /** @type {boolean} 是否禁用（禁用后不可编辑，渲染灰色背景） */
        this.disabled = disabled;
        /** @type {string|null} 公式字符串，非公式单元格为 null */
        this.formula = formula;
    }
}