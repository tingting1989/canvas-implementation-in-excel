import { errorHandler } from "../core/ErrorHandler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";

/** 剪贴板数据结构 */
interface ClipboardData {
    /** 源工作表名称 */
    sourceSheetName: string;
    /** 源选区起始行号 */
    topRow: number;
    /** 源选区起始列号 */
    topCol: number;
    /** 选区行数 */
    rows: number;
    /** 选区列数 */
    cols: number;
    /** 单元格数据矩阵 */
    cells: (CellCopyData | null)[][];
    /** 每列的类型名称 */
    columnTypes: string[];
}

/** 复制的单元格数据 */
interface CellCopyData {
    /** 单元格值 */
    value: unknown;
    /** 样式ID */
    styleId: number;
}

/** 单元格富内容信息 */
interface CellContentEntry {
    /** 内容类型（如 "image"） */
    type: string;
    /** Blob 数据 */
    blob: Blob;
    /** Object URL */
    objectUrl: string;
}

/** 类型不匹配详情 */
interface TypeMismatch {
    /** 源列索引 */
    srcCol: number;
    /** 目标列索引 */
    targetCol: number;
    /** 源列类型 */
    srcType: string;
    /** 目标列类型 */
    targetType: string;
}

/** 类型检查结果 */
interface TypeCheckResult {
    /** 不匹配列表 */
    mismatches: TypeMismatch[];
}

/** 插入图片选项 */
interface InsertImageOptions {
    /** 目标行号 */
    row?: number;
    /** 目标列号 */
    col?: number;
    /** 完成回调 */
    onComplete?: (success: boolean) => void;
}

/**
 * 剪贴板管理器 (Clipboard Manager)
 *
 * 负责复制/粘贴的核心逻辑，不依赖插件系统，保持纯数据操作。
 * 由 CopyPasteStrategy 持有和调用，也可独立使用。
 *
 * 剪贴板策略：
 * - 复制：内部存储（含样式ID + 列类型）+ 系统剪贴板（TSV 纯文本）
 * - 粘贴：通过浏览器原生 paste 事件同步读取剪贴板（支持文本 + 图片）
 * - 类型检查：粘贴时验证源列类型与目标列类型一致，不一致则阻止粘贴
 *
 * 图片粘贴：
 * - 从 ClipboardEvent.clipboardData 中提取 image/png、image/jpeg 等 MIME 类型
 * - 图片 Blob 转为 Object URL，存入内部 #cellContent Map（不侵入 Cell 模型）
 * - 由 TileRenderer 通过 getCellContent() 查询并渲染
 *
 * @class ClipboardManager
 */
export class ClipboardManager {
    /** 内部剪贴板数据 */
    #data: ClipboardData | null = null;

    /**
     * 单元格富内容缓存：key = "sheetName,realR,col", value = { type, blob, objectUrl }
     * 与 Cell 模型解耦，由外部模块独立管理
     */
    #cellContent: Map<string, CellContentEntry> = new Map();

