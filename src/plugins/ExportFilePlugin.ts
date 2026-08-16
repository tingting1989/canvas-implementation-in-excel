import ExcelJS from "exceljs";
import JSZip from "jszip";
import { BasePlugin } from "./BasePlugin.js";
import { indexToCol } from "../utils/cellRef";
import { stylePool } from "../model/styles/index.js";
import { HOOKS } from "../constants/hookNames.js";
import { pixelToExcelHeight, pixelToExcelWidth } from "../utils/excelUnits.js";
import { StyleConverter, toArgb } from "../shared/StyleConverter.js";
import { errorHandler } from "../core/ErrorHandler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";
import { CONFIG } from "../constants/config.js";

const HEADER_BG_COLOR = "D9E1F2";
const DEFAULT_BORDER_STYLE = "thin";
const DEFAULT_COLUMN_WIDTH = 15;
const DEFAULT_ROW_HEIGHT = 15;

interface FormatPreset {
    separator?: string;
    mimeType: string;
    fileExtension: string;
    isBinary: boolean;
}

interface ExportOptions {
    columnHeaders?: boolean;
    rowHeaders?: boolean;
    separator?: string;
    mimeType?: string;
    fileExtension?: string;
    filename?: string;
    encoding?: string;
    bom?: boolean;
    nestedHeaders?: boolean;
    cellStyles?: boolean;
    range?: DataRange;
    [key: string]: any;
}

interface DataRange {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}

const FORMAT_PRESETS: Record<string, FormatPreset> = {
    csv: {
        separator: ",",
        mimeType: "text/csv",
        fileExtension: "csv",
        isBinary: false,
    },
    tsv: {
        separator: "\t",
        mimeType: "text/tab-separated-values",
        fileExtension: "tsv",
        isBinary: false,
    },
    xlsx: {
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileExtension: "xlsx",
        isBinary: true,
    },
};

const DEFAULT_OPTIONS: ExportOptions = {
    columnHeaders: undefined,
    rowHeaders: false,
    separator: ",",
    mimeType: "text/csv",
    fileExtension: "csv",
    filename: "data",
    encoding: "utf-8",
    bom: true,
    nestedHeaders: false,
    cellStyles: false,
};

function buildOptions(format: string, userOptions: Record<string, any>): ExportOptions {
    const preset = FORMAT_PRESETS[format] || FORMAT_PRESETS.csv;
    return { ...DEFAULT_OPTIONS, ...preset, ...userOptions };
}

function isDefaultAlphabetHeaders(headers: any): boolean {
    if (!Array.isArray(headers)) return false;

    for (let i = 0; i < headers.length; i += 1) {
        const expected = indexToCol(i);
        if (headers[i] !== expected) return false;
    }
    return true;
}

function resolveHeaderDefaults(sheet: any, opts: ExportOptions): void {
    if (opts.columnHeaders === undefined) {
        const shouldExportColumnHeaders =
            Array.isArray(sheet.colHeaders) && sheet.colHeaders.length > 0 && !isDefaultAlphabetHeaders(sheet.colHeaders);

        Object.defineProperty(opts, "columnHeaders", {
            value: shouldExportColumnHeaders,
            writable: true,
            enumerable: true,
            configurable: true,
        });
    }
}

function escapeField(value: any, separator: string): string {
    const str = value === null || value === undefined ? "" : String(value);

    const needsEscape = str.includes(separator) || str.includes('"') || str.includes("\n") || str.includes("\r");

    if (needsEscape) {
        return '"' + str.replace(/"/g, '""') + '"';
    }

    return str;
}

function serialize(rows: any[][], separator: string): string {
    return rows.map((row) => row.map((v) => escapeField(v, separator)).join(separator)).join("\r\n");
}

function getDataRange(sheet: any): DataRange | null {
    let maxRow = -1;
    let maxCol = -1;

    let chunks = sheet.cellStore.chunks;
    if (typeof chunks === "function") {
        chunks = chunks();
    }

    if (!chunks) {
        return null;
    }

    const isIterable = chunks && typeof chunks[Symbol.iterator] === "function";
    if (!isIterable) {
        return null;
    }

    try {
        for (const chunk of chunks) {
            const actualChunk = Array.isArray(chunk) ? chunk[1] : chunk;
            for (const { row, col } of actualChunk.iterate()) {
                if (row > maxRow) maxRow = row;
                if (col > maxCol) maxCol = col;
            }
        }
    } catch (e) {
        return null;
    }

    return maxRow >= 0 ? { startRow: 0, startCol: 0, endRow: maxRow, endCol: maxCol } : null;
}

function buildRows(sheet: any, opts: ExportOptions, range: DataRange | null): any[][] {
    if (!range) return [];

    const { startRow, startCol, endRow, endCol } = range;
    const rows: any[][] = [];

    if (opts.columnHeaders) {
        const headerRow: string[] = [];
        for (let c = startCol; c <= endCol; c++) {
            headerRow.push(sheet.getColHeader(c));
        }
        rows.push(headerRow);
    }

    const accessor = sheet.cellDataAccessor;
    const dataRows = accessor.getValueMatrix(startRow, startCol, endRow, endCol);
    rows.push(...dataRows);

    return rows;
}

function toBlob(str: string, opts: ExportOptions): Blob {
    const content = opts.bom && opts.encoding === "utf-8" ? "\uFEFF" + str : str;
    return new Blob([content], { type: `${opts.mimeType};charset=${opts.encoding}` });
}

function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";

    document.body.appendChild(anchor);
    anchor.click();

    setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(anchor);
    }, 100);
}

