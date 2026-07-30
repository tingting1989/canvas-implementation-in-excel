/**
 * 单行文本编辑器 (Text Editor)
 *
 * 专用于编辑单行文本类型单元格的编辑器实现。
 * 继承自 {@link CellEditor} 基类，提供文本特有的编辑行为。
 *
 * 特性：
 * - 支持公式显示（编辑时显示公式而非计算结果）
 * - 启用批量填充事务（提高大面积填充性能）
 * - 自动处理空值和 undefined
 *
 * 适用场景：
 * - 普通文本单元格（姓名、地址、描述等）
 * - 公式单元格（编辑时显示原始公式）
 * - 需要批量填充的文本区域
 *
 * 与父类的区别：
 * ┌────────────────────┬───────────────────┬───────────────────┐
 * │ 特性               │ CellEditor        │ TextEditor        │
 * ├────────────────────┼───────────────────┼───────────────────┤
 * │ 批量填充事务       │ 禁用              │ ✅ 启用           │
 * │ 默认值处理         │ 基础实现          │ 相同              │
 * │ 适用数据类型       │ 通用              │ 文本/公式         │
 * └────────────────────┴───────────────────┴───────────────────┘
 *
 * @class TextEditor
 * @extends CellEditor
 *
 * @example
 * ```js
 * // 在工作表中使用
 * const editor = new TextEditor(renderEngine, sheet);
 * editor.createEditor();
 * editor.show(5, 3);  // 编辑 D6 单元格
 *
 * // 用户输入后获取值
 * const value = editor.getValue();
 * ```
 */
import { CellEditor } from "./CellEditor.js";

export class TextEditor extends CellEditor {
    /**
     * 重写：读取单元格值（支持公式显示）
     *
     * 与基类的主要区别：
     * - 如果单元格包含公式，返回公式的**字符串形式**
     *   （如 "=SUM(A1:B10)"），而非计算结果
     * - 这允许用户直接编辑公式本身
     * - 对于普通单元格，返回其值或空字符串
     *
     * 设计考量：
     * Excel 的标准行为是：
     * - 显示模式：显示计算结果
     * - 编辑模式：显示原始公式
     * 此方法遵循这一惯例，提供更好的用户体验。
     *
     * @param {number} row - 行号（0-based）
     * @param {number} col - 列号（0-based）
     *
     * @returns {string|*} 单元格的值
     *          - string: 公式字符串或单元格值
     *          - "": 空单元格
     *
     * @override
     * @see CellEditor.readCellValue - 基类实现
     */
    readCellValue(row, col) {
        const cell = this.sheet.cellStore.get(row, col);
        if (cell?.formula) return cell.formula;
        return cell?.value ?? "";
    }

    /**
     * 重写：启用批量填充事务
     *
     * 返回 true 表示在批量填充操作（Ctrl+Enter 或拖拽填充）时，
     * 使用 beginBatch()/endBatch() 事务包裹单元格更新。
     *
     * 性能优势：
     * - **减少重绘次数**：批量更新只触发一次最终渲染
     * - **优化依赖计算**：公式引擎可以延迟重算，合并多个变更
     * - **提升响应速度**：大面积填充时性能提升显著（10-100倍）
     *
     * 适用场景：
     * - 填充大量文本数据（如复制整列）
     * - 批量设置默认值
     * - 数据导入后的格式化填充
     *
     * @returns {boolean} 始终返回 true（文本编辑器始终使用事务）
     *
     * @override
     * @see CellEditor.useBatchInBatchFill - 基类实现（返回 false）
     */
    useBatchInBatchFill() {
        return true;
    }
}
