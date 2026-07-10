/**
 * Excel 单位转换工具函数
 *
 * 提供 Excel 特有单位与标准像素单位之间的双向转换：
 * - 列宽：字符宽度（characters）↔ 像素（pixels）
 * - 行高：磅（points）↔ 像素（pixels）
 *
 * 转换公式基于 Microsoft Excel 规范（ECMA-376 Part 1）：
 * - 列宽：基于 Calibri 11 字体，96 DPI
 * - 行高：基于标准 Windows DPI (96)，1 inch = 72 points
 *
 * @module utils/excelUnits
 */

// ============================================================================
// [常量定义]
// ============================================================================

/** 标准Windows DPI（像素/英寸） */
const STANDARD_DPI = 96;

/** 每英寸磅数（印刷行业标准） */
const POINTS_PER_INCH = 72;

/** Excel最大数字宽度（Calibri 11字体, 96 DPI） */
const MAX_DIGIT_WIDTH = 7;

/** 列宽内边距（左右各2px + 网格线1px） */
const COLUMN_PADDING = 5;

/** 最小列宽（像素） */
const MIN_COL_WIDTH_PX = 20;

/** 默认列宽（像素） */
const DEFAULT_COL_WIDTH_PX = 100;

/** 最小行高（像素） */
const MIN_ROW_HEIGHT_PX = 15;

/** 默认行高（像素） */
const DEFAULT_ROW_HEIGHT_PX = 28;

/** Excel默认列宽（字符） */
const DEFAULT_EXCEL_COL_WIDTH = 8.43;

/** Excel默认行高（磅） */
const DEFAULT_EXCEL_ROW_HEIGHT = 15;

// ============================================================================
// [列宽转换]
// ============================================================================

/**
 * 将Excel字符宽度转换为像素宽度
 *
 * 转换公式：pixels = (charWidth × MAX_DIGIT_WIDTH) + COLUMN_PADDING
 * - MAX_DIGIT_WIDTH: 7 (Calibri 11 at 96 DPI)
 * - COLUMN_PADDING: 5px (左右各2px + 网格线1px)
 *
 * @param {number} charWidth - Excel字符宽度
 * @param {Object} [options] - 配置选项
 * @param {number} [options.minWidth=20] - 最小像素宽度
 * @param {number} [options.defaultValue=100] - 无效输入时的默认值
 * @returns {number} 像素宽度
 *
 * @example
 * excelWidthToPixel(15)    // => 110
 * excelWidthToPixel(8.43)  // => 64  (Excel默认列宽)
 * excelWidthToPixel(0)     // => 100 (返回默认值)
 */
export function excelWidthToPixel(charWidth, options = {}) {
    const { minWidth = MIN_COL_WIDTH_PX, defaultValue = DEFAULT_COL_WIDTH_PX } = options;

    if (!charWidth || typeof charWidth !== "number" || charWidth <= 0) {
        return defaultValue;
    }

    const pixelWidth = Math.round(charWidth * MAX_DIGIT_WIDTH + COLUMN_PADDING);
    return Math.max(pixelWidth, minWidth);
}

/**
 * 将像素宽度转换为Excel字符宽度
 *
 * 反向转换公式：charWidth = (pixels - COLUMN_PADDING) / MAX_DIGIT_WIDTH
 *
 * @param {number} pixelWidth - 像素宽度
 * @param {Object} [options] - 配置选项
 * @param {number} [options.minWidth=1] - 最小字符宽度
 * @param {number} [options.defaultValue=8.43] - 无效输入时的默认值
 * @returns {number} Excel字符宽度
 *
 * @example
 * pixelToExcelWidth(110)   // => 15
 * pixelToExcelWidth(64)    // => 8.43 (约等于Excel默认)
 * pixelToExcelWidth(100)   // => 13.57
 */
export function pixelToExcelWidth(pixelWidth, options = {}) {
    const { minWidth = 1, defaultValue = DEFAULT_EXCEL_COL_WIDTH } = options;

    if (!pixelWidth || typeof pixelWidth !== "number" || pixelWidth <= 0) {
        return defaultValue;
    }

    const charWidth = (pixelWidth - COLUMN_PADDING) / MAX_DIGIT_WIDTH;
    return Math.max(charWidth, minWidth);
}

// ============================================================================
// [行高转换]
// ============================================================================

