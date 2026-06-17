/**
 * 剪贴板管理器
 *
 * 负责复制/粘贴的核心逻辑，不依赖插件系统，保持纯数据操作。
 * 由 CopyPastePlugin 持有和调用，也可独立使用。
 *
 * 剪贴板策略：
 * - 复制：内部存储（含样式ID）+ 系统剪贴板（TSV 纯文本）
 * - 粘贴：优先读取系统剪贴板，fallback 到内部数据（保留样式）
 */
export class ClipboardManager {
    /** @type {{ sourceSheetName:string, topRow:number, topCol:number, rows:number, cols:number, cells:Array }|null} */
    #data = null;

    /**
     * 复制当前选区到剪贴板
     * 同时写入内部存储（保留样式）和系统剪贴板（TSV 纯文本）
     *
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     */
    copy(sheet) {
        const range = sheet.selection.getRange();
        const cells = [];
        for (let r = range.topRow; r <= range.bottomRow; r++) {
            const realR = sheet.toRealRow(r);
            const row = [];
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                const cell = sheet.cellStore.get(realR, c);
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

        this.#writeSystemClipboard(sheet, range, cells);
    }

    /**
     * 粘贴剪贴板内容到当前活动单元格位置
     * 优先读取系统剪贴板，fallback 到内部数据
     *
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     */
    paste(sheet) {
        this.#readSystemClipboard(sheet);
    }

    /**
     * 清空内部剪贴板数据
     */
    clear() {
        this.#data = null;
    }

    #writeSystemClipboard(sheet, range, cells) {
        // 使用 sheet.formatCellValue() 格式化显示值，避免 Date 等对象被 String() 转为冗长字符串
        const text = cells.map((row, ri) =>
            row.map((cell, ci) => {
                if (!cell) return "";
                const r = range.topRow + ri;
                const c = range.topCol + ci;
                return sheet.formatCellValue(r, c, cell.value);
            }).join("\t")
        ).join("\n");

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
        sheet.beginBatch();
        for (let r = 0; r < rows.length; r++) {
            if (rows[r] === "" && r === rows.length - 1) continue;
            const cols = rows[r].split("\t");
            for (let c = 0; c < cols.length; c++) {
                const tr = targetRow + r;
                const tc = targetCol + c;
                if (!sheet.isDisabled(tr, tc)) {
                    // 使用类型系统解析粘贴的值，确保日期等类型正确存储
                    const parsedValue = sheet.parseCellValue(tr, tc, cols[c]);
                    sheet.setCell(tr, tc, parsedValue);
                }
            }
        }
        sheet.endBatch();
        // 标记所有瓦片为脏，确保粘贴内容被完整重绘
        sheet.renderEngine?.invalidateAll();
        sheet.render();
    }

    #pasteInternal(sheet) {
        if (!this.#data) return;
        const [targetRow, targetCol] = sheet.selection.getActive();
        sheet.beginBatch();
        for (let r = 0; r < this.#data.rows; r++) {
            for (let c = 0; c < this.#data.cols; c++) {
                const cellData = this.#data.cells[r]?.[c];
                if (!cellData) continue;
                const tr = targetRow + r;
                const tc = targetCol + c;
                if (sheet.isDisabled(tr, tc)) continue;
                // 先用源列格式化为显示字符串，再用目标列的类型系统解析
                const srcR = this.#data.topRow + r;
                const srcC = this.#data.topCol + c;
                const displayText = sheet.formatCellValue(srcR, srcC, cellData.value);
                const parsedValue = sheet.parseCellValue(tr, tc, displayText);
                sheet.setCell(tr, tc, parsedValue, cellData.styleId);
            }
        }
        sheet.endBatch();
        // 标记所有瓦片为脏，确保粘贴内容被完整重绘
        sheet.renderEngine?.invalidateAll();
        sheet.render();
    }
}
