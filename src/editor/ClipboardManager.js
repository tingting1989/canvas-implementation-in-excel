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

        this.#writeSystemClipboard(cells);
    }

    paste(sheet) {
        this.#readSystemClipboard(sheet);
    }

    clear() {
        this.#data = null;
    }

    #writeSystemClipboard(cells) {
        const text = cells.map((row) => row.map((cell) => (cell ? String(cell.value ?? "") : "")).join("\t")).join("\n");

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => {
                this.#fallbackWriteText(text);
            });
        } else {
            this.#fallbackWriteText(text);
        }
    }

    #fallbackWriteText(text) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand("copy");
        } catch (_) {}
        document.body.removeChild(ta);
    }

    #readSystemClipboard(sheet) {
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard
                .readText()
                .then((text) => {
                    if (text) {
                        this.#pasteText(sheet, text);
                    } else if (this.#data) {
                        this.#pasteInternal(sheet);
                    }
                })
                .catch(() => {
                    if (this.#data) {
                        this.#pasteInternal(sheet);
                    }
                });
        } else if (this.#data) {
            this.#pasteInternal(sheet);
        }
    }

    #pasteText(sheet, text) {
        const [targetRow, targetCol] = sheet.selection.getActive();
        const rows = text.split("\n");
        for (let r = 0; r < rows.length; r++) {
            if (rows[r] === "" && r === rows.length - 1) continue;
            const cols = rows[r].split("\t");
            for (let c = 0; c < cols.length; c++) {
                if (!sheet.isDisabled(targetRow + r, targetCol + c)) {
                    sheet.setCell(targetRow + r, targetCol + c, cols[c]);
                }
            }
        }
        sheet.render();
    }

    #pasteInternal(sheet) {
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
}