const DEFAULT_BORDER_COLOR: string = toArgb(CONFIG.GRID_COLOR || "#ddd");

const _styleConverter = new StyleConverter();

function convertToExcelStyle(style: Record<string, any> | null): Record<string, any> {
    return _styleConverter.convertToExcel(style);
}

function getMergedCellStyle(sheet: any, row: number, col: number): Record<string, any> | null {
    try {
        const cell = sheet.cellStore.get(row, col);

        let mergedStyle: Record<string, any> = {};

        if (typeof sheet.getDefaultStyle === "function") {
            const defaultStyle = sheet.getDefaultStyle();
            if (defaultStyle) {
                mergedStyle = { ...defaultStyle };
            }
        }

        const colStyleId = sheet.colStyles?.get(col);
        if (colStyleId !== undefined && colStyleId !== null) {
            try {
                const colStyle = stylePool.getStyle(colStyleId);
                if (colStyle) {
                    mergedStyle = { ...mergedStyle, ...colStyle };
                }
            } catch (error) {
                errorHandler.warn(ERROR_CODE.EXPORT_STYLE_FETCH_FAILED, `获取列样式失败 (col: ${col}, styleId: ${colStyleId})`, { error });
            }
        }

        const rowStyleId = sheet.rowStyles?.get(row);
        if (rowStyleId !== undefined && rowStyleId !== null) {
            try {
                const rowStyle = stylePool.getStyle(rowStyleId);
                if (rowStyle) {
                    mergedStyle = { ...mergedStyle, ...rowStyle };
                }
            } catch (error) {
                errorHandler.warn(ERROR_CODE.EXPORT_STYLE_FETCH_FAILED, `获取行样式失败 (row: ${row}, styleId: ${rowStyleId})`, { error });
            }
        }

        let cellStyleId: number | null = null;

        if (cell) {
            if (cell.styleId !== undefined && cell.styleId !== null) {
                cellStyleId = cell.styleId;
            }

            if (cellStyleId === null) {
                cellStyleId = cell.style || cell._style || cell.styleRef || cell.styleIndex || null;
            }
        }

        if (cellStyleId !== undefined && cellStyleId !== null) {
            try {
                const cellStyle = stylePool.getStyle(cellStyleId);
                if (cellStyle) {
                    mergedStyle = { ...mergedStyle, ...cellStyle };
                }
            } catch (error) {
                errorHandler.warn(ERROR_CODE.EXPORT_STYLE_FETCH_FAILED, `获取单元格样式失败 (${row},${col}, styleId: ${cellStyleId})`, { error });
            }
        }

        if (typeof sheet.getCellTypeInstance === "function") {
            try {
                const cellTypeInstance = sheet.getCellTypeInstance(row, col);
                if (cellTypeInstance && typeof cellTypeInstance.getDefaultStyle === "function") {
                    const typeDefaultStyle = cellTypeInstance.getDefaultStyle(mergedStyle);
                    if (typeDefaultStyle) {
                        mergedStyle = { ...mergedStyle, ...typeDefaultStyle };
                    }
                }
            } catch (error) {
                errorHandler.warn(ERROR_CODE.EXPORT_STYLE_FETCH_FAILED, `获取列类型默认样式失败 (${row},${col})`, { error });
            }
        }

        if (typeof sheet.resolveCellProperties === "function") {
            try {
                const cellProps = sheet.resolveCellProperties(row, col);
                if (cellProps?.style) {
                    mergedStyle = { ...mergedStyle, ...cellProps.style };
                }
            } catch (error) {
                errorHandler.warn(ERROR_CODE.EXPORT_STYLE_FETCH_FAILED, `获取动态单元格属性失败 (${row},${col})`, { error });
            }
        }

        if (typeof sheet.hasConditionalRules === "function" && sheet.hasConditionalRules()) {
            try {
                const cfStyleId = sheet.matchConditionalStyle(row, col, cell);
                if (cfStyleId !== undefined && cfStyleId !== null) {
                    const cfStyle = stylePool.getStyle(cfStyleId);
                    if (cfStyle) {
                        mergedStyle = { ...mergedStyle, ...cfStyle };
                    }
                }
            } catch (error) {
                errorHandler.warn(ERROR_CODE.EXPORT_STYLE_FETCH_FAILED, `获取条件格式样式失败 (${row},${col})`, { error });
            }
        }

        if (typeof sheet.getDataBindStyle === "function") {
            try {
                const dbStyleId = sheet.getDataBindStyle(row, col);
                if (dbStyleId !== undefined && dbStyleId !== null) {
                    const dbStyle = stylePool.getStyle(dbStyleId);
                    if (dbStyle) {
                        mergedStyle = { ...mergedStyle, ...dbStyle };
                    }
                }
            } catch (error) {
                errorHandler.warn(ERROR_CODE.EXPORT_STYLE_FETCH_FAILED, `获取数据绑定样式失败 (${row},${col})`, { error });
            }
        }

        if (Object.keys(mergedStyle).length > 0) {
            return mergedStyle;
        }

        return null;
    } catch (error) {
        errorHandler.error(ERROR_CODE.EXPORT_STYLE_FETCH_FAILED, `样式提取过程异常 (${row},${col})`, { error });
        return null;
    }
}

