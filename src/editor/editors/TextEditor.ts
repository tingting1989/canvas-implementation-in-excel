import { CellEditor } from "./CellEditor.js";

/**
 * 文本编辑器
 *
 * 最基础的单元格编辑器，用于编辑文本类型单元格。
 * 优先显示公式字符串，批量填充时启用批处理优化。
 */
export class TextEditor extends CellEditor {
    /**
     * 读取指定单元格的原始值
     * 优先返回公式字符串，其次返回单元格值
     *
     * @param row - 行号
     * @param col - 列号
     * @returns 单元格原始值
     */
    readCellValue(row: number, col: number): unknown {
        const cell = this.sheet!.cellStore.get(row, col);
        if (cell?.formula) return cell.formula;
        return cell?.value ?? "";
    }

    /**
     * 批量填充时是否使用 beginBatch/endBatch 包裹
     * 文本编辑器启用批处理以优化大量数据的写入性能
     * @returns true
     */
    useBatchInBatchFill(): boolean {
        return true;
    }
}