/**
 * 将Excel磅值转换为像素高度
 *
 * 转换公式：pixels = points × (DPI / POINTS_PER_INCH)
 * - 基于96 DPI: pixels = points × 1.3333
 *
 * @param {number} heightInPoints - Excel行高（磅）
 * @param {Object} [options] - 配置选项
 * @param {number} [options.minHeight=15] - 最小像素高度
 * @param {number} [options.defaultValue=28] - 无效输入时的默认值
 * @returns {number} 像素高度
 *
 * @example
 * excelHeightToPixel(15)   // => 20  (Excel默认行高)
 * excelHeightToPixel(18)   // => 24
 * excelHeightToPixel(30)   // => 40
 * excelHeightToPixel(0)    // => 28  (返回默认值)
 */
export function excelHeightToPixel(heightInPoints, options = {}) {
    const { minHeight = MIN_ROW_HEIGHT_PX, defaultValue = DEFAULT_ROW_HEIGHT_PX } = options;

    if (!heightInPoints || typeof heightInPoints !== "number" || heightInPoints <= 0) {
        return defaultValue;
    }

    const pixelHeight = Math.round(heightInPoints * (STANDARD_DPI / POINTS_PER_INCH));
    return Math.max(pixelHeight, minHeight);
}

/**
 * 将像素高度转换为Excel磅值
 *
 * 反向转换公式：points = pixels / (DPI / POINTS_PER_INCH)
 * - 基于96 DPI: points = pixels / 1.3333
 *
 * @param {number} pixelHeight - 像素高度
 * @param {Object} [options] - 配置选项
 * @param {number} [options.minHeight=1] - 最小磅值
 * @param {number} [options.defaultValue=15] - 无效输入时的默认值
 * @returns {number} Excel行高（磅）
 *
 * @example
 * pixelToExcelHeight(20)   // => 15  (Excel默认)
 * pixelToExcelHeight(24)   // => 18
 * pixelToExcelHeight(40)   // => 30
 * pixelToExcelHeight(28)   // => 21
 */
export function pixelToExcelHeight(pixelHeight, options = {}) {
    const {
        minHeight = 1,
        defaultValue = DEFAULT_EXCEL_ROW_HEIGHT,
        MIN_FONT_SIZE_PX,
        DEFAULT_FONT_SIZE_PX,
        DEFAULT_EXCEL_FONT_SIZE,
        MAX_FONT_SIZE_PX,
    } = options;

    if (!pixelHeight || typeof pixelHeight !== "number" || pixelHeight <= 0) {
        return defaultValue;
    }

    const heightInPoints = pixelHeight / (STANDARD_DPI / POINTS_PER_INCH);
    return Math.max(heightInPoints, minHeight);
}

// ============================================================================
// [批量转换辅助方法]
// ============================================================================

/**
 * 批量将Excel列宽数组转换为像素
 *
 * @param {Array<{col: number, width: number}>} columnWidths - Excel列宽数组
 * @param {Object} [options] - 配置选项（传递给 excelWidthToPixel）
 * @returns {Array<{col: number, width: number}>} 转换后的列宽数组
 *
 * @example
 * convertColumnWidthsToPixels([{col: 0, width: 15}, {col: 1, width: 10}])
 * // => [{col: 0, width: 110}, {col: 1, width: 75}]
 */
export function convertColumnWidthsToPixels(columnWidths, options = {}) {
    if (!Array.isArray(columnWidths)) return [];

    return columnWidths.map(({ col, width }) => ({
        col,
        width: excelWidthToPixel(width, options),
    }));
}

/**
 * 批量将Excel行高数组转换为像素
 *
 * @param {Array<{row: number, height: number}>} rowHeights - Excel行高数组
 * @param {Object} [options] - 配置选项（传递给 excelHeightToPixel）
 * @returns {Array<{row: number, height: number}>} 转换后的行高数组
 *
 * @example
 * convertRowHeightsToPixels([{row: 0, height: 15}, {row: 1, height: 18}])
 * // => [{row: 0, height: 20}, {row: 1, height: 24}]
 */
export function convertRowHeightsToPixels(rowHeights, options = {}) {
    if (!Array.isArray(rowHeights)) return [];

    return rowHeights.map(({ row, height }) => ({
        row,
        height: excelHeightToPixel(height, options),
    }));
}

/**
 * 批量将像素列宽数组转换为Excel格式
 *
 * @param {Array<{col: number, width: number}>} columnWidths - 像素列宽数组
 * @param {Object} [options] - 配置选项（传递给 pixelToExcelWidth）
 * @returns {Array<{col: number, width: number}>} 转换后的Excel列宽数组
 */
export function convertColumnWidthsToExcel(columnWidths, options = {}) {
    if (!Array.isArray(columnWidths)) return [];

    return columnWidths.map(({ col, width }) => ({
        col,
        width: pixelToExcelWidth(width, options),
    }));
}

/**
 * 批量将像素行高数组转换为Excel格式
 *
 * @param {Array<{row: number, height: number}>} rowHeights - 像素行高数组
 * @param {Object} [options] - 配置选项（传递给 pixelToExcelHeight）
 * @returns {Array<{row: number, height: number}>} 转换后的Excel行高数组
 */
