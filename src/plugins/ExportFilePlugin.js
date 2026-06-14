/**
 * 导出文件插件
 * 参考 Handsontable ExportFile API 设计
 * https://handsontable.com/docs/javascript-data-grid/api/export-file/
 *
 * 支持格式：csv、tsv
 *
 * 使用示例：
 * ```js
 * // 通过 Workbook 便捷方法
 * wb.downloadFile('csv', { filename: 'report', columnHeaders: true });
 * wb.exportAsString('csv');
 * wb.exportAsBlob('tsv');
 *
 * // 通过插件实例
 * const plugin = wb.getPlugin('exportFile');
 * plugin.downloadFile('csv', { filename: 'data' });
 * ```
 *
 * Options 配置项：
 * - columnHeaders {boolean|undefined} 是否导出列头，undefined 时自动检测自定义列头
 * - rowHeaders    {boolean|undefined} 是否导出行头，undefined 时自动检测自定义行头
 * - separator     {string}  字段分隔符，默认 ","
 * - filename      {string}  下载文件名（不含扩展名），默认 "data"
 * - encoding      {string}  字符编码，默认 "utf-8"
 * - bom           {boolean} 是否添加 UTF-8 BOM（Excel 打开中文不乱码），默认 true
 * - range         {object}  导出范围 {startRow, startCol, endRow, endCol}，默认自动检测
 */
import {BasePlugin} from "./BasePlugin.js";

/**
 * 格式预设：每种格式对应的分隔符、MIME 类型和文件扩展名
 * 扩展新格式只需在此添加一行
 */
const FORMAT_PRESETS = {
    csv: {separator: ",", mimeType: "text/csv", fileExtension: "csv"},
    tsv: {separator: "\t", mimeType: "text/tab-separated-values", fileExtension: "tsv"},
};

/** 默认导出选项 */
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

/**
 * 三层合并选项：默认值 → 格式预设 → 用户自定义
 * @param {string} format - 导出格式 ("csv" | "tsv")
 * @param {object} userOptions - 用户自定义选项
 * @returns {object} 合并后的完整选项
 */
function buildOptions(format, userOptions) {
    const preset = FORMAT_PRESETS[format] || FORMAT_PRESETS.csv;
    return {...DEFAULT_OPTIONS, ...preset, ...userOptions};
}

/**
 * 智能表头默认值解析
 * 当用户未显式指定 columnHeaders/rowHeaders 时：
 * - 有自定义表头（Array 且 length > 0）→ 自动导出
 * - 默认表头（A,B,C / 1,2,3）→ 不导出（在导出文件中无意义）
 *
 * @param {object} sheet - Sheet 实例
 * @param {object} opts - 合并后的选项（会被就地修改）
 */
function resolveHeaderDefaults(sheet, opts) {
    if (opts.columnHeaders === undefined) {
        opts.columnHeaders = Array.isArray(sheet.colHeaders) && sheet.colHeaders.length > 0;
    }
    if (opts.rowHeaders === undefined) {
        opts.rowHeaders = Array.isArray(sheet.rowHeaders) && sheet.rowHeaders.length > 0;
    }
}

/**
 * CSV 字段转义（RFC 4180）
 * 含分隔符、双引号、换行符的字段用双引号包裹，双引号转义为两个双引号
 *
 * @param {*} value - 单元格值
 * @param {string} separator - 字段分隔符
 * @returns {string} 转义后的字符串
 */
function escapeField(value, separator) {
    const str = value == null ? "" : String(value);
    if (str.includes(separator) || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

/**
 * 自动检测有数据的范围
 * 遍历 CellStore 的所有 chunk，找到最大行列索引
 *
 * @param {object} sheet - Sheet 实例
 * @returns {object|null} 数据范围 {startRow, startCol, endRow, endCol}，无数据时返回 null
 */
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

/**
 * 按范围收集数据，构建二维数组
 * 可选包含列头行和行头列
 *
 * @param {object} sheet - Sheet 实例
 * @param {object} opts - 导出选项
 * @param {object|null} range - 数据范围
 * @returns {Array<Array<string>>} 二维数组，每行一个数组
 */
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

/**
 * 将二维数组序列化为分隔符分隔的字符串
 * 行尾使用 \r\n（Windows 兼容）
 *
 * @param {Array<Array<string>>} rows - 二维数组
 * @param {string} separator - 字段分隔符
 * @returns {string} 序列化后的字符串
 */
function serialize(rows, separator) {
    return rows
        .map(row => row.map(v => escapeField(v, separator)).join(separator))
        .join("\r\n");
}

/**
 * 将字符串转换为 Blob 对象
 * 支持 UTF-8 BOM 头，确保 Excel 打开中文不乱码
 *
 * @param {string} str - 序列化后的字符串
 * @param {object} opts - 导出选项
 * @returns {Blob} Blob 对象
 */
function toBlob(str, opts) {
    const content = (opts.bom && opts.encoding === "utf-8") ? "\uFEFF" + str : str;
    return new Blob([content], {type: `${opts.mimeType};charset=${opts.encoding}`});
}

/**
 * 触发浏览器文件下载
 * 创建临时 <a> 元素模拟点击，下载后自动清理
 *
 * @param {Blob} blob - 文件 Blob
 * @param {string} filename - 下载文件名（含扩展名）
 */
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

/**
 * 导出文件插件
 *
 * 提供三个核心 API（对齐 Handsontable ExportFile）：
 * - exportAsString(format, options) → 导出为字符串
 * - exportAsBlob(format, options)   → 导出为 Blob 对象
 * - downloadFile(format, options)   → 直接触发浏览器下载
 */
export class ExportFilePlugin extends BasePlugin {
    static get PLUGIN_NAME() { return 'exportFile'; }

    init(options = {}) {
        super.init(options);
    }

    /**
     * 公共准备流程：sheet 判空 → 合并选项 → 解析表头默认值 → 解析范围 → 收集数据 → 序列化
     *
     * @param {string} format - 导出格式 ("csv" | "tsv")
     * @param {object} options - 用户自定义选项
     * @returns {{opts: object, str: string}|null} 合并后的选项和序列化字符串，sheet 为空时返回 null
     */
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

    /**
     * 导出为字符串
     *
     * @param {string} [format="csv"] - 导出格式
     * @param {object} [options={}] - 导出选项
     * @returns {string} CSV/TSV 字符串
     */
    exportAsString(format = "csv", options = {}) {
        const result = this.#prepare(format, options);
        return result ? result.str : "";
    }

    /**
     * 导出为 Blob 对象
     *
     * @param {string} [format="csv"] - 导出格式
     * @param {object} [options={}] - 导出选项
     * @returns {Blob|null} Blob 对象，sheet 为空时返回 null
     */
    exportAsBlob(format = "csv", options = {}) {
        const result = this.#prepare(format, options);
        if (!result) return null;
        return toBlob(result.str, result.opts);
    }

    /**
     * 直接触发浏览器下载
     *
     * @param {string} [format="csv"] - 导出格式
     * @param {object} [options={}] - 导出选项
     */
    downloadFile(format = "csv", options = {}) {
        const result = this.#prepare(format, options);
        if (!result) return;

        const {opts, str} = result;
        const blob = toBlob(str, opts);
        const filename = `${opts.filename}.${opts.fileExtension}`;
        triggerDownload(blob, filename);
    }
}