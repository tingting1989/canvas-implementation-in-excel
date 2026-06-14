import {BasePlugin} from "./BasePlugin.js";

const FORMAT_PRESETS = {
    csv: {separator: ",", mimeType: "text/csv", fileExtension: "csv"},
    tsv: {separator: "\t", mimeType: "text/tab-separated-values", fileExtension: "tsv"},
};

const DEFAULT_OPTIONS = {
    columnHeaders: undefined,
    rowHeaders: undefined,
    separator: ",",
    mimeType: "text/csv",
    fileExtension: "csv",
    filename: "data",
    encoding: "utf-8",
    bom: true,
};

function buildOptions(format, userOptions) {
    const preset = FORMAT_PRESETS[format] || FORMAT_PRESETS.csv;
    return {...DEFAULT_OPTIONS, ...preset, ...userOptions};
}

function resolveHeaderDefaults(sheet, opts) {
    if (opts.columnHeaders === undefined) {
        opts.columnHeaders = Array.isArray(sheet.colHeaders) && sheet.colHeaders.length > 0;
    }
    if (opts.rowHeaders === undefined) {
        opts.rowHeaders = Array.isArray(sheet.rowHeaders) && sheet.rowHeaders.length > 0;
    }
}

function escapeField(value, separator) {
    const str = value == null ? "" : String(value);
    if (str.includes(separator) || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function getDataRange(sheet) {
    let maxRow = -1;
    let maxCol = -1;

    for (const chunk of sheet.cellStore.chunks()) {
        for (const {row, col} of chunk.iterate()) {
            if (row > maxRow) maxRow = row;
            if (col > maxCol) maxCol = col;
        }
    }

    return maxRow >= 0
        ? {startRow: 0, startCol: 0, endRow: maxRow, endCol: maxCol}
        : null;
}

function buildRows(sheet, opts, range) {
    if (!range) return [];

    const {startRow, startCol, endRow, endCol} = range;
    const rows = [];

    if (opts.columnHeaders) {
        const headerRow = [];
        for (let c = startCol; c <= endCol; c++) {
            headerRow.push(sheet.getColHeader(c));
        }
        rows.push(headerRow);
    }

    for (let r = startRow; r <= endRow; r++) {
        const row = [];
        if (opts.rowHeaders) row.push(sheet.getRowHeader(r));
        for (let c = startCol; c <= endCol; c++) {
            const cell = sheet.cellStore.get(r, c);
            row.push(cell ? cell.value : "");
        }
        rows.push(row);
    }

    return rows;
}

function serialize(rows, separator) {
    return rows
        .map(row => row.map(v => escapeField(v, separator)).join(separator))
        .join("\r\n");
}

function toBlob(str, opts) {
    const content = (opts.bom && opts.encoding === "utf-8") ? "\uFEFF" + str : str;
    return new Blob([content], {type: `${opts.mimeType};charset=${opts.encoding}`});
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, 100);
}

export class ExportFilePlugin extends BasePlugin {
    static get PLUGIN_NAME() { return 'exportFile'; }

    init(options = {}) {
        super.init(options);
    }

    #prepare(format, options) {
        const sheet = this.sheet;
        if (!sheet) return null;

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

        const rows = buildRows(sheet, opts, range);
        const str = serialize(rows, opts.separator);

        return {opts, str};
    }

    exportAsString(format = "csv", options = {}) {
        const result = this.#prepare(format, options);
        return result ? result.str : "";
    }

    exportAsBlob(format = "csv", options = {}) {
        const result = this.#prepare(format, options);
        if (!result) return null;
        return toBlob(result.str, result.opts);
    }

    downloadFile(format = "csv", options = {}) {
        const result = this.#prepare(format, options);
        if (!result) return;

        const {opts, str} = result;
        const blob = toBlob(str, opts);
        const filename = `${opts.filename}.${opts.fileExtension}`;
        triggerDownload(blob, filename);
    }
}