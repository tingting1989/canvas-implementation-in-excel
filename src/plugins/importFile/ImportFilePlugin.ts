import ExcelJS from "exceljs";
import { BasePlugin } from "../base/BasePlugin.js";
import { StyleConverter } from "../../shared/StyleConverter.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { HOOKS } from "../../constants/hookNames.js";
import { colToIndex } from "../../utils/cellRef.js";
import { excelWidthToPixel, excelHeightToPixel } from "../../utils/excelUnits.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

interface ImportOptions {
    startRow?: number;
    startCol?: number;
    firstRowAsHeader?: boolean;
    applyStyles?: boolean;
    overwriteExisting?: boolean;
    batchSize?: number;
    applyMerges?: boolean;
    applyDimensions?: boolean;
    headerRows?: number;
    dataStartRow?: number;
    _autoDetectedHeaderRows?: number;
}

interface ImportResult {
    success: boolean;
    rowCount: number;
    colCount: number;
    taskId: number;
    timestamp: Date;
    warnings?: any[];
}

interface FilePreview {
    fileName: string;
    fileSize: number;
    fileType: string;
    totalRows?: number;
    totalCols?: number;
    previewData?: any[][];
    sheetName?: string;
    hasStyles?: boolean;
    hasMergedCells?: boolean;
    success: boolean;
    error?: string;
}

interface ParsedData {
    cells: any[][];
    styles: any[];
    mergedCells: string[];
    columnWidths: any[];
    rowHeights: any[];
    sheetName: string;
}

interface CellRange {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}

interface CellPosition {
    row: number;
    col: number;
}

interface ImportProgress {
    percent: number;
    stage: string;
    message: string;
    taskId?: number;
    processedRows?: number;
    totalRows?: number;
}

export class ImportFilePlugin extends BasePlugin {
    static get PLUGIN_NAME(): string {
        return "importFile";
    }

    #styleConverter: StyleConverter | null = null;
    #currentTaskId: number = 0;
    #cancelled: boolean = false;

    init(options: Record<string, any> = {}): void {
        super.init(options);
        this.#styleConverter = new StyleConverter();
        if (options.enabled === false) {
            this.disable();
        }
    }

    destroy(): void {
        this.#styleConverter = null;
        this.#cancelled = false;
        super.destroy();
    }

    enable(): void {
        super.enable();
    }

    disable(): void {
        super.disable();
    }

