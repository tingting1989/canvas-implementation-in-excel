import { CONFIG } from "@/constants/config";
import { isObject, isString } from "@/utils/utils";
import { LogicalCell } from "./models/LogicalCell.js";
import { Fragment } from "./models/Fragment.js";
import { BorderMask } from "./models/BorderMask.js";
import { PARTIAL_TYPE } from "./models/PartialType.js";

export class HeaderLayoutBuilder {
    /**
     * 构建指定层的可视片段列表（嵌套表头）
     *
     * @param {object} opts
     * @returns {Fragment[]}
     */
    buildLayerFragments(opts) {
        const { layerData, layerIndex, layerY, rowH, sc, ec, frozenBoundary, vt, sheet, defaultStyle, headerFont } = opts;

        const logicalCells = this.#parseLayerCells(layerData, layerIndex);
        const visibleCells = logicalCells.filter((c) => c.endCol >= sc && c.startCol < ec);

        const fragments = [];
        for (const cell of visibleCells) {
            const cellFragments = this.#cellToFragments(cell, {
                layerY,
                rowH,
                sc,
                ec,
                frozenBoundary,
                vt,
                sheet,
                defaultStyle,
                headerFont,
            });
            for (const frag of cellFragments) {
                if (frag) fragments.push(frag);
            }
        }

        fragments.sort((a, b) => a.x - b.x);
        return fragments;
    }

    /**
     * 构建非嵌套表头的 Fragment 列表
     *
     * 非嵌套表头等价于"单层、colspan=1"的嵌套表头。
     * 每个 Fragment 的 borderMask = ALL（四边全画），
     * 因为不存在跨列合并，不存在跨冻结边界问题。
     *
     * @param {object} opts
     * @returns {Fragment[]}
     */
    buildSimpleLayerFragments(opts) {
        const { sc, ec, layerY, rowH, vt, sheet, defaultStyle, headerFont } = opts;
        const rc = sheet.rowColManager;
        const cp = sheet.cellPadding;
        const fragments = [];

        for (let c = sc; c < ec; c++) {
            const w = rc.getColWidth(c);
            if (w <= 0) continue;

            const x = vt.colToViewX(c);
            const colStyle = sheet.getColHeaderStyle(c);
            const mergedStyle = this.#mergeStyle(defaultStyle, colStyle);
            const textAlign = colStyle?.textAlign || "left";
            const font = this.#buildFont(headerFont, colStyle);

            fragments.push(
                new Fragment({
                    sourceCell: null,
                    visStartCol: c,
                    visEndCol: c,
                    x,
                    y: layerY,
                    w,
                    h: rowH,
                    borderMask: BorderMask.ALL,
                    mergedStyle,
                    text: sheet.getColHeader(c),
                    font,
                    textAlign,
                    textX: this.#calcTextX(x, w, textAlign, cp),
                    textY: this.#calcCenteredTextY(layerY, rowH, headerFont),
                    maxTextWidth: w - cp * 2,
                    isPartial: false,
                    partialType: PARTIAL_TYPE.FULL,
                }),
            );
        }

        return fragments;
    }

    #parseLayerCells(layerData, layerIndex) {
        const cells = [];
        let consumed = 0;

        for (let i = 0; i < layerData.length; i++) {
            const item = layerData[i];
            const label = isString(item) ? item : (item?.label ?? "");
            const colspan = item && isObject(item) && item.colspan ? item.colspan : 1;
            const style = item?.style || null;

            cells.push(
                new LogicalCell({
                    layerIndex,
                    startCol: consumed,
                    endCol: consumed + colspan - 1,
                    colspan,
                    label,
                    style,
                }),
            );

            consumed += colspan;
        }

        return cells;
    }

    #cellToFragments(cell, ctx) {
        const { frozenBoundary, sc, ec, vt, ...rest } = ctx;

        if (frozenBoundary.splitsCellHorizontally(cell)) {
            const fragments = [];

            if (sc < frozenBoundary.fixedCols) {
                const frozenStart = Math.max(cell.startCol, sc);
                const frozenEnd = frozenBoundary.fixedCols - 1;
                if (frozenStart <= frozenEnd) {
                    const frag = this.#createFragment(cell, {
                        ...rest,
                        visStartCol: frozenStart,
                        visEndCol: frozenEnd,
                        vt,
                        borderOverride: BorderMask.FROZEN_SIDE,
                        partialType: PARTIAL_TYPE.FROZEN,
                    });
                    if (frag) fragments.push(frag);
                }
            }

            if (sc >= frozenBoundary.fixedCols || ec > frozenBoundary.fixedCols) {
                const scrollStart = Math.max(frozenBoundary.fixedCols, sc);
                const scrollEnd = Math.min(cell.endCol, ec - 1);
                if (scrollStart <= scrollEnd) {
                    const frag = this.#createFragment(cell, {
                        ...rest,
                        visStartCol: scrollStart,
                        visEndCol: scrollEnd,
                        vt,
                        borderOverride: BorderMask.SCROLL_SIDE,
                        partialType: PARTIAL_TYPE.SCROLL,
                    });
                    if (frag) fragments.push(frag);
                }
            }

            return fragments;
        }

        return [
            this.#createFragment(cell, {
                ...rest,
                visStartCol: Math.max(cell.startCol, sc),
                visEndCol: Math.min(cell.endCol, ec - 1),
                vt,
                borderOverride: cell.isMerged ? BorderMask.MERGED_DEFAULT : BorderMask.ALL,
                partialType: PARTIAL_TYPE.FULL,
            }),
        ];
    }

    #createFragment(cell, opts) {
        const { visStartCol, visEndCol, layerY, rowH, vt, sheet, defaultStyle, headerFont, borderOverride, partialType } = opts;
        const rc = sheet.rowColManager;
        const cp = sheet.cellPadding;

        let visibleStartCol = visStartCol;
        while (visibleStartCol <= visEndCol && rc.getColWidth(visibleStartCol) <= 0) {
            visibleStartCol++;
        }
        if (visibleStartCol > visEndCol) return null;

        const x = vt.colToViewX(visibleStartCol);
        const rightX = vt.colRightToViewX(visEndCol);
        const totalW = rightX - x;

        if (totalW <= 0) return null;

        const mergedStyle = this.#mergeStyle(defaultStyle, cell.style);
        const textAlign = cell.style?.textAlign || "left";
        const font = this.#buildFont(headerFont, cell.style);

        let text, textX, maxTextWidth;
        if (partialType === PARTIAL_TYPE.FROZEN) {
            text = cell.label;
            textX = this.#calcTextX(x, totalW, textAlign, cp);
            maxTextWidth = totalW - cp * 2;
        } else if (partialType === PARTIAL_TYPE.SCROLL) {
            text = null;
            textX = 0;
            maxTextWidth = 0;
        } else {
            text = cell.label;
            textX = this.#calcTextX(x, totalW, textAlign, cp);
            maxTextWidth = totalW - cp * 2;
        }

        return new Fragment({
            sourceCell: cell,
            visStartCol,
            visEndCol,
            x,
            y: layerY,
            w: totalW,
            h: rowH,
            borderMask: borderOverride,
            mergedStyle,
            text,
            font,
            textAlign,
            textX,
            textY: this.#calcCenteredTextY(layerY, rowH, headerFont),
            maxTextWidth,
            isPartial: partialType !== PARTIAL_TYPE.FULL,
            partialType,
        });
    }

    #mergeStyle(baseStyle, customStyle) {
        if (!customStyle) return baseStyle;

        return {
            ...baseStyle,
            ...customStyle,
            color: customStyle.color || baseStyle?.color || null,
            backgroundColor: customStyle.backgroundColor || baseStyle?.backgroundColor || null,
        };
    }

    #buildFont(baseFont, style) {
        if (!style) return baseFont;

        const parts = [];
        if (style.fontStyle) parts.push(style.fontStyle);
        if (style.fontWeight) parts.push(style.fontWeight);
        if (style.fontSize) parts.push(style.fontSize);
        else parts.push(baseFont.match(/^[\d.]+px/)?.[0] || `${CONFIG.DEFAULT_FONT_SIZE}px`);
        parts.push(baseFont.match(/\s+(.+)$/)?.[1] || CONFIG.DEFAULT_FONT_FAMILY);

        return parts.join(" ");
    }

    #calcTextX(cellX, cellWidth, textAlign, padding = CONFIG.CELL_PADDING) {
        switch (textAlign) {
            case "center":
                return cellX + cellWidth / 2;
            case "right":
                return cellX + cellWidth - padding;
            case "left":
            default:
                return cellX + padding;
        }
    }

    /**
     * 计算垂直居中的文字基线 Y 坐标
     *
     * Canvas fillText 的 y 参数是文字基线位置，不是文字中心。
     * 要实现视觉垂直居中，需要：
     * - 将文字放在行的垂直中心
     * - 调整基线偏移（通常字体高度的 ~1/3 用于上升部）
     *
     * @param {number} layerY - 层的起始 Y 坐标
     * @param {number} rowH - 行高度（px）
     * @param {string} font - CSS font 字符串（如 "14px Microsoft YaHei"）
     * @returns {number} 垂直居中的 textY 坐标
     */
    #calcCenteredTextY(layerY, rowH, font) {
        const fontSize = this.#extractFontSize(font);
        const centerY = layerY + rowH / 2;
        const baselineOffset = fontSize * 0.35;  // 基线偏移量（经验值，使视觉居中）
        return centerY + baselineOffset;
    }

    /**
     * 从 CSS font 字符串中提取字体大小（px）
     *
     * @param {string} font - 如 "bold 14px Microsoft YaHei"
     * @returns {number} 字体大小（px），默认 14
     */
    #extractFontSize(font) {
        if (!font) return CONFIG.DEFAULT_FONT_SIZE || 14;
        const match = font.match(/(\d+(?:\.\d+)?)\s*px/i);
        return match ? parseFloat(match[1]) : (CONFIG.DEFAULT_FONT_SIZE || 14);
    }
}