function calculateNestedHeaderWidth(sheet: any): number {
    if (!sheet.nestedHeaders || !Array.isArray(sheet.nestedHeaders)) return 1;

    const firstRow = sheet.nestedHeaders[0];
    if (!firstRow || !Array.isArray(firstRow)) return 1;

    let totalCols = 0;

    for (const cell of firstRow) {
        if (cell && typeof cell === "object") {
            totalCols += cell.colspan || 1;
        } else if (cell !== null && cell !== undefined) {
            totalCols += 1;
        }
    }

    return Math.max(totalCols, 1);
}

function writeNestedHeaders({ worksheet, sheet, opts, range }: { worksheet: any; sheet: any; opts: ExportOptions; range: DataRange }): void {
    const nestedHeaders = sheet.nestedHeaders;

    if (!Array.isArray(nestedHeaders) || nestedHeaders.length === 0) {
        return;
    }

    const nestedHeaderRowCount = sheet.getNestedHeaderRowCount();

    for (let rowIndex = 0; rowIndex < nestedHeaderRowCount; rowIndex += 1) {
        const excelRow = worksheet.getRow(rowIndex + 1);
        let currentCol = range.startCol + 1;
        let col = range.startCol;

        while (col <= range.endCol) {
            const headerInfo = sheet.getNestedColHeader(rowIndex, col);

            if (headerInfo !== null) {
                const label = headerInfo.label || "";
                const colspan = headerInfo.colspan || 1;

                const cell = excelRow.getCell(currentCol);
                cell.value = label;

                if (colspan > 1) {
                    worksheet.mergeCells(rowIndex + 1, currentCol, rowIndex + 1, currentCol + colspan - 1);
                }

                applyCellStyle(cell, headerInfo, opts);

                currentCol += colspan;
                col += colspan;
            } else {
                currentCol += 1;
                col += 1;
            }
        }
    }
}

function writeColumnHeaders({
    worksheet,
    sheet,
    opts,
    range,
    startRow,
}: {
    worksheet: any;
    sheet: any;
    opts: ExportOptions;
    range: DataRange;
    startRow: number;
}): number {
    if (!opts.columnHeaders) return startRow;

    const headerRow = worksheet.getRow(startRow + 1);
    let colIndex = 1;

    for (let c = range.startCol; c <= range.endCol; c += 1) {
        const headerCell = headerRow.getCell(colIndex);
        colIndex += 1;

        headerCell.value = sheet.getColHeader(c);

        if (opts.cellStyles) {
            let customStyle: any = null;

            const colStyleId = sheet.colStyles?.get(c);
            if (colStyleId !== undefined && colStyleId !== null) {
                try {
                    customStyle = stylePool.getStyle(colStyleId);
                } catch (error) {
                    errorHandler.warn(ERROR_CODE.EXPORT_STYLE_FETCH_FAILED, `获取列头样式失败 (col: ${c}, styleId: ${colStyleId})`, { error });
                }
            }

            if (!customStyle && sheet.columnsConfig?.has(c)) {
                const colConfig = sheet.columnsConfig.get(c);
                if (colConfig?.style) {
                    customStyle = colConfig.style;
                }
            }

            if (customStyle) {
                const excelStyle = convertToExcelStyle(customStyle);
                Object.assign(headerCell, excelStyle);

                if (!headerCell.border) {
                    headerCell.border = createThinBorder();
                }
            } else {
                applyDefaultHeaderStyle(headerCell);
            }
        } else {
            applyDefaultHeaderStyle(headerCell);
        }
    }

    return startRow + 1;
}

