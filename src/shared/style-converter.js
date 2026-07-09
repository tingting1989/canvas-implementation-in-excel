/**
 * @fileoverview 共享样式转换模块
 *
 * 功能概述：
 * - 提供 Excel 样式与 Canvas-Sheet 样式的双向转换
 * - 被 ImportFilePlugin 和 ExportFilePlugin 共用
 * - 确保导入/导出样式的一致性和可逆性
 *
 * 设计原则：
 * 1. 双向对称：convertToExcel / convertFromExcel 使用同一套算法
 * 2. 容错处理：不支持的属性降级处理，不抛出致命错误
 * 3. 性能优化：颜色缓存、延迟初始化
 * 4. 可扩展性：易于添加新的样式属性支持
 *
 * @module shared/style-converter
 * @author Canvas-Sheet Team
 * @version 1.0.0
 */

import { errorHandler } from "../core/ErrorHandler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";

// ============================================================================
// [Section 1] 颜色转换工具
// ============================================================================

/**
 * 全局状态：颜色缓存和复用元素
 * @private
 */
let _colorParserElement = null;

/** @type {Map<string, string>} 颜色值缓存（原始值 → ARGB） */
const _colorCache = new Map();

/** @type {Map<string, string>} 反向颜色缓存（ARGB → 标准格式） */
const _reverseColorCache = new Map();

/**
 * 将颜色值转换为 ExcelJS 兼容的 ARGB 格式
 *
 * 支持的输入格式：
 * - 颜色名称：'red', 'yellow', 'tomato' 等
 * - 十六进制：'#FF0000', '#F00', 'FF0000'
 * - RGB：'rgb(255, 0, 0)', 'rgba(255, 0, 0, 0.5)'
 * - HSL：'hsl(0, 100%, 50%)', 'hsla(0, 100%, 50%, 0.5)'
 * - 特殊值：'transparent', ''
 *
 * 输出格式：
 * - 8 位十六进制 ARGB（无 # 号前缀）
 * - 示例：'FFFF0000'（完全不透明的红色）
 *
 * @param {string} color - 输入颜色值
 * @returns {string} ARGB 格式颜色（8 位十六进制，无 # 号）
 */
export function toArgb(color) {
    if (!color || typeof color !== "string") return "00000000";

    const trimmedColor = color.trim();

    // 快速路径1：查询缓存
    if (_colorCache.has(trimmedColor)) {
        return _colorCache.get(trimmedColor);
    }

    let result;

    const lowerColor = trimmedColor.toLowerCase();
    if (lowerColor === "transparent" || lowerColor === "") {
        result = "00000000";
    } else if (/^[0-9a-f]{8}$/i.test(trimmedColor)) {
        result = trimmedColor.toUpperCase();
    } else if (trimmedColor.match(/^#?([0-9a-f]{6})$/i)) {
        result = `FF${RegExp.$1.toUpperCase()}`;
    } else if (trimmedColor.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i)) {
        const fullHex = `${RegExp.$1}${RegExp.$1}${RegExp.$2}${RegExp.$2}${RegExp.$3}${RegExp.$3}`;
        result = `FF${fullHex.toUpperCase()}`;
    } else {
        try {
            if (!_colorParserElement) {
                _colorParserElement = document.createElement("div");
                _colorParserElement.style.position = "absolute";
                _colorParserElement.style.left = "-9999px";
                _colorParserElement.style.visibility = "hidden";
                document.body.appendChild(_colorParserElement);
            }

            _colorParserElement.style.color = trimmedColor;
            const computedColor = window.getComputedStyle(_colorParserElement).color;

            const rgbMatch = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (rgbMatch) {
                const red = parseInt(rgbMatch[1], 10);
                const green = parseInt(rgbMatch[2], 10);
                const blue = parseInt(rgbMatch[3], 10);

                if (!isNaN(red) && !isNaN(green) && !isNaN(blue)) {
                    const redHex = Math.max(0, Math.min(255, red)).toString(16).padStart(2, "0").toUpperCase();
                    const greenHex = Math.max(0, Math.min(255, green)).toString(16).padStart(2, "0").toUpperCase();
                    const blueHex = Math.max(0, Math.min(255, blue)).toString(16).padStart(2, "0").toUpperCase();
                    result = `FF${redHex}${greenHex}${blueHex}`;
                } else {
                    errorHandler.warn(ERROR_CODE.EXPORT_COLOR_PARSE_FAILED, `无效的RGB分量: ${computedColor}`);
                    result = "FF000000";
                }
            } else {
                errorHandler.warn(ERROR_CODE.EXPORT_COLOR_PARSE_FAILED, `无法解析浏览器颜色输出: ${computedColor}`);
                result = "FF000000";
            }
        } catch (error) {
            errorHandler.warn(ERROR_CODE.EXPORT_COLOR_PARSE_FAILED, `浏览器颜色解析失败: ${trimmedColor}`, { error });
            result = "FF000000";
        }
    }

    _colorCache.set(trimmedColor, result);
    return result;
}