    /**
     * 复制当前选区到剪贴板
     * 同时写入内部存储（保留样式）和系统剪贴板（TSV 纯文本）
     * @param sheet - 工作表实例
     */
    copy(sheet: any): void {
        const range = sheet.selection.getRange();
        const accessor = sheet.cellDataAccessor;

        const columnTypes: string[] = [];
        for (let c = range.topCol; c <= range.bottomCol; c++) {
            const cellType = sheet.getCellTypeInstance(range.topRow, c);
            columnTypes.push(cellType ? cellType.name : "text");
        }
        const valueMatrix = accessor.getValueMatrix(range.topRow, range.topCol, range.bottomRow, range.bottomCol);

        const cells = valueMatrix.map((row: unknown[], rIdx: number) =>
            row.map((value: unknown, cIdx: number) => {
                const cell = accessor.get(range.topRow + rIdx, range.topCol + cIdx);
                return cell ? { value, styleId: cell.styleId || 0 } : null;
            }),
        );
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
     * @param sheet - 工作表实例
     * @param clipboardEvent - 浏览器原生 paste 事件
     * @returns 是否成功处理了粘贴
     */
    pasteFromEvent(sheet: any, clipboardEvent: ClipboardEvent): boolean {
        const items = clipboardEvent.clipboardData?.items;
        if (!items || items.length === 0) {
            if (this.#data) {
                this.pasteInternal(sheet);
                return true;
            }
            return false;
        }

        let hasImage = false;
        let textContent: DataTransferItem | null = null;

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

        if (hasImage) {
            sheet.render();
            return true;
        }

        if (textContent) {
            textContent.getAsString((text: string) => {
                this.pasteText(sheet, text);
            });
            return true;
        }

        if (this.#data) {
            this.pasteInternal(sheet);
            return true;
        }
        return false;
    }

    /**
     * 粘贴剪贴板内容到当前活动单元格位置（异步方式，兼容旧 API）
     * 优先读取系统剪贴板，fallback 到内部数据
     * @param sheet - 工作表实例
     * @deprecated 推荐使用 pasteFromEvent() 替代，以避免权限弹窗
     */
    paste(sheet: any): void {
        this.#readSystemClipboard(sheet);
    }

    /** 清空内部剪贴板数据（不影响已粘贴到单元格的图片） */
    clear(): void {
        this.#data = null;
    }

    /**
     * 检查粘贴时源列类型与目标列类型是否一致
     * 仅当目标列明确配置了不同类型时才阻止粘贴；
     * 目标列无类型配置（默认 text）时允许任意类型粘贴。
     *
     * @param sheet - 目标工作表
     * @param targetRow - 目标起始行
     * @param targetCol - 目标起始列
     * @param srcCols - 源数据列数（可选）
     * @returns 类型不匹配结果，无问题返回 null
     */
    #checkTypeMismatch(sheet: any, targetRow: number, targetCol: number, srcCols?: number): TypeCheckResult | null {
        if (!this.#data) return null;
        const cols = srcCols != null ? srcCols : this.#data.cols;
        const columnTypes = this.#data.columnTypes;
        const mismatches: TypeMismatch[] = [];

        for (let c = 0; c < cols; c++) {
            const srcType = columnTypes[c] || "text";
            const tc = targetCol + c;

            const colConfig = sheet.getColumnConfig(tc);
            const hasExplicitColType = colConfig?.type != null;
            const hasCellType = sheet.cellTypes?.has(`${targetRow},${tc}`);

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
     * 获取内部剪贴板数据（供 CopyPasteStrategy 在 beforePaste 钩子中使用）
     * @returns 剪贴板数据或 null
     */
    getClipboardData(): ClipboardData | null {
        return this.#data;
    }

    /** 写入系统剪贴板（TSV 纯文本） */
    #writeSystemClipboard(sheet: any, range: any, cells: (CellCopyData | null)[][]): void {
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
            navigator.clipboard.writeText(text).catch((err: Error) => {
                errorHandler.warn(ERROR_CODE.CLIPBOARD_WRITE_ERROR, "System clipboard write failed, using fallback", { originalError: err });
                this.#fallbackWriteText(text);
            });
        } else {
            this.#fallbackWriteText(text);
        }
    }

    /** 降级方式写入剪贴板（使用 document.execCommand） */
    #fallbackWriteText(text: string): void {
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

    /** 异步读取系统剪贴板 */
    #readSystemClipboard(sheet: any): void {
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard
                .readText()
                .then((text: string) => {
                    if (text) {
                        this.pasteText(sheet, text);
                    } else if (this.#data) {
                        this.pasteInternal(sheet);
                    }
                })
                .catch((err: Error) => {
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
     * @param sheet - 工作表实例
     * @param text - TSV 格式文本
     */
    pasteText(sheet: any, text: string): void {
        const [targetRow, targetCol] = sheet.selection.getActive();
        const rows = text.split("\n");

        let srcCols = 0;
        for (let r = 0; r < rows.length; r++) {
            if (rows[r] === "" && r === rows.length - 1) continue;
            const colCount = rows[r].split("\t").length;
            if (colCount > srcCols) srcCols = colCount;
        }

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
                    const parsedValue = sheet.parseCellValue(tr, tc, cols[c]);
                    sheet.setCell(tr, tc, parsedValue);
                }
            }
        }
        sheet.endBatch();

        sheet.invalidateAll();
        sheet.render();
    }