function writeDataCells({
    worksheet,
    sheet,
    opts,
    range,
    dataStartRow,
}: {
    worksheet: any;
    sheet: any;
    opts: ExportOptions;
    range: DataRange;
    dataStartRow: number;
}): void {
    for (let r = range.startRow; r <= range.endRow; r += 1) {
        const excelRow = worksheet.getRow(dataStartRow + (r - range.startRow) + 1);
        let colIndex = 1;

        for (let c = range.startCol; c <= range.endCol; c += 1) {
            const cell = sheet.cellStore.get(r, c);
            const excelCell = excelRow.getCell(colIndex);
            colIndex += 1;

            excelCell.value = cell ? cell.value : "";

            if (opts.cellStyles) {
                const finalMergedStyle = getMergedCellStyle(sheet, r, c);

                if (finalMergedStyle) {
                    const excelStyle = convertToExcelStyle(finalMergedStyle);
                    Object.assign(excelCell, excelStyle);
                }

                const isDisabled = typeof sheet.isDisabled === "function" && sheet.isDisabled(r, c);

                if (isDisabled) {
                    let customDisabledStyle: any = null;

                    if (Array.isArray(sheet.cellConfig)) {
                        const cellConfig = sheet.cellConfig.find((cfg: any) => cfg.row === r && cfg.col === c);

                        if (cellConfig?.style) {
                            customDisabledStyle = cellConfig.style;
                        }
                    }

                    if (customDisabledStyle) {
                        const disabledExcelStyle = convertToExcelStyle(customDisabledStyle);

                        if (disabledExcelStyle.fill) {
                            excelCell.fill = disabledExcelStyle.fill;
                        }

                        if (disabledExcelStyle.font) {
                            excelCell.font = {
                                ...excelCell.font,
                                ...disabledExcelStyle.font,
                            };
                        }
                    } else {
                        excelCell.fill = {
                            type: "pattern",
                            pattern: "solid",
                            fgColor: { argb: "F2F2F2" },
                            bgColor: { argb: "F2F2F2" },
                        };

                        excelCell.font = { color: { argb: "999999" } };
                    }
                }
            }

            excelCell.border = createThinBorder();
        }
    }
}

function exportDataMerges({ worksheet, sheet, range, dataStartRow }: { worksheet: any; sheet: any; range: DataRange; dataStartRow: number }): void {
    try {
        let mergeManager: any = null;
        let merges: any[] = [];

        if (sheet.mergeManager) {
            mergeManager = sheet.mergeManager;
        } else if (sheet._mergeManager) {
            mergeManager = sheet._mergeManager;
        } else {
            const possibleNames = ["merges", "mergedCells", "cellMerges", "mergeStore"];
            for (const name of possibleNames) {
                if (sheet[name]) {
                    mergeManager = { getMerges: () => sheet[name] };
                    break;
                }
            }
        }

        if (!mergeManager) {
            return;
        }

        if (typeof mergeManager.getMerges === "function") {
            const rawMerges = mergeManager.getMerges();

            if (rawMerges instanceof Map) {
                merges = Array.from(rawMerges.values());
            } else if (Array.isArray(rawMerges)) {
                merges = rawMerges;
            } else if (rawMerges && typeof rawMerges === "object") {
                merges = Object.values(rawMerges);
            }
        } else if (Array.isArray(mergeManager)) {
            merges = mergeManager;
        } else if (mergeManager.merges) {
            const rawMerges = mergeManager.merges;
            if (rawMerges instanceof Map) {
                merges = Array.from(rawMerges.values());
            } else if (Array.isArray(rawMerges)) {
                merges = rawMerges;
            }
        }

        if (!Array.isArray(merges) || merges.length === 0) {
            return;
        }

        for (const merge of merges) {
            const srcStartRow = merge.topRow ?? merge.startRow ?? merge.row ?? merge.r ?? merge.fromRow ?? 0;
            const srcStartCol = merge.topCol ?? merge.startCol ?? merge.col ?? merge.c ?? merge.fromCol ?? 0;
            const srcEndRow = merge.bottomRow ?? merge.endRow ?? merge.row2 ?? merge.toRow ?? srcStartRow;
            const srcEndCol = merge.bottomCol ?? merge.endCol ?? merge.col2 ?? merge.toCol ?? srcStartCol;

            const isInRange = !(srcEndRow < range.startRow || srcStartRow > range.endRow || srcEndCol < range.startCol || srcStartCol > range.endCol);

            if (!isInRange) {
                continue;
            }

            const adjustedStartRow = Math.max(srcStartRow, range.startRow);
            const adjustedStartCol = Math.max(srcStartCol, range.startCol);
            const adjustedEndRow = Math.min(srcEndRow, range.endRow);
            const adjustedEndCol = Math.min(srcEndCol, range.endCol);

            const excelStartRow = dataStartRow + (adjustedStartRow - range.startRow) + 1;
            const excelStartCol = adjustedStartCol - range.startCol + 1;
            const excelEndRow = dataStartRow + (adjustedEndRow - range.startRow) + 1;
            const excelEndCol = adjustedEndCol - range.startCol + 1;

            worksheet.mergeCells(excelStartRow, excelStartCol, excelEndRow, excelEndCol);
        }
    } catch (error) {
        errorHandler.error(ERROR_CODE.EXPORT_MERGE_ERROR, `导出合并单元格时出错`, { error });
    }
}

function applyDefaultHeaderStyle(cell: any): void {
    const targetCell = cell;

    targetCell.font = { bold: true };
    targetCell.alignment = { horizontal: "center", vertical: "middle" };
    targetCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: HEADER_BG_COLOR },
    };
    targetCell.border = createThinBorder();
}

function applyCellStyle(cell: any, headerInfo: any, opts: ExportOptions): void {
    if (headerInfo.style && opts.cellStyles) {
        applyDefaultHeaderStyle(cell);
        const excelStyle = convertToExcelStyle(headerInfo.style);
        Object.assign(cell, excelStyle);
    } else {
        applyDefaultHeaderStyle(cell);
    }
}

