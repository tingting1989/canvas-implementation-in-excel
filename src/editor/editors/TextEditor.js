import { CellEditor } from "./CellEditor.js";

export class TextEditor extends CellEditor {
    readCellValue(row, col) {
        const cell = this.sheet.cellStore.get(row, col);
        return cell?.value ?? "";
    }

    useBatchInBatchFill() {
        return true;
    }
}