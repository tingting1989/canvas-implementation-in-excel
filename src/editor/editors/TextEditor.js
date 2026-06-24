import { CellEditor } from "./CellEditor.js";

export class TextEditor extends CellEditor {
    getEditorId() {
        return "cell-editor";
    }

    readCellValue(row, col) {
        const realR = this.sheet.toRealRow(row);
        const cell = this.sheet.cellStore.get(realR, col);
        return cell?.value ?? "";
    }

    useBatchInBatchFill() {
        return true;
    }
}