function createThinBorder(): any {
    return {
        top: { style: DEFAULT_BORDER_STYLE, color: { argb: DEFAULT_BORDER_COLOR } },
        left: { style: DEFAULT_BORDER_STYLE, color: { argb: DEFAULT_BORDER_COLOR } },
        bottom: { style: DEFAULT_BORDER_STYLE, color: { argb: DEFAULT_BORDER_COLOR } },
        right: { style: DEFAULT_BORDER_STYLE, color: { argb: DEFAULT_BORDER_COLOR } },
    };
}

async function generateXlsx(sheet: any, opts: ExportOptions, range: DataRange | null, pluginInstance: ExportFilePlugin): Promise<ArrayBuffer> {
    if (!ExcelJS) {
        errorHandler.error(ERROR_CODE.EXPORT_FILE_GENERATE_FAILED, "ExcelJS 库未安装。请执行: npm install exceljs");
        throw new Error("ExcelJS is required for XLSX export. " + "Please install it with: npm install exceljs");
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheet.name || CONFIG.DEFAULT_SHEET_NAME + "1");

    let excelRowIndex = 1;
    let adjustedRange = range;

    if (!range) {
        if (opts.nestedHeaders && sheet.nestedHeaders && Array.isArray(sheet.nestedHeaders) && sheet.nestedHeaders.length > 0) {
            const nestedHeaderWidth = calculateNestedHeaderWidth(sheet);
            const dataRange = getDataRange(sheet);
            adjustedRange = {
                startRow: 0,
                startCol: 0,
                endRow: dataRange ? dataRange.endRow : -1,
                endCol: Math.max(nestedHeaderWidth - 1, dataRange ? dataRange.endCol : -1),
            };
        } else {
            return await workbook.xlsx.writeBuffer();
        }
    } else {
        adjustedRange = { ...range };
    }

    let context: any;

    if (opts.nestedHeaders) {
        const nestedHeaderWidth = calculateNestedHeaderWidth(sheet);
        adjustedRange.endCol = Math.max(adjustedRange.endCol, nestedHeaderWidth - 1);

        context = { worksheet, sheet, opts, range: adjustedRange };

        writeNestedHeaders(context);
        const nestedHeaderCount = sheet.getNestedHeaderRowCount();
        excelRowIndex += nestedHeaderCount;

        context.startRow = excelRowIndex - 1;
        excelRowIndex = writeColumnHeaders(context);

        context.dataStartRow = excelRowIndex;
        writeDataCells(context);

        exportDataMerges(context);
    } else {
        context = { worksheet, sheet, opts, range: adjustedRange };
        context.startRow = excelRowIndex - 1;
        excelRowIndex = writeColumnHeaders(context);
        context.dataStartRow = excelRowIndex;
        writeDataCells(context);
        exportDataMerges(context);
    }

    worksheet.properties.defaultRowHeight = DEFAULT_ROW_HEIGHT;

    const totalCols = adjustedRange.endCol - adjustedRange.startCol + 1;
    const totalRows = adjustedRange.endRow - adjustedRange.startRow + 1;

    try {
        if (sheet.rowColManager && typeof sheet.rowColManager.getColWidth === "function") {
            for (let colIdx = 0; colIdx < totalCols; colIdx++) {
                const actualCol = adjustedRange.startCol + colIdx;
                try {
                    const colWidthPx = sheet.rowColManager.getColWidth(actualCol);
                    if (colWidthPx && typeof colWidthPx === "number" && colWidthPx > 0) {
                        worksheet.getColumn(colIdx + 1).width = pixelToExcelWidth(colWidthPx);
                    } else {
                        worksheet.getColumn(colIdx + 1).width = DEFAULT_COLUMN_WIDTH;
                    }
                } catch (colError) {
                    worksheet.getColumn(colIdx + 1).width = DEFAULT_COLUMN_WIDTH;
                }
            }
        } else {
            for (let i = 1; i <= Math.max(totalCols, 1); i += 1) {
                worksheet.getColumn(i).width = DEFAULT_COLUMN_WIDTH;
            }
        }

        if (opts.nestedHeaders && sheet.nestedHeaders && Array.isArray(sheet.nestedHeaders) && sheet.nestedHeaders.length > 0) {
            const nestedHeaderRowCount = sheet.getNestedHeaderRowCount();
            const headerHeightPx = sheet.headerHeight || CONFIG.HEADER_HEIGHT;

            for (let headerRowIndex = 0; headerRowIndex < nestedHeaderRowCount; headerRowIndex++) {
                try {
                    worksheet.getRow(headerRowIndex + 1).height = pixelToExcelHeight(headerHeightPx);
                } catch (headerError) {}
            }
        }

        if (sheet.rowColManager && typeof sheet.rowColManager.getRowHeight === "function") {
            for (let r = adjustedRange.startRow; r <= adjustedRange.endRow; r++) {
                try {
                    const rowHeightPx = sheet.rowColManager.getRowHeight(r);

                    if (rowHeightPx && typeof rowHeightPx === "number" && rowHeightPx > 0) {
                        const excelRowNumber = context.dataStartRow + (r - adjustedRange.startRow) + 1;
                        worksheet.getRow(excelRowNumber).height = pixelToExcelHeight(rowHeightPx);
                    }
                } catch (rowError) {}
            }
        }
    } catch (dimensionsError) {
        for (let i = 1; i <= Math.max(totalCols, 1); i += 1) {
            worksheet.getColumn(i).width = DEFAULT_COLUMN_WIDTH;
        }
    }

    await exportChartsToExcel(workbook, worksheet, sheet, pluginInstance);

    return await workbook.xlsx.writeBuffer();
}

