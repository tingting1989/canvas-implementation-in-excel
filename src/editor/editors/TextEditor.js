import { CellEditor } from "./CellEditor.js";

export class TextEditor extends CellEditor {
    readCellValue(row, col) {
        const realR = this.sheet.toRealRow(row);
        const cell = this.sheet.cellStore.get(realR, col);
        return cell?.value ?? "";
    }

    useBatchInBatchFill() {
        return true;
    }
}
