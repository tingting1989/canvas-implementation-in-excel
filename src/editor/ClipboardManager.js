/**
 * 剪贴板管理器
 *
 * 负责复制/粘贴的核心逻辑，不依赖插件系统，保持纯数据操作。
 * 由 CopyPastePlugin 持有和调用，也可独立使用。
 *
 * 剪贴板策略：
 * - 复制：内部存储（含样式ID + 列类型）+ 系统剪贴板（TSV 纯文本）
 * - 粘贴：通过浏览器原生 paste 事件同步读取剪贴板（支持文本 + 图片）
 * - 类型检查：粘贴时验证源列类型与目标列类型一致，不一致则阻止粘贴
 *
 * 图片粘贴：
 * - 从 ClipboardEvent.clipboardData 中提取 image/png、image/jpeg 等 MIME 类型
 * - 图片 Blob 转换为 Object URL，存入内部 #cellContent Map（不侵入 Cell 模型）
 * - 由 TileRenderer 通过 getCellContent() 查询并渲染
 */

import { errorHandler, ERROR_CODE } from "../core/ErrorHandler.js";

/**
 * 富内容管理：
 * - 图片、图表等富内容通过 #cellContent Map 独立管理，key 为 "sheetName,realR,col"
 * - Cell 类保持纯粹，不需要感知具体内容类型
 * - 未来新增内容类型（图表、附件等）只需扩展此模块，不修改 Cell
 */
export class ClipboardManager {
    /** @type {{ sourceSheetName:string, topRow:number, topCol:number, rows:number, cols:number, cells:Array, columnTypes:Array<string> }|null} */
    #data = null;

    /**
     * 单元格富内容缓存：key = "sheetName,realR,col", value = { type, blob, objectUrl }
     * 与 Cell 模型解耦，由外部模块独立管理
     * @type {Map<string, {type:string, blob:Blob, objectUrl:string}>}
     */
    #cellContent = new Map();

    /**
     * 复制当前选区到剪贴板
     * 同时写入内部存储（保留样式）和系统剪贴板（TSV 纯文本）
     *
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     */
    copy(sheet) {
        const range = sheet.selection.getRange();
        const accessor = sheet.cellDataAccessor;
        const cells = [];

        // 记录每个复制列的类型名称，用于粘贴时的类型一致性检查
        const columnTypes = [];
        for (let c = range.topCol; c <= range.bottomCol; c++) {
            const cellType = sheet.getCellTypeInstance(range.topRow, c);
            columnTypes.push(cellType ? cellType.name : "text");
        }
        for (let r = range.topRow; r <= range.bottomRow; r++) {
            const row = [];
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                const cell = accessor.get(r, c);
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
            columnTypes,
        };

        this.#writeSystemClipboard(sheet, range, cells);
    }