async function exportChartsToExcel(workbook: any, worksheet: any, sheet: any, pluginInstance: ExportFilePlugin): Promise<void> {
    let renderEngine = pluginInstance?.renderEngine;

    if (!renderEngine && pluginInstance?.workbook?.renderEngine) {
        renderEngine = pluginInstance.workbook.renderEngine;
    }

    if (!sheet?.chartManager || !renderEngine?.chartLayer) {
        errorHandler.warn(ERROR_CODE.GENERIC_WARN, "无法导出图表：缺少 chartManager 或 chartLayer");
        return;
    }

    const charts = sheet.chartManager.getAll();
    const chartLayer = renderEngine.chartLayer;

    errorHandler.debug("CHART_STRATEGY_DEBUG", `📊 [Excel Export] 找到 ${charts.length} 个图表`);

    let exportedCount = 0;

    for (const chart of charts) {
        try {
            errorHandler.debug("CHART_STRATEGY_DEBUG", `📊 [Excel Export] 处理图表 ${chart.id}`, {
                type: chart.type,
                anchorRow: chart.anchorRow,
                anchorCol: chart.anchorCol,
                size: `${chart.width}x${chart.height}`,
            });

            let canvas: any = await chartLayer.getChartCanvas(chart.id);

            if (!canvas) {
                errorHandler.debug("CHART_STRATEGY_DEBUG", `📊 [Excel Export] 缓存未命中，重建高清缓存 ${chart.id}`);
                canvas = await chartLayer.rebuildChartCacheWithSheet(chart.id, 2, sheet);
            }

            if (!canvas) {
                errorHandler.warn(ERROR_CODE.CHART_CACHE_REBUILD_FAILED, `无法获取图表 Canvas: ${chart.id}`);
                continue;
            }

            const dataUrl = canvas.toDataURL("image/png");
            const base64Data = dataUrl.split(",")[1];

            const imageId = workbook.addImage({
                base64: base64Data,
                extension: "png",
            });

            worksheet.addImage(imageId, {
                tl: {
                    col: chart.anchorCol,
                    row: chart.anchorRow,
                    colOff: Math.round((chart.offsetX * 914400) / 96),
                    rowOff: Math.round((chart.offsetY * 914400) / 96),
                },
                ext: {
                    width: chart.width,
                    height: chart.height,
                },
                editAs: "oneCell",
            });

            exportedCount++;
            errorHandler.debug("CHART_STRATEGY_DEBUG", `📊 [Excel Export] 图表 ${chart.id} 导出成功`);
        } catch (error) {
            errorHandler.error(ERROR_CODE.CHART_RENDER_ERROR, "图表导出失败", { error, chartId: chart?.id });
        }
    }

    errorHandler.debug("CHART_STRATEGY_DEBUG", `📊 [Excel Export] 完成，成功导出 ${exportedCount}/${charts.length} 个图表`);
}

export class ExportFilePlugin extends BasePlugin {
    static get PLUGIN_NAME(): string {
        return "exportFile";
    }

    init(options: Record<string, any> = {}): void {
        super.init(options);
    }

    #prepare(format: string, options: Record<string, any>): { opts: ExportOptions; range: DataRange | null; sheet: any; str?: string } | null {
        const sheet = this.sheet;
        if (!sheet) return null;

        const preset = FORMAT_PRESETS[format] || FORMAT_PRESETS.csv;
        const opts = buildOptions(format, options);
        resolveHeaderDefaults(sheet, opts);

        const range = options.range
            ? {
                  startRow: options.range.startRow ?? 0,
                  startCol: options.range.startCol ?? 0,
                  endRow: options.range.endRow ?? 0,
                  endCol: options.range.endCol ?? 0,
              }
            : getDataRange(sheet);

        const result: { opts: ExportOptions; range: DataRange | null; sheet: any; str?: string } = { opts, range, sheet };

        if (!preset.isBinary) {
            const rows = buildRows(sheet, opts, range);
            result.str = serialize(rows, opts.separator!);
        }