/**
 * 将 ARGB 格式颜色转换为标准 CSS 颜色格式
 *
 * 这是 toArgb() 的逆操作，用于从 Excel 导入时转换颜色。
 *
 * @param {string} argb - ARGB 格式颜色（8位或6位十六进制，可带#号）
 * @returns {string} 标准 CSS 颜色格式（#RRGGBB）
 */
export function fromArgb(argb) {
    if (!argb || typeof argb !== "string") return "#000000";

    const trimmedArgb = argb.trim().replace(/^#/, "");

    // 快速路径：查询反向缓存
    if (_reverseColorCache.has(trimmedArgb)) {
        return _reverseColorCache.get(trimmedArgb);
    }

    let hex;

    if (/^[0-9a-f]{8}$/i.test(trimmedArgb)) {
        // 8位ARGB，取后6位作为RGB
        hex = trimmedArgb.slice(2).toUpperCase();
    } else if (/^[0-9a-f]{6}$/i.test(trimmedArgb)) {
        // 6位RGB，直接使用
        hex = trimmedArgb.toUpperCase();
    } else {
        return "#000000";
    }

    const result = `#${hex}`;
    _reverseColorCache.set(trimmedArgb, result);
    return result;
}

// ============================================================================
// [Section 2] 默认值常量
// ============================================================================

/** 默认字体大小 */
const DEFAULT_FONT_SIZE = 11;

/** 默认字体名称 */
const DEFAULT_FONT_FAMILY = "Calibri";

/** 默认边框样式 */
const DEFAULT_BORDER_STYLE = "thin";

/** 默认边框颜色 */
const DEFAULT_BORDER_COLOR = "FFDDDDDD";

// ============================================================================
// [Section 3] StyleConverter 主类
// ============================================================================

/**
 * 样式转换器类
 *
 * 提供 Excel 样式与 Canvas-Sheet 样式之间的双向转换功能。
 * 支持两种格式：
 * - 扁平格式（Canvas-Sheet StylePool 格式）
 * - 嵌套格式（ExcelJS 标准格式）
 *
 * @class StyleConverter
 */
export class StyleConverter {
    constructor() {
        /** @type {Array} 转换警告列表 */
        this.warnings = [];
    }

    /**
     * 清空警告列表
     */
    clearWarnings() {
        this.warnings = [];
    }

    /**
     * 添加转换警告
     *
     * @param {string} message - 警告消息
     * @param {Object} context - 警告上下文信息
     */
    #addWarning(message, context = {}) {
        this.warnings.push({
            message,
            timestamp: new Date(),
            ...context,
        });
    }

    /**
     * 将 Canvas-Sheet 样式转换为 ExcelJS 样式
     *
     * 支持两种输入格式：
     * 1. 扁平格式（StylePool 返回的格式）
     * 2. 嵌套格式（ExcelJS 标准格式，直接透传）
     *
     * @param {Object|null} style - Canvas-Sheet 样式对象
     * @returns {Object} ExcelJS 样式对象
     */
    convertToExcel(style) {
        if (!style || typeof style !== "object") return {};

        const excelStyle = {};

        // 检测是否为扁平格式
        const isFlatFormat =
            style.backgroundColor !== undefined ||
            style.fontFamily !== undefined ||
            style.fontSize !== undefined ||
            style.fontWeight !== undefined ||
            style.textAlign !== undefined;

        if (isFlatFormat) {
            return this.#convertFlatToExcel(style);
        }

        return this.#convertNestedToExcel(style);
    }

    /**
     * 将扁平格式的 Canvas-Sheet 样式转换为 ExcelJS 样式
     *
     * @param {Object} style - 扁平格式样式对象
     * @returns {Object} ExcelJS 样式对象
     */
    #convertFlatToExcel(style) {
        const excelStyle = {};

        // 字体设置
        const fontConfig = {};
        if (style.fontFamily) fontConfig.name = style.fontFamily;
        if (style.fontSize) fontConfig.size = style.fontSize;
        if (style.fontWeight === "bold" || style.fontWeight === true) fontConfig.bold = true;
        if (style.fontStyle === "italic") fontConfig.italic = true;
        if (style.color) fontConfig.color = { argb: toArgb(style.color) };

        if (Object.keys(fontConfig).length > 0) {
            excelStyle.font = fontConfig;
        }

        // 对齐方式
        const alignConfig = {};
        if (style.textAlign) alignConfig.horizontal = style.textAlign;
        if (style.verticalAlign) alignConfig.vertical = style.verticalAlign;

        if (Object.keys(alignConfig).length > 0) {
            excelStyle.alignment = alignConfig;
        }

        // 背景色
        if (style.backgroundColor && style.backgroundColor !== "transparent") {
            const bgColor = toArgb(style.backgroundColor);

            if (bgColor !== "00000000") {
                excelStyle.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: bgColor },
                    bgColor: { argb: bgColor },
                };
            }
        }

        return excelStyle;
    }

    /**
     * 将嵌套格式的样式转换为 ExcelJS 样式（透传 + 颜色转换）
     *
     * @param {Object} style - 嵌套格式样式对象
     * @returns {Object} ExcelJS 样式对象
     */
    #convertNestedToExcel(style) {
        const excelStyle = {};

        // 字体设置
        if (style.font) {
            excelStyle.font = {
                name: style.font.name || DEFAULT_FONT_FAMILY,
                size: style.font.size || DEFAULT_FONT_SIZE,
                bold: style.font.bold,
                italic: style.font.italic,
                underline: style.font.underline,
                color: style.font.color ? { argb: toArgb(style.font.color) } : undefined,
            };
        }

        // 对齐方式
        if (style.alignment) {
            excelStyle.alignment = {
                horizontal: style.alignment.horizontal || "left",
                vertical: style.alignment.vertical || "middle",
                wrapText: style.alignment.wrapText,
                indent: style.alignment.indent,
            };
        }

        // 边框设置
        if (style.border) {
            excelStyle.border = {
                top: this.#convertBorderSide(style.border.top),
                left: this.#convertBorderSide(style.border.left),
                bottom: this.#convertBorderSide(style.border.bottom),
                right: this.#convertBorderSide(style.border.right),
            };
        }

        // 填充设置
        if (style.fill) {
            excelStyle.fill = {
                type: "pattern",
                pattern: style.fill.pattern || "solid",
                fgColor: { argb: toArgb(style.fill.fgColor || style.fill.color || "#FFFFFF") },
                bgColor: { argb: toArgb(style.fill.bgColor || "#FFFFFF") },
            };
        }

        // 数字格式
        if (style.numberFormat) {
            excelStyle.numFmt = style.numberFormat;
        }

        return excelStyle;
    }

    /**
     * 转换单个边框侧
     *
     * @param {Object} borderSide - 边框侧配置
     * @returns {Object|undefined} 转换后的边框侧配置
     */
    #convertBorderSide(borderSide) {
        if (!borderSide) return undefined;

        return {
            style: borderSide.style || DEFAULT_BORDER_STYLE,
            color: { argb: toArgb(borderSide.color) || DEFAULT_BORDER_COLOR },
        };
    }

    /**
     * 将 ExcelJS 样式转换为 Canvas-Sheet 样式
     *
     * 这是 convertToExcel() 的逆操作。
     *
     * @param {Object|null} excelStyle - ExcelJS 样式对象
     * @param {string} [outputFormat='flat'] - 输出格式：'flat' 或 'nested'
     * @returns {Object} Canvas-Sheet 样式对象
     */
    convertFromExcel(excelStyle, outputFormat = "flat") {
        if (!excelStyle || typeof excelStyle !== "object") return {};

        if (outputFormat === "nested") {
            return this.#convertExcelToNested(excelStyle);
        }

        return this.#convertExcelToFlat(excelStyle);
    }

    /**
     * 将 ExcelJS 样式转换为扁平格式的 Canvas-Sheet 样式
     *
     * @param {Object} excelStyle - ExcelJS 样式对象
     * @returns {Object} 扁平格式样式对象
     */
    #convertExcelToFlat(excelStyle) {
        const flatStyle = {};

        // 字体设置
        if (excelStyle.font) {
            if (excelStyle.font.name) flatStyle.fontFamily = excelStyle.font.name;
            if (excelStyle.font.size) flatStyle.fontSize = excelStyle.font.size;
            if (excelStyle.font.bold) flatStyle.fontWeight = "bold";
            if (excelStyle.font.italic) flatStyle.fontStyle = "italic";
            if (excelStyle.font.color?.argb) {
                flatStyle.color = fromArgb(excelStyle.font.color.argb);
            }
        }

        // 对齐方式
        if (excelStyle.alignment) {
            if (excelStyle.alignment.horizontal) flatStyle.textAlign = excelStyle.alignment.horizontal;
            if (excelStyle.alignment.vertical) flatStyle.verticalAlign = excelStyle.alignment.vertical;
        }

        // 背景色
        if (excelStyle.fill?.fgColor?.argb) {
            const bgColor = fromArgb(excelStyle.fill.fgColor.argb);
            if (bgColor !== "#000000") {
                flatStyle.backgroundColor = bgColor;
            }
        }

        return flatStyle;
    }

    /**
     * 将 ExcelJS 样式转换为嵌套格式的 Canvas-Sheet 样式
     *
     * @param {Object} excelStyle - ExcelJS 样式对象
     * @returns {Object} 嵌套格式样式对象
     */
    #convertExcelToNested(excelStyle) {
        const nestedStyle = {};

        // 字体设置
        if (excelStyle.font) {
            nestedStyle.font = {
                name: excelStyle.font.name || DEFAULT_FONT_FAMILY,
                size: excelStyle.font.size || DEFAULT_FONT_SIZE,
                bold: excelStyle.font.bold,
                italic: excelStyle.font.italic,
                underline: excelStyle.font.underline,
                color: excelStyle.font.color?.argb ? { argb: excelStyle.font.color.argb } : undefined,
            };
        }

        // 对齐方式
        if (excelStyle.alignment) {
            nestedStyle.alignment = {
                horizontal: excelStyle.alignment.horizontal || "left",
                vertical: excelStyle.alignment.vertical || "middle",
                wrapText: excelStyle.alignment.wrapText,
                indent: excelStyle.alignment.indent,
            };
        }

        // 边框设置
        if (excelStyle.border) {
            nestedStyle.border = {
                top: this.#convertBorderSideFromExcel(excelStyle.border.top),
                left: this.#convertBorderSideFromExcel(excelStyle.border.left),
                bottom: this.#convertBorderSideFromExcel(excelStyle.border.bottom),
                right: this.#convertBorderSideFromExcel(excelStyle.border.right),
            };
        }

        // 填充设置
        if (excelStyle.fill) {
            nestedStyle.fill = {
                type: "pattern",
                pattern: excelStyle.fill.pattern || "solid",
                fgColor: excelStyle.fill.fgColor?.argb ? { argb: excelStyle.fill.fgColor.argb } : { argb: "FFFFFFFF" },
                bgColor: excelStyle.fill.bgColor?.argb ? { argb: excelStyle.fill.bgColor.argb } : { argb: "FFFFFFFF" },
            };
        }

        // 数字格式
        if (excelStyle.numFmt) {
            nestedStyle.numberFormat = excelStyle.numFmt;
        }

        return nestedStyle;
    }

    /**
     * 从 ExcelJS 边框侧转换
     *
     * @param {Object} borderSide - ExcelJS 边框侧配置
     * @returns {Object|undefined} 转换后的边框侧配置
     */
    #convertBorderSideFromExcel(borderSide) {
        if (!borderSide) return undefined;

        return {
            style: borderSide.style || DEFAULT_BORDER_STYLE,
            color: borderSide.color?.argb || DEFAULT_BORDER_COLOR,
        };
    }
}

// ============================================================================
// [Section 4] 便捷函数导出
// ============================================================================

/**
 * 创建样式转换器实例（便捷函数）
 *
 * @returns {StyleConverter} 新的样式转换器实例
 */
export function createStyleConverter() {
    return new StyleConverter();
}