    async importFromFile(file: File, userOptions: Record<string, any> = {}): Promise<ImportResult> {
        const taskId = ++this.#currentTaskId;
        this.#cancelled = false;
        this.#styleConverter?.clearWarnings();

        const options: ImportOptions = {
            startRow: 0,
            startCol: 0,
            firstRowAsHeader: true,
            applyStyles: true,
            overwriteExisting: true,
            batchSize: 100,
            applyMerges: true,
            applyDimensions: true,
            headerRows: 1,
            dataStartRow: undefined,
            ...userOptions,
        };

        try {
            const preview = await this.previewFile(file, { previewRows: 10 });
            const shouldContinue = this.hooks?.runHooksUntil(HOOKS.IMPORT_BEFORE_IMPORT, preview);

            if (shouldContinue === false) {
                throw new Error(ERROR_CODE.IMPORT_CANCELLED_BY_USER);
            }

            this.#emitProgress({ percent: 0, stage: "reading", message: "正在读取文件...", taskId });

            const arrayBuffer = await file.arrayBuffer();

            this.#emitProgress({ percent: 10, stage: "parsing", message: "正在解析文件结构...", taskId });

            const parsedData = await this.#parseExcelFile(arrayBuffer, file.name, options);

            this.#emitProgress({ percent: 15, stage: "validating", message: "正在验证数据...", taskId });

            this.#validateData(parsedData);

            if (parsedData.mergedCells && parsedData.mergedCells.length > 0) {
                const nestedHeaders = this.#extractNestedHeaders(parsedData, options);

                if (nestedHeaders && nestedHeaders.length > 0) {
                    if (this.workbook?.updateSettings) {
                        this.workbook.updateSettings({ nestedHeaders });
                        options._autoDetectedHeaderRows = nestedHeaders.length;
                    }
                }
            }

            this.#emitProgress({ percent: 20, stage: "applying", message: "正在写入数据...", taskId });

            await this.#applyToSheet(parsedData, options, taskId);

            if (options.applyStyles && parsedData.styles.length > 0) {
                this.#emitProgress({ percent: 80, stage: "styling", message: "正在应用样式...", taskId });
                await this.#applyStyles(parsedData, options, taskId);
            }

            if (options.applyMerges && parsedData.mergedCells && parsedData.mergedCells.length > 0) {
                this.#emitProgress({ percent: 90, stage: "merging", message: "正在应用合并单元格...", taskId });
                await this.#applyMergedCells(parsedData.mergedCells, options, taskId);
            }

            if (options.applyDimensions) {
                await this.#applyDimensions(parsedData, options, taskId);
            }

            this.#emitProgress({ percent: 100, stage: "refreshing", message: "正在刷新视图...", taskId });

            const sheet = this.sheet;
            if (sheet) {
                try {
                    if (typeof sheet.invalidateAll === "function") {
                        sheet.invalidateAll();
                    }
                    if (typeof sheet.render === "function") {
                        sheet.render();
                    }
                    if (typeof sheet.invalidateFreezeCache === "function") {
                        sheet.invalidateFreezeCache();
                    }
                } catch (refreshError: any) {
                    errorHandler.error(ERROR_CODE.IMPORT_DIMENSION_WARNING, "导入后刷新视图时发生错误（不影响数据）", {
                        error: refreshError.message,
                    });
                }
            }

            const result: ImportResult = {
                success: true,
                rowCount: parsedData.cells.length,
                colCount: parsedData.cells[0]?.length || 0,
                taskId,
                timestamp: new Date(),
                warnings: this.#styleConverter?.warnings || [],
            };

            this.hooks?.runHooks(HOOKS.IMPORT_COMPLETE, result);

            return result;
        } catch (error: any) {
            const importError = {
                code: this.#classifyError(error),
                message: error.message,
                taskId,
                timestamp: new Date(),
                stack: error.stack,
            };

            this.hooks?.runHooks(HOOKS.IMPORT_ERROR, importError);

            throw error;
        }
    }

    async previewFile(file: File, previewOptions: Record<string, any> = {}): Promise<FilePreview> {
        const { previewRows = 10 } = previewOptions;

        try {
            const arrayBuffer = await file.arrayBuffer();
            const fullData = await this.#parseExcelFile(arrayBuffer, file.name, { applyStyles: false });

            const previewCells = fullData.cells.slice(0, previewRows);

            return {
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                totalRows: fullData.cells.length,
                totalCols: fullData.cells[0]?.length || 0,
                previewData: previewCells,
                sheetName: fullData.sheetName,
                hasStyles: fullData.styles.length > 0,
                hasMergedCells: fullData.mergedCells.length > 0,
                success: true,
            };
        } catch (error: any) {
            return {
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                error: error.message,
                success: false,
            };
        }
    }

    cancelImport(): void {
        this.#cancelled = true;
    }