        return result;
    }

    exportAsString(format: string = "csv", options: Record<string, any> = {}): string {
        const preset = FORMAT_PRESETS[format];

        if (preset?.isBinary) {
            errorHandler.warn(ERROR_CODE.GENERIC_WARN, `exportAsString() 不支持 ${format} 格式，请使用 exportAsBlob() 或 downloadFile() 替代`);
            return "";
        }

        const result = this.#prepare(format, options);
        return result?.str || "";
    }

    async exportAsBlob(format: string = "csv", options: Record<string, any> = {}): Promise<Blob | null> {
        try {
            const result = this.#prepare(format, options);
            if (!result) {
                this.hooks?.runHooks(HOOKS.EXPORT_ERROR, { format, options, error: new Error("Sheet 无效或准备失败") });
                return null;
            }

            const { opts } = result;
            let blob: Blob;

            if (FORMAT_PRESETS[format]?.isBinary) {
                const buffer = await generateXlsx(result.sheet, opts, result.range, this);
                blob = new Blob([buffer], { type: opts.mimeType });
            } else {
                blob = toBlob(result.str!, opts);
            }

            this.hooks?.runHooks(HOOKS.EXPORT_COMPLETE, { format, options, result });
            return blob;
        } catch (error) {
            this.hooks?.runHooks(HOOKS.EXPORT_ERROR, { format, options, error });
            throw error;
        }
    }

    async downloadFile(format: string = "csv", options: Record<string, any> = {}): Promise<void> {
        try {
            const result = this.#prepare(format, options);
            if (!result) {
                this.hooks?.runHooks(HOOKS.EXPORT_ERROR, { format, options, error: new Error("Sheet 无效或准备失败") });
                return;
            }

            const { opts } = result;
            let blob: Blob;

            if (FORMAT_PRESETS[format]?.isBinary) {
                const buffer = await generateXlsx(result.sheet, opts, result.range, this);
                blob = new Blob([buffer], { type: opts.mimeType });
            } else {
                blob = toBlob(result.str!, opts);
            }

            const filename = `${opts.filename}.${opts.fileExtension}`;
            triggerDownload(blob, filename);

            this.hooks?.runHooks(HOOKS.EXPORT_COMPLETE, { format, options, result, filename });
        } catch (error) {
            this.hooks?.runHooks(HOOKS.EXPORT_ERROR, { format, options, error });
            throw error;
        }
    }

    #getChartLayer(): any {
        return this.renderEngine?.chartLayer || null;
    }

    static #getImageMimeType(format: string): string {
        const mimeMap: Record<string, string> = {
            png: "image/png",
            jpeg: "image/jpg",
            jpg: "image/jpg",
            webp: "image/webp",
        };
        return mimeMap[format.toLowerCase()] || "image/png";
    }

    async exportChartAsImage(chartId: string, options: Record<string, any> = {}): Promise<Blob> {
        try {
            const sheet = this.sheet;
            if (!sheet?.chartManager) {
                throw new Error("Current sheet does not exist or has no chart manager");
            }

            const chart = sheet.chartManager.get(chartId);
            if (!chart) {
                throw new Error(`Chart ${chartId} does not exist`);
            }

            const chartLayer = this.#getChartLayer();
            if (!chartLayer) {
                throw new Error("Cannot get chart layer");
            }

            const { format = "png", quality = 1.0, scale = 2, rebuildHighQuality = false } = options;

            let canvas: any;
            let useHighRes = false;

            if (rebuildHighQuality || scale > 1) {
                try {
                    canvas = await chartLayer.rebuildChartCacheWithSheet(chartId, scale, sheet);
                    if (canvas) {
                        useHighRes = true;
                    } else {
                        throw new Error("高清缓存创建失败");
                    }
                } catch (highResError: any) {
                    errorHandler.warn(ERROR_CODE.CHART_CACHE_REBUILD_FAILED, "高清缓存创建失败，回退到普通缓存", { error: highResError.message });
                    canvas = await chartLayer.getChartCanvas(chartId);
                }
            } else {
                canvas = await chartLayer.getChartCanvas(chartId);
            }

            if (!canvas) {
                throw new Error(`Chart ${chartId} cache is not available`);
            }

            const mimeType = ExportFilePlugin.#getImageMimeType(format);

            return new Promise<Blob>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Image export timeout"));
                }, 10000);

                try {
                    canvas.toBlob(
                        (blob: Blob | null) => {
                            clearTimeout(timeout);
                            if (blob) {
                                resolve(blob);
                            } else {
                                reject(new Error("Failed to generate image blob"));
                            }
                        },
                        mimeType,
                        quality,
                    );
                } catch (error) {
                    clearTimeout(timeout);
                    reject(error);
                }
            });
        } catch (error) {
            this.hooks?.runHooks(HOOKS.EXPORT_ERROR, {
                format: "image",
                options,
                error,
            });
            throw error;
        }
    }

    async exportAllChartsAsImages(options: Record<string, any> = {}): Promise<Blob | any[] | null> {
        try {
            const sheet = this.sheet;
            if (!sheet?.chartManager) {
                console.warn("Current sheet does not exist or has no charts");
                return null;
            }

            const chartLayer = this.#getChartLayer();
            if (!chartLayer) {
                throw new Error("Cannot get chart layer");
            }

            let chartsToExport: any[];

            if (options.includeSelectionOnly && sheet.selection) {
                chartsToExport = chartLayer.getChartsInSelection(sheet.selection);

                if (chartsToExport.length === 0) {
                    console.warn("No charts in selection area");
                    return null;
                }
            } else {
                chartsToExport = chartLayer.getAllCharts();

                errorHandler.debug("CHART_STRATEGY_DEBUG", `📊 [Batch Export] getAllCharts() 返回 ${chartsToExport.length} 个图表`);

                if (chartsToExport.length === 0) {
                    console.warn("No charts on current sheet");
                    return null;
                }
            }

            const { format = "png", asZip = true, quality = 1.0, scale = 1, rebuildHighQuality = false } = options;

            errorHandler.debug("CHART_STRATEGY_DEBUG", `📊 [Batch Export] 准备导出 ${chartsToExport.length} 个图表`, {
                chartIds: chartsToExport.map((c: any) => c.id),
                options: { format, asZip, quality, scale, rebuildHighQuality },
            });

            const results: any[] = [];
            const errors: any[] = [];
            const usedNames = new Set<string>();

            for (let idx = 0; idx < chartsToExport.length; idx++) {
                const chart = chartsToExport[idx];
                try {
                    errorHandler.debug(
                        "CHART_STRATEGY_DEBUG",
                        `📊 [Batch Export] 正在导出第 ${idx + 1}/${chartsToExport.length} 个图表: ${chart.id}`,
                    );

                    const blob = await this.exportChartAsImage(chart.id, {
                        format,
                        quality,
                        scale,
                        rebuildHighQuality,
                    });

                    const rawName = chart.title || chart.style?.title || `chart_${chart.id.substring(0, 8)}`;

                    const chartName = rawName
                        .trim()
                        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
                        .replace(/[^\w\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\- ]/g, "_")
                        .replace(/\s+/g, "_")
                        .replace(/_+/g, "_")
                        .replace(/^_|_$/g, "")
                        .substring(0, 45);

                    let finalName = chartName;
                    let counter = 1;
                    while (usedNames.has(`${finalName}.${format}`)) {
                        finalName = `${chartName}_${counter}`;
                        counter++;
                    }

                    usedNames.add(`${finalName}.${format}`);

                    results.push({
                        id: chart.id,
                        name: `${finalName}.${format}`,
                        blob,
                        chart,
                    });

                    errorHandler.debug("CHART_STRATEGY_DEBUG", `✅ [Batch Export] 图表 ${chart.id} 导出成功 → ${finalName}.${format}`);
                } catch (error: any) {
                    errors.push({ chartId: chart.id, error });
                    errorHandler.warn(ERROR_CODE.CHART_RENDER_ERROR, `❌ [Batch Export] 图表 ${chart.id} 导出失败: ${error.message}`);
                }
            }

            errorHandler.debug(
                "CHART_STRATEGY_DEBUG",
                `📊 [Batch Export] 完成: 成功 ${results.length}/${chartsToExport.length}, 失败 ${errors.length}`,
            );

            if (results.length === 0) {
                throw new Error("All chart exports failed");
            }

            if (errors.length > 0) {
                this.hooks?.runHooks(HOOKS.EXPORT_ERROR, {
                    format: "images",
                    options,
                    warnings: errors,
                });
            }

            if (asZip && results.length > 1) {
                return await ExportFilePlugin.#createZipFromImages(results);
            }

            return asZip ? results[0].blob : results;
        } catch (error) {
            this.hooks?.runHooks(HOOKS.EXPORT_ERROR, {
                format: "images",
                options,
                error,
            });
            throw error;
        }
    }

    async downloadChart(chartId: string, filename: string | null = null, options: Record<string, any> = {}): Promise<void> {
        try {
            const sheet = this.sheet;
            const chart = sheet?.chartManager?.get(chartId);

            const defaultName = filename || `${chart?.title || chart?.style?.title || "chart"}_${Date.now()}.${options.format || "png"}`;

            const blob = await this.exportChartAsImage(chartId, options);
            triggerDownload(blob, defaultName);

            this.hooks?.runHooks(HOOKS.EXPORT_COMPLETE, {
                format: "chart-image",
                options: { ...options, chartId, filename: defaultName },
                result: blob,
            });
        } catch (error) {
            this.hooks?.runHooks(HOOKS.EXPORT_ERROR, {
                format: "chart-image",
                options: { chartId, filename },
                error,
            });
            throw error;
        }
    }

    async downloadAllCharts(options: Record<string, any> = {}): Promise<void> {
        try {
            const { filename = null } = options;

            const result = await this.exportAllChartsAsImages(options);

            if (!result) {
                console.warn("No charts to download");
                return;
            }

            if (result instanceof Blob) {
                const downloadName = filename || "charts.zip";
                triggerDownload(result, downloadName);
            } else if (Array.isArray(result)) {
                for (const item of result) {
                    triggerDownload(item.blob, item.name);
                }
            }

            this.hooks?.runHooks(HOOKS.EXPORT_COMPLETE, {
                format: "charts-images",
                options,
                result,
            });
        } catch (error) {
            this.hooks?.runHooks(HOOKS.EXPORT_ERROR, {
                format: "charts-images",
                options,
                error,
            });
            throw error;
        }
    }

    static async #createZipFromImages(images: any[]): Promise<Blob> {
        const zip = new JSZip();

        images.forEach(({ name, blob }) => {
            zip.file(name, blob);
        });

        return await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        });
    }
}
