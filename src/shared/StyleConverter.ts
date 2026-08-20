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
 * @module shared/StyleConverter
 */

import { errorHandler } from "../core/ErrorHandler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";
import { excelFontSizeToPixel, pixelToExcelFontSize } from "../utils/excelUnits.js";

// ============================================================================
// [Section 1] 颜色转换工具
// ============================================================================

let _colorParserElement: HTMLDivElement | null = null;

const _colorCache: Map<string, string> = new Map();

const _reverseColorCache: Map<string, string> = new Map();

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
 */
export function toArgb(color: string): string {
    if (!color || typeof color !== "string") return "00000000";

    const trimmedColor = color.trim();

    if (_colorCache.has(trimmedColor)) {
        return _colorCache.get(trimmedColor)!;
    }

    let result: string;

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
 */
export function fromArgb(argb: string): string {
    if (!argb || typeof argb !== "string") return "#000000";

    const trimmedArgb = argb.trim().replace(/^#/, "");

    if (_reverseColorCache.has(trimmedArgb)) {
        return _reverseColorCache.get(trimmedArgb)!;
    }

    let hex: string;

    if (/^[0-9a-f]{8}$/i.test(trimmedArgb)) {
        hex = trimmedArgb.slice(2).toUpperCase();
    } else if (/^[0-9a-f]{6}$/i.test(trimmedArgb)) {
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

const DEFAULT_FONT_SIZE = 11;

const DEFAULT_FONT_FAMILY = "Calibri";

const DEFAULT_BORDER_STYLE = "thin";

const DEFAULT_BORDER_COLOR = "FFDDDDDD";

// ============================================================================
// [Section 3] StyleConverter 主类
// ============================================================================

interface FlatStyle {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string | boolean;
    fontStyle?: string;
    color?: string;
    textAlign?: string;
    verticalAlign?: string;
    backgroundColor?: string;
    textDecoration?: string;
}

interface NestedStyleFont {
    name?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
}

interface NestedStyleAlignment {
    horizontal?: string;
    vertical?: string;
    wrapText?: boolean;
    indent?: number;
}

interface NestedStyleBorderSide {
    style?: string;
    color?: string;
}

interface NestedStyleBorder {
    top?: NestedStyleBorderSide;
    left?: NestedStyleBorderSide;
    bottom?: NestedStyleBorderSide;
    right?: NestedStyleBorderSide;
}

interface NestedStyleFill {
    type?: string;
    pattern?: string;
    fgColor?: string;
    bgColor?: string;
    color?: string;
}

interface NestedStyle {
    font?: NestedStyleFont;
    alignment?: NestedStyleAlignment;
    border?: NestedStyleBorder;
    fill?: NestedStyleFill;
    numberFormat?: string;
}

interface ExcelFontColor {
    argb?: string;
}

interface ExcelFont {
    name?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: ExcelFontColor;
}

interface ExcelAlignment {
    horizontal?: string;
    vertical?: string;
    wrapText?: boolean;
    indent?: number;
}

interface ExcelBorderSide {
    style?: string;
    color?: { argb?: string };
}

interface ExcelBorder {
    top?: ExcelBorderSide;
    left?: ExcelBorderSide;
    bottom?: ExcelBorderSide;
    right?: ExcelBorderSide;
}

interface ExcelFill {
    type?: string;
    pattern?: string;
    fgColor?: { argb?: string };
    bgColor?: { argb?: string };
}

interface ExcelStyle {
    font?: ExcelFont;
    alignment?: ExcelAlignment;
    border?: ExcelBorder;
    fill?: ExcelFill;
    numFmt?: string;
}

interface ConversionWarning {
    message: string;
    timestamp: Date;
    [key: string]: unknown;
}

export class StyleConverter {
    warnings: ConversionWarning[] = [];

    clearWarnings(): void {
        this.warnings = [];
    }

    #addWarning(message: string, context: Record<string, unknown> = {}): void {
        this.warnings.push({
            message,
            timestamp: new Date(),
            ...context,
        });
    }

    convertToExcel(style: FlatStyle | NestedStyle | null): Record<string, unknown> {
        if (!style || typeof style !== "object") return {};

        const isFlatFormat =
            (style as FlatStyle).backgroundColor !== undefined ||
            (style as FlatStyle).fontFamily !== undefined ||
            (style as FlatStyle).fontSize !== undefined ||
            (style as FlatStyle).fontWeight !== undefined ||
            (style as FlatStyle).textAlign !== undefined;

        if (isFlatFormat) {
            return this.#convertFlatToExcel(style as FlatStyle);
        }

        return this.#convertNestedToExcel(style as NestedStyle);
    }

    #convertFlatToExcel(style: FlatStyle): Record<string, unknown> {
        const excelStyle: Record<string, unknown> = {};

        const fontConfig: Record<string, unknown> = {};
        if (style.fontFamily) fontConfig.name = style.fontFamily;
        if (style.fontSize) fontConfig.size = pixelToExcelFontSize(style.fontSize);
        if (style.fontWeight === "bold" || style.fontWeight === true) fontConfig.bold = true;
        if (style.fontStyle === "italic") fontConfig.italic = true;
        if (style.color) fontConfig.color = { argb: toArgb(style.color) };

        if (Object.keys(fontConfig).length > 0) {
            excelStyle.font = fontConfig;
        }

        const alignConfig: Record<string, unknown> = {};
        if (style.textAlign) alignConfig.horizontal = style.textAlign;
        if (style.verticalAlign) alignConfig.vertical = style.verticalAlign;

        if (Object.keys(alignConfig).length > 0) {
            excelStyle.alignment = alignConfig;
        }

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

    #convertNestedToExcel(style: NestedStyle): Record<string, unknown> {
        const excelStyle: Record<string, unknown> = {};

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

        if (style.alignment) {
            excelStyle.alignment = {
                horizontal: style.alignment.horizontal || "left",
                vertical: style.alignment.vertical || "middle",
                wrapText: style.alignment.wrapText,
                indent: style.alignment.indent,
            };
        }

        if (style.border) {
            excelStyle.border = {
                top: this.#convertBorderSide(style.border.top),
                left: this.#convertBorderSide(style.border.left),
                bottom: this.#convertBorderSide(style.border.bottom),
                right: this.#convertBorderSide(style.border.right),
            };
        }

        if (style.fill) {
            excelStyle.fill = {
                type: "pattern",
                pattern: style.fill.pattern || "solid",
                fgColor: { argb: toArgb(style.fill.fgColor || style.fill.color || "#FFFFFF") },
                bgColor: { argb: toArgb(style.fill.bgColor || "#FFFFFF") },
            };
        }

        if (style.numberFormat) {
            excelStyle.numFmt = style.numberFormat;
        }

        return excelStyle;
    }

    #convertBorderSide(borderSide?: NestedStyleBorderSide): Record<string, unknown> | undefined {
        if (!borderSide) return undefined;

        return {
            style: borderSide.style || DEFAULT_BORDER_STYLE,
            color: { argb: toArgb(borderSide.color ?? "") || DEFAULT_BORDER_COLOR },
        };
    }

    convertFromExcel(excelStyle: ExcelStyle | null, outputFormat: "flat" | "nested" = "flat"): Record<string, unknown> {
        if (!excelStyle || typeof excelStyle !== "object") return {};

        if (outputFormat === "nested") {
            return this.#convertExcelToNested(excelStyle);
        }

        return this.#convertExcelToFlat(excelStyle);
    }

    #convertExcelToFlat(excelStyle: ExcelStyle): Record<string, unknown> {
        const flatStyle: Record<string, unknown> = {};

        if (excelStyle.font) {
            if (excelStyle.font.name) flatStyle.fontFamily = excelStyle.font.name;
            if (excelStyle.font.size) flatStyle.fontSize = excelFontSizeToPixel(excelStyle.font.size);
            if (excelStyle.font.bold) flatStyle.fontWeight = "bold";
            if (excelStyle.font.italic) flatStyle.fontStyle = "italic";
            if (excelStyle.font.color?.argb) {
                flatStyle.color = fromArgb(excelStyle.font.color.argb);
            }
        }

        if (excelStyle.alignment) {
            if (excelStyle.alignment.horizontal) flatStyle.textAlign = excelStyle.alignment.horizontal;
            if (excelStyle.alignment.vertical) flatStyle.verticalAlign = excelStyle.alignment.vertical;
        }

        if (excelStyle.fill?.fgColor?.argb) {
            const bgColor = fromArgb(excelStyle.fill.fgColor.argb);
            if (bgColor !== "#000000") {
                flatStyle.backgroundColor = bgColor;
            }
        }

        return flatStyle;
    }

    #convertExcelToNested(excelStyle: ExcelStyle): Record<string, unknown> {
        const nestedStyle: Record<string, unknown> = {};

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

        if (excelStyle.alignment) {
            nestedStyle.alignment = {
                horizontal: excelStyle.alignment.horizontal || "left",
                vertical: excelStyle.alignment.vertical || "middle",
                wrapText: excelStyle.alignment.wrapText,
                indent: excelStyle.alignment.indent,
            };
        }

        if (excelStyle.border) {
            nestedStyle.border = {
                top: this.#convertBorderSideFromExcel(excelStyle.border.top),
                left: this.#convertBorderSideFromExcel(excelStyle.border.left),
                bottom: this.#convertBorderSideFromExcel(excelStyle.border.bottom),
                right: this.#convertBorderSideFromExcel(excelStyle.border.right),
            };
        }

        if (excelStyle.fill) {
            nestedStyle.fill = {
                type: "pattern",
                pattern: excelStyle.fill.pattern || "solid",
                fgColor: excelStyle.fill.fgColor?.argb ? { argb: excelStyle.fill.fgColor.argb } : { argb: "FFFFFFFF" },
                bgColor: excelStyle.fill.bgColor?.argb ? { argb: excelStyle.fill.bgColor.argb } : { argb: "FFFFFFFF" },
            };
        }

        if (excelStyle.numFmt) {
            nestedStyle.numberFormat = excelStyle.numFmt;
        }

        return nestedStyle;
    }

    #convertBorderSideFromExcel(borderSide?: ExcelBorderSide): Record<string, unknown> | undefined {
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

export function createStyleConverter(): StyleConverter {
    return new StyleConverter();
}
