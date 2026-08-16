import { CONFIG } from "../../constants/config.js";
import { isObject, isString } from "../../utils/helper.js";
import { calcCenteredTextY } from "../../utils/canvasUtils.js";
import { LogicalCell } from "./models/LogicalCell.js";
import type { LogicalCellStyle } from "./models/LogicalCell.js";
import { Fragment } from "./models/Fragment.js";
import type { FragmentOpts } from "./models/Fragment.js";
import { BorderMask } from "./models/BorderMask.js";
import type { BorderMaskValue } from "./models/BorderMask.js";
import { PARTIAL_TYPE } from "./models/PartialType.js";
import type { PartialType } from "./models/PartialType.js";
import type { FrozenBoundaryInfo } from "./models/FrozenBoundaryInfo.js";

type ViewportTransform = import("../ViewportTransform.js").ViewportTransform;
type Sheet = import("../../workbook/Sheet.js").Sheet;

interface LayerFragmentOpts {
    layerData: (string | Record<string, unknown>)[];
    layerIndex: number;
    layerY: number;
    rowH: number;
    sc: number;
    ec: number;
    frozenBoundary: FrozenBoundaryInfo;
    vt: ViewportTransform;
    sheet: Sheet;
    defaultStyle: LogicalCellStyle;
    headerFont: string;
}

interface SimpleLayerFragmentOpts {
    sc: number;
    ec: number;
    layerY: number;
    rowH: number;
    vt: ViewportTransform;
    sheet: Sheet;
    defaultStyle: LogicalCellStyle;
    headerFont: string;
}

interface CellToFragmentCtx {
    layerY: number;
    rowH: number;
    sc: number;
    ec: number;
    frozenBoundary: FrozenBoundaryInfo;
    vt: ViewportTransform;
    sheet: Sheet;
    defaultStyle: LogicalCellStyle;
    headerFont: string;
}

interface CreateFragmentOpts {
    visStartCol: number;
    visEndCol: number;
    layerY: number;
    rowH: number;
    vt: ViewportTransform;
    sheet: Sheet;
    defaultStyle: LogicalCellStyle;
    headerFont: string;
    borderOverride: BorderMaskValue;
    partialType: PartialType;
}

export class HeaderLayoutBuilder {
    buildLayerFragments(opts: LayerFragmentOpts): Fragment[] {
        const { layerData, layerIndex, layerY, rowH, sc, ec, frozenBoundary, vt, sheet, defaultStyle, headerFont } = opts;

        const logicalCells = this.#parseLayerCells(layerData, layerIndex);
        const visibleCells = logicalCells.filter((c) => c.endCol >= sc && c.startCol < ec);

        const fragments: Fragment[] = [];
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

    buildSimpleLayerFragments(opts: SimpleLayerFragmentOpts): Fragment[] {
        const { sc, ec, layerY, rowH, vt, sheet, defaultStyle, headerFont } = opts;
        const rc = sheet.rowColManager;
        const cp = sheet.cellPadding;
        const fragments: Fragment[] = [];

        for (let c = sc; c < ec; c++) {
            const w = rc.getColWidth(c);
            if (w <= 0) continue;

            const x = vt.colToViewX(c);
            const colStyle = sheet.getColHeaderStyle(c) as LogicalCellStyle | null;
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
                    textY: calcCenteredTextY(layerY, rowH, headerFont),
                    maxTextWidth: w - cp * 2,
                    isPartial: false,
                    partialType: PARTIAL_TYPE.FULL,
                }),
            );
        }

        return fragments;
    }

    #parseLayerCells(layerData: (string | Record<string, unknown>)[], layerIndex: number): LogicalCell[] {
        const cells: LogicalCell[] = [];
        let consumed = 0;

        for (let i = 0; i < layerData.length; i++) {
            const item = layerData[i];
            const label = isString(item) ? item : ((item?.label ?? "") as string);
            const colspan =
                item && isObject(item) && (item as Record<string, unknown>).colspan ? ((item as Record<string, unknown>).colspan as number) : 1;
            const style = ((item as Record<string, unknown>)?.style as LogicalCellStyle | null) || null;

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

    #cellToFragments(cell: LogicalCell, ctx: CellToFragmentCtx): (Fragment | null)[] {
        const { frozenBoundary, sc, ec, vt, ...rest } = ctx;

        if (frozenBoundary.splitsCellHorizontally(cell)) {
            const fragments: (Fragment | null)[] = [];

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

        const visEndCol = Math.min(cell.endCol, ec - 1);
        const baseBorderMask = cell.isMerged ? BorderMask.MERGED_DEFAULT : BorderMask.ALL;
        const borderOverride = visEndCol >= ec - 1 && cell.isMerged ? ((baseBorderMask | BorderMask.RIGHT) as BorderMaskValue) : baseBorderMask;

        return [
            this.#createFragment(cell, {
                ...rest,
                visStartCol: Math.max(cell.startCol, sc),
                visEndCol,
                vt,
                borderOverride,
                partialType: PARTIAL_TYPE.FULL,
            }),
        ];
    }

    #createFragment(cell: LogicalCell, opts: CreateFragmentOpts): Fragment | null {
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

        let text: string | null;
        let textX: number;
        let maxTextWidth: number;
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
            textY: calcCenteredTextY(layerY, rowH, headerFont),
            maxTextWidth,
            isPartial: partialType !== PARTIAL_TYPE.FULL,
            partialType,
        });
    }

    #mergeStyle(baseStyle: LogicalCellStyle | null, customStyle: LogicalCellStyle | null): LogicalCellStyle | null {
        if (!customStyle) return baseStyle;

        return {
            ...baseStyle,
            ...customStyle,
            color: customStyle.color || baseStyle?.color || null,
            backgroundColor: customStyle.backgroundColor || baseStyle?.backgroundColor || null,
        };
    }

    #buildFont(baseFont: string, style: LogicalCellStyle | null): string {
        if (!style) return baseFont;

        const parts: string[] = [];
        if (style.fontStyle) parts.push(style.fontStyle);
        if (style.fontWeight) parts.push(style.fontWeight);
        if (style.fontSize) parts.push(style.fontSize);
        else parts.push(baseFont.match(/^[\d.]+px/)?.[0] || `${CONFIG.DEFAULT_FONT_SIZE}px`);
        parts.push(baseFont.match(/\s+(.+)$/)?.[1] || CONFIG.DEFAULT_FONT_FAMILY);

        return parts.join(" ");
    }

    #calcTextX(cellX: number, cellWidth: number, textAlign: string, padding: number = CONFIG.CELL_PADDING): number {
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
}