    /**
     * 粘贴内部剪贴板数据（公开方法，供 CopyPasteStrategy 调用）
     * @param sheet - 工作表实例
     */
    pasteInternal(sheet: any): void {
        if (!this.#data) return;
        const [targetRow, targetCol] = sheet.selection.getActive();

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

                const srcR = this.#data.topRow + r;
                const srcC = this.#data.topCol + c;
                const displayText = sheet.formatCellValue(srcR, srcC, cellData.value);
                const parsedValue = sheet.parseCellValue(tr, tc, displayText);
                sheet.setCell(tr, tc, parsedValue, cellData.styleId);
            }
        }
        sheet.endBatch();

        sheet.invalidateAll();
        sheet.render();
    }

    /** 生成单元格富内容的唯一 key */
    #cellKey(sheet: any, realR: number, col: number): string {
        return `${sheet.name},${realR},${col}`;
    }

    /**
     * 为指定单元格设置图片内容
     * 将 Blob 转为 Object URL，存入 #cellContent Map。
     * @param sheet - 工作表实例
     * @param r - 行号
     * @param c - 列号
     * @param blob - 图片 Blob 数据
     */
    setCellImage(sheet: any, r: number, c: number, blob: Blob): void {
        const key = this.#cellKey(sheet, r, c);

        const old = this.#cellContent.get(key);
        if (old) {
            URL.revokeObjectURL(old.objectUrl);
        }

        const objectUrl = URL.createObjectURL(blob);
        this.#cellContent.set(key, { type: "image", blob, objectUrl });

        if (!sheet.cellStore.get(r, c)) {
            sheet.setCell(r, c, "");
        }

        sheet.invalidateAll();
    }

    /**
     * 获取指定单元格的富内容信息
     * @param sheet - 工作表实例
     * @param realR - 实际行号
     * @param col - 列号
     * @returns 富内容信息，无则返回 null
     */
    getCellContent(sheet: any, realR: number, col: number): { type: string; objectUrl: string } | null {
        const key = this.#cellKey(sheet, realR, col);
        const content = this.#cellContent.get(key);
        if (!content) return null;
        return { type: content.type, objectUrl: content.objectUrl };
    }

    /**
     * 清除指定单元格的富内容
     * @param sheet - 工作表实例
     * @param realR - 实际行号
     * @param col - 列号
     */
    removeCellContent(sheet: any, realR: number, col: number): void {
        const key = this.#cellKey(sheet, realR, col);
        const content = this.#cellContent.get(key);
        if (content) {
            URL.revokeObjectURL(content.objectUrl);
            this.#cellContent.delete(key);
        }
    }

    /** 粘贴图片到当前活动单元格 */
    #pasteImage(sheet: any, blob: Blob): void {
        const [targetRow, targetCol] = sheet.selection.getActive();
        if (sheet.isDisabled(targetRow, targetCol)) return;

        this.setCellImage(sheet, targetRow, targetCol, blob);
    }

    /**
     * 通过文件选择器插入图片到当前活动单元格
     * @param sheet - 工作表实例
     * @param options - 插入选项
     */
    insertImageFromFile(sheet: any, options: InsertImageOptions = {}): void {
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

        input.addEventListener("cancel", () => {
            options.onComplete?.(false);
            input.remove();
        });

        document.body.appendChild(input);
        input.click();
    }

    /** 销毁剪贴板管理器，释放所有资源 */
    destroy(): void {
        this.#data = null;
        for (const [, content] of this.#cellContent) {
            URL.revokeObjectURL(content.objectUrl);
        }
        this.#cellContent.clear();
    }
}