    async #parseExcelFile(arrayBuffer: ArrayBuffer, filename: string, options: ImportOptions): Promise<ParsedData> {
        if (!this.#isExcelFile(filename)) {
            errorHandler.throw(ERROR_CODE.INVALID_FILE_FORMAT, `不支持的文件格式: ${filename}`);
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        const worksheet = workbook.worksheets[0];

        const result: ParsedData = {
            cells: [],
            styles: [],
            mergedCells: [],
            columnWidths: [],
            rowHeights: [],
            sheetName: worksheet.name,
        };

        worksheet.eachRow((row: any, rowNumber: number) => {
            const rowData: any[] = [];
            const rowStyles: any[] = [];

            row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
                rowData.push(cell.value);

                if (options.applyStyles) {
                    const style = cell.style || {};

                    const hasStyle = Object.keys(style).some((key) => {
                        const value = style[key];
                        return (
                            value !== undefined && value !== null && value !== "" && !(typeof value === "object" && Object.keys(value).length === 0)
                        );
                    });

                    if (hasStyle) {
                        rowStyles.push({
                            row: rowNumber - 1,
                            col: colNumber - 1,
                            style: style,
                        });
                    }
                }
            });

            result.cells.push(rowData);
            result.styles.push(...rowStyles);

            if (row.height) {
                result.rowHeights.push({
                    row: rowNumber - 1,
                    height: excelHeightToPixel(row.height),
                });
            }
        });

        worksheet.columns.forEach((col: any, index: number) => {
            if (col.width) {
                result.columnWidths.push({
                    col: index,
                    width: excelWidthToPixel(col.width),
                });
            }
        });

        result.mergedCells = this.#extractMergesFromWorksheet(worksheet);

        return result;
    }

    #extractMergesFromWorksheet(worksheet: any): string[] {
        const merges: string[] = [];

        try {
            const rawMerges = this.#getRawMerges(worksheet);
            if (!rawMerges) return merges;
            this.#normalizeMergesToArray(rawMerges, merges);
        } catch (error: any) {
            errorHandler.warn(ERROR_CODE.IMPORT_MERGE_WARNING, "提取合并单元格失败", { error: error.message });
        }

        return merges;
    }

    #getRawMerges(worksheet: any): any {
        if (worksheet.model?.merges) {
            return worksheet.model.merges;
        }

        const alternativeProps = ["model._merges", "model.mergeCells", "_worksheet.merges", "_merges"];

        for (const prop of alternativeProps) {
            const value = prop.split(".").reduce((obj: any, key: string) => obj?.[key], worksheet);
            if (value && (Array.isArray(value) || value.length > 0)) {
                return value;
            }
        }

        if (typeof worksheet.getMergeCells === "function") {
            return worksheet.getMergeCells();
        }

        return null;
    }

    #normalizeMergesToArray(rawMerges: any, target: string[]): void {
        if (Array.isArray(rawMerges)) {
            rawMerges.forEach((merge) => {
                if (merge) target.push(String(merge));
            });
        } else if (rawMerges[Symbol.iterator]) {
            for (const merge of rawMerges) {
                if (merge) target.push(String(merge));
            }
        } else if (typeof rawMerges === "string") {
            target.push(rawMerges);
        } else if (typeof rawMerges === "object") {
            Object.keys(rawMerges).forEach((key) => target.push(key));
        }
    }

    #isExcelFile(filename: string): boolean {
        return filename.toLowerCase().endsWith(".xlsx");
    }

    #detectAdditionalHeaderRows(cells: any[][], currentHeaderRows: number, mergedCells: string[]): number {
        if (!cells || cells.length <= currentHeaderRows) {
            return currentHeaderRows;
        }

        let extendedHeaderRows = currentHeaderRows;
        const maxAdditionalRows = Math.min(2, cells.length - currentHeaderRows);

        for (let i = 0; i < maxAdditionalRows; i++) {
            const checkRow = currentHeaderRows + i;
            const rowData = cells[checkRow];
            if (!rowData || rowData.length === 0) break;

            const isLikelyHeader = this.#isRowLikelyHeader(rowData, checkRow);
            if (isLikelyHeader) {
                extendedHeaderRows++;
            } else {
                break;
            }
        }

        return extendedHeaderRows;
    }

    #isRowLikelyHeader(rowData: any[], rowIndex: number): boolean {
        if (!rowData || rowData.length === 0) return false;

        let textCount = 0;
        let shortTextCount = 0;
        let nonEmptyCount = 0;

        for (const cell of rowData) {
            if (cell === undefined || cell === null) continue;

            nonEmptyCount++;
            const cellStr = String(cell).trim();

            if (typeof cell === "string" || cell instanceof String) {
                textCount++;
                if (cellStr.length <= 20) {
                    shortTextCount++;
                }
            }

            if (typeof cell === "number" && cell > 1900 && cell < 2100) {
            } else if (typeof cell === "number" && cell > 10000) {
                return false;
            }

            if (cellStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return false;
            }
        }

        const nonEmptyRatio = nonEmptyCount / rowData.length;
        const textRatio = textCount / Math.max(nonEmptyCount, 1);
        const shortTextRatio = shortTextCount / Math.max(nonEmptyCount, 1);

        return nonEmptyRatio > 0.5 && textRatio > 0.7 && shortTextRatio > 0.6;
    }

    #extractNestedHeaders(parsedData: ParsedData, options: ImportOptions): any[] | null {
        const { mergedCells, cells, styles } = parsedData;

        if (!mergedCells || mergedCells.length === 0 || !cells || cells.length === 0) {
            return null;
        }

        const mergeRegions: any[] = [];

        for (const mergeRange of mergedCells) {
            const range = this.#parseCellRange(mergeRange);
            if (range) {
                mergeRegions.push({
                    range: mergeRange,
                    startRow: range.startRow,
                    startCol: range.startCol,
                    endRow: range.endRow,
                    endCol: range.endCol,
                    colspan: range.endCol - range.startCol + 1,
                    rowspan: range.endRow - range.startRow + 1,
                    originalRange: mergeRange,
                });
            }
        }

        const headerRowsFromMerges = Math.max(...mergeRegions.map((m) => m.endRow), 0) + 1;
        const headerRowsFromUser = options.headerRows && options.headerRows > 1 ? options.headerRows : 0;

        let headerRows: number;

        if (headerRowsFromUser > 0) {
            headerRows = Math.max(headerRowsFromUser, headerRowsFromMerges);
        } else {
            headerRows = headerRowsFromMerges;
            const potentialHeaderRows = this.#detectAdditionalHeaderRows(cells, headerRows, mergedCells);
            if (potentialHeaderRows > headerRows) {
                headerRows = potentialHeaderRows;
            }
        }

        if (headerRows <= 1) {
            return null;
        }

        const nestedHeaders: any[] = [];

        for (let row = 0; row < headerRows; row++) {
            const rowHeaders: any[] = [];
            let col = 0;

            while (col < cells[row].length) {
                const mergeAtPosition = mergeRegions.find((m) => m.startRow === row && m.startCol === col);

                if (mergeAtPosition) {
                    const cellValue = cells[row][col];
                    const styleInfo = styles.find((s) => s.row === row && s.col === col);
                    let canvasStyle: Record<string, any> = {};

                    if (styleInfo?.style && options.applyStyles) {
                        canvasStyle = this.#styleConverter?.convertFromExcel(styleInfo.style, "flat") || {};
                    }

                    const headerItem: Record<string, any> = {
                        label: cellValue || "",
                        colspan: mergeAtPosition.colspan,
                    };

                    if (Object.keys(canvasStyle).length > 0) {
                        headerItem.style = canvasStyle;
                    }

                    rowHeaders.push(headerItem);
                    col += mergeAtPosition.colspan;
                } else {
                    const cellValue = cells[row][col];
                    const styleInfo = styles.find((s) => s.row === row && s.col === col);
                    let canvasStyle: Record<string, any> = {};

                    if (styleInfo?.style && options.applyStyles) {
                        canvasStyle = this.#styleConverter?.convertFromExcel(styleInfo.style, "flat") || {};
                    }

                    if (typeof cellValue === "string" || typeof cellValue === "number") {
                        if (Object.keys(canvasStyle).length > 0) {
                            rowHeaders.push({
                                label: String(cellValue),
                                style: canvasStyle,
                            });
                        } else {
                            rowHeaders.push(String(cellValue));
                        }
                    } else {
                        rowHeaders.push("");
                    }

                    col++;
                }
            }

            nestedHeaders.push(rowHeaders);
        }

        return nestedHeaders;
    }

    #calculateDataStartRow(options: ImportOptions): number {
        const { dataStartRow, headerRows, firstRowAsHeader, _autoDetectedHeaderRows } = options;
        const sheet = this.sheet;

        const nestedHeadersCount = sheet?.nestedHeaders && Array.isArray(sheet.nestedHeaders) ? sheet.nestedHeaders.length : 0;

        if (dataStartRow !== undefined && dataStartRow !== null) {
            return dataStartRow;
        }

        if (_autoDetectedHeaderRows && _autoDetectedHeaderRows > 1) {
            return _autoDetectedHeaderRows;
        }

        if (headerRows && headerRows > 1) {
            return headerRows;
        }

        if (nestedHeadersCount > 1) {
            return nestedHeadersCount;
        }

        if (firstRowAsHeader) {
            return 1;
        }

        return 0;
    }

    #validateData(data: ParsedData): void {
        if (!data || !Array.isArray(data.cells)) {
            throw new Error("数据格式无效：缺少 cells 数组");
        }

        if (this.#cancelled) {
            throw new Error(ERROR_CODE.IMPORT_CANCELLED_BY_USER);
        }
    }

    async #applyToSheet(data: ParsedData, options: ImportOptions, taskId: number): Promise<void> {
        const sheet = this.sheet;
        if (!sheet) {
            errorHandler.throw(ERROR_CODE.IMPORT_FILE_PARSE_ERROR, "当前没有活动工作表");
        }

        const { startRow = 0, startCol = 0, batchSize = 100 } = options;

        let actualDataStartRow = this.#calculateDataStartRow(options);
        actualDataStartRow = Math.max(0, Math.min(actualDataStartRow, data.cells.length));

        let processedCount = 0;

        for (let r = actualDataStartRow; r < data.cells.length; r++) {
            if (this.#cancelled) {
                throw new Error(ERROR_CODE.IMPORT_CANCELLED_BY_USER);
            }

            const row = data.cells[r];

            for (let c = 0; c < row.length; c++) {
                const value = row[c];
                const targetRow = startRow + (r - actualDataStartRow);
                const targetCol = startCol + c;

                if (value !== undefined && value !== null) {
                    sheet.cellStore.set(targetRow, targetCol, { value });
                }
            }

            processedCount++;

            if (processedCount % batchSize === 0) {
                this.hooks?.runHooks(HOOKS.IMPORT_ROW_PROCESSED, {
                    rowIndex: r,
                    rowData: row,
                    processedCount,
                    totalCount: data.cells.length - actualDataStartRow,
                });

                const percent = Math.min(80, 20 + (processedCount / (data.cells.length - actualDataStartRow)) * 60);
                this.#emitProgress({
                    percent,
                    stage: "applying",
                    message: `正在写入数据... (${processedCount}/${data.cells.length - actualDataStartRow})`,
                    processedRows: processedCount,
                    totalRows: data.cells.length - actualDataStartRow,
                    taskId,
                });
            }
        }

        if (processedCount % batchSize !== 0) {
            this.hooks?.runHooks(HOOKS.IMPORT_ROW_PROCESSED, {
                rowIndex: data.cells.length - 1,
                rowData: data.cells[data.cells.length - 1],
                processedCount,
                totalCount: data.cells.length,
            });
        }
    }

    async #applyStyles(data: ParsedData, options: ImportOptions, taskId: number): Promise<void> {
        const sheet = this.sheet;
        if (!sheet || !this.#styleConverter) {
            errorHandler.error(ERROR_CODE.IMPORT_STYLE_CONVERSION_ERROR, "#applyStyles 失败: 缺少必要的依赖", {
                hasSheet: !!sheet,
                hasStyleConverter: !!this.#styleConverter,
            });
            return;
        }

        const { startRow = 0, startCol = 0 } = options;
        const styleFilterStartRow = this.#calculateDataStartRow(options);
        let appliedCount = 0;
        let successCount = 0;
        let failCount = 0;
        let emptyStyleCount = 0;
        let skippedHeaderStyles = 0;

        for (let idx = 0; idx < data.styles.length; idx++) {
            if (this.#cancelled) {
                throw new Error(ERROR_CODE.IMPORT_CANCELLED_BY_USER);
            }

            const styleInfo = data.styles[idx];
            const { row, col, style: excelStyle } = styleInfo;

            try {
                const canvasStyle = this.#styleConverter.convertFromExcel(excelStyle, "flat");

                if (Object.keys(canvasStyle).length > 0) {
                    if (row < styleFilterStartRow) {
                        skippedHeaderStyles++;
                        continue;
                    }

                    const targetRow = startRow + (row - styleFilterStartRow);
                    const targetCol = startCol + col;

                    try {
                        if (typeof sheet.setCellStyle === "function") {
                            sheet.setCellStyle(targetRow, targetCol, canvasStyle);
                            successCount++;
                        }
                    } catch (error) {
                        failCount++;
                    }
                } else {
                    emptyStyleCount++;
                }

                appliedCount++;
            } catch (warning: any) {
                failCount++;

                this.hooks?.runHooks(HOOKS.IMPORT_STYLE_WARNING, {
                    message: warning.message || "样式转换失败",
                    cellLocation: { row: startRow + row, col: startCol + col },
                    originalStyle: excelStyle,
                    convertedStyle: warning.fallbackStyle || {},
                });
            }
        }
    }

    async #applyMergedCells(mergedCells: string[], options: ImportOptions, taskId: number): Promise<void> {
        const sheet = this.sheet;
        if (!sheet || !mergedCells) return;

        const { startRow = 0, startCol = 0 } = options;

        const mergeArray: string[] = [];
        try {
            this.#normalizeMergesToArray(mergedCells, mergeArray);
        } catch (error: any) {
            errorHandler.warn(ERROR_CODE.IMPORT_MERGE_WARNING, "合并单元格格式转换失败", { error: error.message });
            return;
        }

        if (mergeArray.length === 0) return;

        const headerRowCount = this.#calculateDataStartRow(options);

        let appliedCount = 0;
        let skippedHeaderMerges = 0;
        let failedCount = 0;

        for (let idx = 0; idx < mergeArray.length; idx++) {
            const mergeRange = mergeArray[idx];

            if (this.#cancelled) {
                throw new Error(ERROR_CODE.IMPORT_CANCELLED_BY_USER);
            }

            try {
                const range = this.#parseCellRange(mergeRange);

                if (range) {
                    const { startRow: sRow, startCol: sCol, endRow: eRow, endCol: eCol } = range;

                    if (headerRowCount > 0 && eRow < headerRowCount) {
                        skippedHeaderMerges++;
                        continue;
                    }

                    let adjustedStartRow: number, adjustedStartCol: number, adjustedEndRow: number, adjustedEndCol: number;

                    if (headerRowCount > 0) {
                        if (sRow < headerRowCount) {
                            adjustedStartRow = startRow;
                        } else {
                            adjustedStartRow = startRow + (sRow - headerRowCount);
                        }

                        adjustedStartCol = startCol + sCol;
                        adjustedEndRow = startRow + Math.max(0, eRow - headerRowCount);
                        adjustedEndCol = startCol + eCol;
                    } else {
                        adjustedStartRow = sRow + startRow;
                        adjustedStartCol = sCol + startCol;
                        adjustedEndRow = eRow + startRow;
                        adjustedEndCol = eCol + startCol;
                    }

                    if (sheet.mergeManager && typeof sheet.mergeManager.mergeCells === "function") {
                        sheet.mergeManager.mergeCells(adjustedStartRow, adjustedStartCol, adjustedEndRow, adjustedEndCol);
                        appliedCount++;
                    } else if (typeof sheet.mergeCells === "function") {
                        sheet.mergeCells(adjustedStartRow, adjustedStartCol, adjustedEndRow, adjustedEndCol);
                        appliedCount++;
                    } else {
                        failedCount++;
                    }
                } else {
                    failedCount++;
                }
            } catch (error: any) {
                errorHandler.warn(ERROR_CODE.IMPORT_MERGE_WARNING, `合并单元格失败: ${mergeRange}`, {
                    mergeRange,
                    error: error.message,
                });
                failedCount++;
            }
        }
    }

    async #applyDimensions(data: ParsedData, options: ImportOptions, taskId: number): Promise<void> {
        const sheet = this.sheet;
        if (!sheet) return;

        const { startCol = 0, startRow = 0 } = options;

        if (data.columnWidths && data.columnWidths.length > 0) {
            for (const colInfo of data.columnWidths) {
                try {
                    const targetCol = colInfo.col + startCol;
                    if (sheet.rowColManager && typeof sheet.rowColManager.setColWidth === "function") {
                        sheet.rowColManager.setColWidth(targetCol, colInfo.width);
                    }
                } catch (error: any) {
                    errorHandler.warn(ERROR_CODE.IMPORT_DIMENSION_WARNING, `设置列宽失败: 列 ${colInfo.col}`, {
                        col: colInfo.col,
                        error: error.message,
                    });
                }
            }
        }

        if (data.rowHeights && data.rowHeights.length > 0) {
            const headerRowCount = this.#calculateDataStartRow(options);
            for (const rowInfo of data.rowHeights) {
                try {
                    if (rowInfo.row < headerRowCount) continue;

                    const targetRow = startRow + (rowInfo.row - headerRowCount);

                    if (sheet.rowColManager && typeof sheet.rowColManager.setRowHeight === "function") {
                        sheet.rowColManager.setRowHeight(targetRow, rowInfo.height);
                    }
                } catch (error: any) {
                    errorHandler.warn(ERROR_CODE.IMPORT_DIMENSION_WARNING, `设置行高失败: 行 ${rowInfo.row}`, {
                        row: rowInfo.row,
                        error: error.message,
                    });
                }
            }
        }
    }

    #parseCellRange(range: string): CellRange | null {
        if (!range || typeof range !== "string") return null;

        try {
            const cleanRange = range.replace(/\$/g, "");
            const parts = cleanRange.split(":");

            if (parts.length !== 2) return null;

            const [startRef, endRef] = parts;
            const startPos = this.#cellRefToPosition(startRef);
            const endPos = this.#cellRefToPosition(endRef);

            if (!startPos || !endPos) return null;

            return {
                startRow: startPos.row,
                startCol: startPos.col,
                endRow: endPos.row,
                endCol: endPos.col,
            };
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.IMPORT_RANGE_PARSE_ERROR, `无法解析单元格范围: ${range}`, {
                range,
                error: error.message,
            });
            return null;
        }
    }

    #cellRefToPosition(cellRef: string): CellPosition | null {
        if (!cellRef || typeof cellRef !== "string") return null;

        try {
            const match = cellRef.match(/^([A-Z]+)(\d+)$/i);
            if (!match) return null;

            const [, colStr, rowStr] = match;
            const col = colToIndex(colStr);
            const row = parseInt(rowStr, 10) - 1;

            return { row, col };
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.IMPORT_RANGE_PARSE_ERROR, `无法解析单元格引用: ${cellRef}`, {
                cellRef,
                error: error.message,
            });
            return null;
        }
    }

    #excelHeightToPixel(heightInPoints: number): number {
        if (!heightInPoints || typeof heightInPoints !== "number" || heightInPoints <= 0) {
            return 28;
        }
        const pixelHeight = Math.round(heightInPoints * (96 / 72));
        return Math.max(pixelHeight, 15);
    }

    #excelWidthToPixel(charWidth: number): number {
        if (!charWidth || typeof charWidth !== "number" || charWidth <= 0) {
            return 100;
        }
        const pixelWidth = Math.round(charWidth * 7 + 5);
        return Math.max(pixelWidth, 20);
    }

    #classifyError(error: Error): string {
        const message = error.message?.toUpperCase() || "";

        if (message.includes("FILE") || message.includes("READ")) {
            return ERROR_CODE.IMPORT_FILE_READ_ERROR;
        }
        if (message.includes("PARSE") || message.includes("INVALID")) {
            return ERROR_CODE.IMPORT_FILE_PARSE_ERROR;
        }
        if (message.includes("UNSUPPORTED")) {
            return ERROR_CODE.IMPORT_UNSUPPORTED_FORMAT;
        }
        if (message.includes("VALIDATION")) {
            return ERROR_CODE.IMPORT_DATA_VALIDATION_ERROR;
        }
        if (message.includes("STYLE")) {
            return ERROR_CODE.IMPORT_STYLE_CONVERSION_ERROR;
        }
        if (message.includes("CANCELLED")) {
            return ERROR_CODE.IMPORT_CANCELLED_BY_USER;
        }

        return ERROR_CODE.IMPORT_UNKNOWN_ERROR;
    }

    #emitProgress(progress: ImportProgress): void {
        this.hooks?.runHooks(HOOKS.IMPORT_PROGRESS, progress);
    }
}