export function convertRowHeightsToExcel(rowHeights, options = {}) {
    if (!Array.isArray(rowHeights)) return [];

    return rowHeights.map(({ row, height }) => ({
        row,
        height: pixelToExcelHeight(height, options),
    }));
}

// ============================================================================
// [导出常量]
// ============================================================================

// ============================================================================
// [字体大小转换]
// ============================================================================

/** 最小字体大小（像素） */
const MIN_FONT_SIZE_PX = 8;

/** 默认字体大小（像素） */
const DEFAULT_FONT_SIZE_PX = 12;

/** Excel默认字体大小（磅） */
const DEFAULT_EXCEL_FONT_SIZE = 11;

/** 最大字体大小（像素） */
const MAX_FONT_SIZE_PX = 200;

/**
 * 将Excel字体大小（磅）转换为像素
 *
 * Excel的字体大小单位是磅（points, 1/72英寸），
 * 而Canvas-Sheet/Web系统使用像素作为字体大小单位。
 *
 * 转换公式：pixels = points × (DPI / POINTS_PER_INCH)
 * - 基于96 DPI: pixels = points × 1.3333
 *
 * @param {number} fontSizeInPoints - Excel字体大小（磅）
 * @param {Object} [options] - 配置选项
 * @param {number} [options.minSize=8] - 最小像素值
 * @param {number} [options.maxSize=200] - 最大像素值
 * @param {number} [options.defaultValue=12] - 无效输入时的默认值
 * @returns {number} 像素字体大小
 *
 * @example
 * excelFontSizeToPixel(11)    // => 15 (Excel默认)
 * excelFontSizeToPixel(12)    // => 16
 * excelFontSizeToPixel(14)    // => 19
 * excelFontSizeToPixel(0)     // => 12 (返回默认值)
 */
export function excelFontSizeToPixel(fontSizeInPoints, options = {}) {
    const { minSize = MIN_FONT_SIZE_PX, maxSize = MAX_FONT_SIZE_PX, defaultValue = DEFAULT_FONT_SIZE_PX } = options;

    if (!fontSizeInPoints || typeof fontSizeInPoints !== "number" || fontSizeInPoints <= 0) {
        return defaultValue;
    }

    const pixelSize = Math.round(fontSizeInPoints * (STANDARD_DPI / POINTS_PER_INCH));
    return Math.max(minSize, Math.min(pixelSize, maxSize));
}

/**
 * 将像素字体大小转换为Excel格式（磅）
 *
 * 反向转换公式：points = pixels / (DPI / POINTS_PER_INCH)
 * - 基于96 DPI: points = pixels / 1.3333
 *
 * @param {number} pixelSize - 像素字体大小
 * @param {Object} [options] - 配置选项
 * @param {number} [options.minSize=1] - 最小磅值
 * @param {number} [options.maxSize=200] - 最大磅值
 * @param {number} [options.defaultValue=11] - 无效输入时的默认值
 * @returns {number} Excel字体大小（磅）
 *
 * @example
 * pixelToExcelFontSize(12)   // => 9 (约等于)
 * pixelToExcelFontSize(15)   // => 11.25 ≈ 11 (Excel默认)
 * pixelToExcelFontSize(0)    // => 11 (返回默认值)
 */
export function pixelToExcelFontSize(pixelSize, options = {}) {
    const { minSize = 1, maxSize = 200, defaultValue = DEFAULT_EXCEL_FONT_SIZE } = options;

    if (!pixelSize || typeof pixelSize !== "number" || pixelSize <= 0) {
        return defaultValue;
    }

    const fontSizeInPoints = pixelSize / (STANDARD_DPI / POINTS_PER_INCH);
    return Math.max(minSize, Math.min(fontSizeInPoints, maxSize));
}

// ============================================================================
// [导出常量]
// ============================================================================

export const EXCEL_UNITS_CONSTANTS = {
    STANDARD_DPI,
    POINTS_PER_INCH,
    MAX_DIGIT_WIDTH,
    COLUMN_PADDING,
    MIN_COL_WIDTH_PX,
    DEFAULT_COL_WIDTH_PX,
    MIN_ROW_HEIGHT_PX,
    DEFAULT_ROW_HEIGHT_PX,
    DEFAULT_EXCEL_COL_WIDTH,
    DEFAULT_EXCEL_ROW_HEIGHT,
    MIN_FONT_SIZE_PX,
    DEFAULT_FONT_SIZE_PX,
    DEFAULT_EXCEL_FONT_SIZE,
    MAX_FONT_SIZE_PX,
};
