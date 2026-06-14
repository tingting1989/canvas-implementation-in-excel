export class ClipboardManager {
    #data = null;

    copy(sheet) {
        const range = sheet.selection.getRange();
        const cells = [];
        for (let r = range.topRow; r <= range.bottomRow; r++) {
            const row = [];
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                const cell = sheet.cellStore.get(r, c);
                row.push(cell ? { value: cell.value, styleId: cell.styleId || 0 } : null);
            }
            cells.push(row);
        }
        this.#data = {
            sourceSheetName: sheet.name,
            topRow: range.topRow,
            topCol: range.topCol,
            rows: range.bottomRow - range.topRow + 1,
            cols: range.bottomCol - range.topCol + 1,
            cells,
        };
    }

    paste(sheet) {
        if (!this.#data) return;
        const [targetRow, targetCol] = sheet.selection.getActive();
        for (let r = 0; r < this.#data.rows; r++) {
            for (let c = 0; c < this.#data.cols; c++) {
                const cellData = this.#data.cells[r]?.[c];
                if (cellData) {
                    sheet.setCell(targetRow + r, targetCol + c, cellData.value, cellData.styleId);
                }
            }
        }
        sheet.render();
    }

    clear() {
        this.#data = null;
    }
}