    /**
     * 从浏览器原生 paste 事件同步粘贴（推荐方式）
     *
     * 利用 ClipboardEvent.clipboardData 同步读取剪贴板内容，
     * 支持文本（text/plain、text/html）和图片（image/png、image/jpeg 等）。
     * 无需 navigator.clipboard 权限弹窗。
     *
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {ClipboardEvent} clipboardEvent - 浏览器原生 paste 事件
     * @returns {boolean} 是否成功处理了粘贴
     */
    pasteFromEvent(sheet, clipboardEvent) {
        const items = clipboardEvent.clipboardData?.items;
        if (!items || items.length === 0) {
            // fallback 到内部数据
            if (this.#data) {
                this.pasteInternal(sheet);
                return true;
            }
            return false;
        }

        let hasImage = false;
        let textContent = null;

        // 遍历剪贴板 items，优先处理图片，其次文本
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith("image/")) {
                const blob = item.getAsFile();
                if (blob) {
                    hasImage = true;
                    this.#pasteImage(sheet, blob);
                }
            } else if (item.type === "text/plain" && textContent === null) {
                textContent = item;
            }
        }

        // 如果有图片，粘贴图片（不再处理文本）
        if (hasImage) {
            sheet.render();
            return true;
        }

        // 处理文本粘贴
        if (textContent) {
            textContent.getAsString((text) => {
                this.pasteText(sheet, text);
            });
            return true;
        }

        // 既无文本也无图片，fallback 到内部数据
        if (this.#data) {
            this.pasteInternal(sheet);
            return true;
        }
        return false;
    }

    /**
     * 粘贴剪贴板内容到当前活动单元格位置（异步方式，兼容旧 API）
     * 优先读取系统剪贴板，fallback 到内部数据
     *
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @deprecated 推荐使用 pasteFromEvent() 替代，以避免权限弹窗
     */
    paste(sheet) {
        this.#readSystemClipboard(sheet);
    }

    /**
     * 清空内部剪贴板数据（不影响已粘贴到单元格的图片）
     */
    clear() {
        this.#data = null;
    }

    /**
     * 检查粘贴时源列类型与目标列类型是否一致
     * 仅当目标列明确配置了不同类型时才阻止粘贴；
     * 目标列无类型配置（默认 text）时允许任意类型粘贴。
     *
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 目标工作表
     * @param {number} targetRow - 目标起始行
     * @param {number} targetCol - 目标起始列
     * @param {number} [srcCols] - 源数据列数（仅 #pasteInternal 使用，#pasteText 从文本推断）
     * @returns {{ mismatches: Array<{srcCol:number, targetCol:number, srcType:string, targetType:string}> }|null}
     */
    #checkTypeMismatch(sheet, targetRow, targetCol, srcCols) {
        if (!this.#data) return null;
        const cols = srcCols != null ? srcCols : this.#data.cols;
        const columnTypes = this.#data.columnTypes;
        const mismatches = [];

        for (let c = 0; c < cols; c++) {
            const srcType = columnTypes[c] || "text";
            const tc = targetCol + c;

            // 检查目标列是否有显式类型配置
            const colConfig = sheet.getColumnConfig(tc);
            const hasExplicitColType = colConfig?.type != null;
            const hasCellType = sheet.cellTypes?.has(`${targetRow},${tc}`);

            // 仅当目标列/单元格有显式类型配置且与源类型不同时才拒绝
            if (hasExplicitColType || hasCellType) {
                const targetCellType = sheet.getCellTypeInstance(targetRow, tc);
                const targetType = targetCellType ? targetCellType.name : "text";
                if (srcType !== targetType) {
                    mismatches.push({ srcCol: this.#data.topCol + c, targetCol: tc, srcType, targetType });
                }
            }
        }

        return mismatches.length > 0 ? { mismatches } : null;
    }

    /**
     * 获取内部剪贴板数据（供 CopyPastePlugin 在 beforePaste 钩子中使用）
     * @returns {object|null}
     */
    getClipboardData() {
        return this.#data;
    }

    #writeSystemClipboard(sheet, range, cells) {
        // 使用 sheet.formatCellValue() 格式化显示值，避免 Date 等对象被 String() 转为冗长字符串
        const text = cells
            .map((row, ri) =>
                row
                    .map((cell, ci) => {
                        if (!cell) return "";
                        const r = range.topRow + ri;
                        const c = range.topCol + ci;
                        return sheet.formatCellValue(r, c, cell.value);
                    })
                    .join("\t"),
            )
            .join("\n");

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch((err) => {
                errorHandler.warn(ERROR_CODE.CLIPBOARD_WRITE_ERROR, "System clipboard write failed, using fallback", { originalError: err });
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
        } catch (error) {
            errorHandler.warn(ERROR_CODE.CLIPBOARD_WRITE_ERROR, "Fallback clipboard write failed", { originalError: error });
        }
        document.body.removeChild(ta);
    }

    #readSystemClipboard(sheet) {
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard
                .readText()
                .then((text) => {
                    if (text) {
                        this.pasteText(sheet, text);
                    } else if (this.#data) {
                        this.pasteInternal(sheet);
                    }
                })
                .catch((err) => {
                    errorHandler.warn(ERROR_CODE.CLIPBOARD_READ_ERROR, "System clipboard read failed, using internal data", { originalError: err });
                    if (this.#data) {
                        this.pasteInternal(sheet);
                    }
                });
        } else if (this.#data) {
            this.pasteInternal(sheet);
        }
    }

    /**
     * 粘贴文本到当前活动单元格（公开方法，供 CopyPasteStrategy 调用）
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {string} text - TSV 格式文本
     */
    pasteText(sheet, text) {
        const [targetRow, targetCol] = sheet.selection.getActive();
        const rows = text.split("\n");

        // 计算源列数（取最长行的列数）
        let srcCols = 0;
        for (let r = 0; r < rows.length; r++) {
            if (rows[r] === "" && r === rows.length - 1) continue;
            const colCount = rows[r].split("\t").length;
            if (colCount > srcCols) srcCols = colCount;
        }

        // 检查类型一致性：源列类型与目标列类型不一致时阻止粘贴
        const mismatch = this.#checkTypeMismatch(sheet, targetRow, targetCol, srcCols);
        if (mismatch) {
            const details = mismatch.mismatches.map((m) => `列${m.targetCol}: 源类型"${m.srcType}" ≠ 目标类型"${m.targetType}"`).join("; ");
            errorHandler.warn(ERROR_CODE.CLIPBOARD_TYPE_MISMATCH, `类型不一致，阻止粘贴: ${details}`);
            return;
        }

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
        sheet.invalidateAll();
        sheet.render();
    }

    /**
     * 粘贴内部剪贴板数据（公开方法，供 CopyPasteStrategy 调用）
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     */
    pasteInternal(sheet) {
        if (!this.#data) return;
        const [targetRow, targetCol] = sheet.selection.getActive();

        // 检查类型一致性：源列类型与目标列类型不一致时阻止粘贴
        const mismatch = this.#checkTypeMismatch(sheet, targetRow, targetCol);
        if (mismatch) {
            const details = mismatch.mismatches.map((m) => `列${m.targetCol}: 源类型"${m.srcType}" ≠ 目标类型"${m.targetType}"`).join("; ");
            errorHandler.warn(ERROR_CODE.CLIPBOARD_TYPE_MISMATCH, `类型不一致，阻止粘贴: ${details}`);
            return;
        }

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
        sheet.invalidateAll();
        sheet.render();
    }

    // ============================================================
    // 富内容管理（图片、图表等，与 Cell 模型解耦）
    // ============================================================

    /**
     * 生成单元格富内容的唯一 key
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {number} realR - 实际行号
     * @param {number} col - 列号
     * @returns {string}
     */
    #cellKey(sheet, realR, col) {
        return `${sheet.name},${realR},${col}`;
    }

    /**
     * 为指定单元格设置图片内容
     * 将 Blob 转为 Object URL，存入 #cellContent Map。
     * 图片信息不写入 Cell 模型，由渲染层通过 getCellContent() 查询。
     *
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {number} r - 行号（页面行号）
     * @param {number} c - 列号
     * @param {Blob} blob - 图片 Blob 数据
     */
    setCellImage(sheet, r, c, blob) {
        const key = this.#cellKey(sheet, r, c);

        // 撤销旧图片的 Object URL
        const old = this.#cellContent.get(key);
        if (old) {
            URL.revokeObjectURL(old.objectUrl);
        }

        const objectUrl = URL.createObjectURL(blob);
        this.#cellContent.set(key, { type: "image", blob, objectUrl });

        // 确保单元格存在（值为空，仅占位）
        if (!sheet.cellStore.get(realR, c)) {
            sheet.setCell(r, c, "");
        }

        sheet.invalidateAll();
    }

    /**
     * 获取指定单元格的富内容信息
     * 渲染层通过此方法查询单元格是否有图片等内容需要渲染。
     *
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {number} realR - 实际行号
     * @param {number} col - 列号
     * @returns {{type:string, objectUrl:string}|null} 富内容信息，无则返回 null
     */
    getCellContent(sheet, realR, col) {
        const key = this.#cellKey(sheet, realR, col);
        const content = this.#cellContent.get(key);
        if (!content) return null;
        return { type: content.type, objectUrl: content.objectUrl };
    }

    /**
     * 清除指定单元格的富内容
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {number} realR - 实际行号
     * @param {number} col - 列号
     */
    removeCellContent(sheet, realR, col) {
        const key = this.#cellKey(sheet, realR, col);
        const content = this.#cellContent.get(key);
        if (content) {
            URL.revokeObjectURL(content.objectUrl);
            this.#cellContent.delete(key);
        }
    }

    // ============================================================
    // 图片粘贴（内部）
    // ============================================================

    /**
     * 粘贴图片到当前活动单元格
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {Blob} blob - 图片 Blob 数据
     */
    #pasteImage(sheet, blob) {
        const [targetRow, targetCol] = sheet.selection.getActive();
        if (sheet.isDisabled(targetRow, targetCol)) return;

        this.setCellImage(sheet, targetRow, targetCol, blob);
    }

    // ============================================================
    // 文件选择插入图片（右键菜单 / 工具栏）
    // ============================================================

    /**
     * 通过文件选择器插入图片到当前活动单元格
     * 创建一个隐藏的 <input type="file"> 触发文件选择，选中后调用 setCellImage
     *
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     * @param {object} [options]
     * @param {number} [options.row] - 目标行号（不传则使用当前选区活动单元格）
     * @param {number} [options.col] - 目标列号
     * @param {Function} [options.onComplete] - 完成回调 (success: boolean) => void
     */
    insertImageFromFile(sheet, options = {}) {
        const targetRow = options.row ?? sheet.selection.getActive()[0];
        const targetCol = options.col ?? sheet.selection.getActive()[1];

        if (sheet.isDisabled(targetRow, targetCol)) {
            options.onComplete?.(false);
            return;
        }

        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml";
        input.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";

        input.addEventListener("change", () => {
            const file = input.files?.[0];
            if (file) {
                this.setCellImage(sheet, targetRow, targetCol, file);
                options.onComplete?.(true);
            } else {
                options.onComplete?.(false);
            }
            input.remove();
        });

        // 取消选择时清理
        input.addEventListener("cancel", () => {
            options.onComplete?.(false);
            input.remove();
        });

        document.body.appendChild(input);
        input.click();
    }

    /**
     * 销毁剪贴板管理器，释放所有资源
     */
    destroy() {
        this.#data = null;
        for (const [, content] of this.#cellContent) {
            URL.revokeObjectURL(content.objectUrl);
        }
        this.#cellContent.clear();
    }
}