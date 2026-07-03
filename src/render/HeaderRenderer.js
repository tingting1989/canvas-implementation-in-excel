import { CONFIG } from "@/constants/config";
import { HeaderLayoutBuilder } from "./header/HeaderLayoutBuilder.js";
import { HeaderPainter } from "./header/HeaderPainter.js";
import { FrozenBoundaryInfo } from "./header/models/FrozenBoundaryInfo.js";

export class HeaderRenderer {
    constructor() {
        this.#columnHeaderRenderers = [];
        this.#layoutBuilder = new HeaderLayoutBuilder();
        this.#painter = new HeaderPainter();
    }

    /** @type {Array<Function>} 列头扩展渲染器列表 */
    #columnHeaderRenderers;

    /** @type {HeaderLayoutBuilder} */
    #layoutBuilder;

    /** @type {HeaderPainter} */
    #painter;

    /**
     * 注册列头扩展渲染器（用于插件绘制自定义UI）
     *
     * @param {Function} renderer - 渲染函数 (ctx, colIndex, x, y, width, height) => void
     */
    registerColumnHeaderRenderer(renderer) {
        if (typeof renderer === "function") {
            this.#columnHeaderRenderers.push(renderer);
        }
    }

    /**
     * 移除列头扩展渲染器
     *
     * @param {Function} renderer - 要移除的渲染函数引用
     */
    unregisterColumnHeaderRenderer(renderer) {
        const index = this.#columnHeaderRenderers.indexOf(renderer);
        if (index > -1) {
            this.#columnHeaderRenderers.splice(index, 1);
        }
    }

    /**
     * 主渲染入口
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表
     * @param {import("./ViewportTransform.js").ViewportTransform} vt - 视口坐标转换器
     * @param {number} viewW - 可视区域宽度
     * @param {number} viewH - 可视区域高度
     * @param dragIndicator - 拖拽指示器
     */
    render(ctx, sheet, vt, viewW, viewH, dragIndicator = null) {
        this._dragIndicator = dragIndicator;
        const range = sheet.selection.getRange();

        this.#renderColumnHeaders(ctx, sheet, vt, viewW, range);
        this.#renderRowHeaders(ctx, sheet, vt, viewH, range);
        this.#renderCorner(ctx, vt, range);
    }

    // ─── 列头渲染 ──────────────────────────────────────────

    #renderColumnHeaders(ctx, sheet, vt, viewW, range) {
        const rc = sheet.rowColManager;
        const headerW = vt.headerW;
        const rowH = CONFIG.HEADER_HEIGHT;
        const defaultStyle = sheet.getDefaultStyle();
        const headerFont = this.#buildHeaderFont(defaultStyle);

        const nestedCount = sheet.getNestedHeaderRowCount();
        const totalHeaderH = vt.headerH;
        const frozenColsW = vt.frozenColsW;
        const fixedCols = vt.fixedCols;

        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(headerW, 0, viewW - headerW, totalHeaderH);

        this.#renderHeaderRegion(ctx, sheet, {
            vt,
            rc,
            clipX: headerW + frozenColsW,
            clipY: 0,
            clipW: viewW - headerW - frozenColsW,
            clipH: totalHeaderH,
            rowH,
            defaultStyle,
            headerFont,
            nestedCount,
            range,
            fixedCols,
            isFrozen: false,
        });

        if (frozenColsW > 0) {
            this.#renderHeaderRegion(ctx, sheet, {
                vt,
                rc,
                clipX: headerW,
                clipY: 0,
                clipW: frozenColsW,
                clipH: totalHeaderH,
                rowH,
                defaultStyle,
                headerFont,
                nestedCount,
                range,
                fixedCols,
                isFrozen: true,
            });
        }

        if (!this._dragIndicator?.hasColumnMove()) {
            this.#drawColSelectionLines(ctx, sheet, vt, totalHeaderH, viewW, range, frozenColsW, fixedCols);
        }
    }

    /**
     * 在指定裁剪区域内渲染列头（统一走 Fragment 管线）
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Sheet} sheet
     * @param {object} opts
     * @private
     */
    #renderHeaderRegion(ctx, sheet, opts) {
        const { vt, rc, clipX, clipY, clipW, clipH, rowH, defaultStyle, headerFont, nestedCount, range, fixedCols, isFrozen } = opts;

        ctx.save();
        ctx.beginPath();
        ctx.rect(clipX, clipY, clipW, clipH);
        ctx.clip();

        const sc = this.#calcStartCol(vt, rc, fixedCols, isFrozen, clipW);
        const ec = this.#calcEndCol(vt, rc, fixedCols, isFrozen, clipW);

        if (nestedCount > 0) {
            const frozenBoundary = new FrozenBoundaryInfo({ fixedCols, fixedRows: 0 });

            for (let layerIdx = 0; layerIdx < nestedCount; layerIdx++) {
                const layerY = layerIdx * rowH;
                const layerData = sheet.nestedHeaders[layerIdx];
                if (!Array.isArray(layerData)) continue;

                const fragments = this.#layoutBuilder.buildLayerFragments({
                    layerData,
                    layerIndex: layerIdx,
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

                this.#enrichFragmentsWithState(fragments, range);

                this.#painter.paintAll(ctx, fragments, {
                    layerBottomY: layerY + rowH,
                    vt,
                    rc,
                    columnHeaderRenderers: this.#columnHeaderRenderers,
                });
            }
        } else {
            const fragments = this.#layoutBuilder.buildSimpleLayerFragments({
                sc,
                ec,
                layerY: 0,
                rowH,
                vt,
                sheet,
                defaultStyle,
                headerFont,
            });

            this.#enrichFragmentsWithState(fragments, range);

            this.#painter.paintAll(ctx, fragments, {
                layerBottomY: rowH,
                vt,
                rc,
                columnHeaderRenderers: this.#columnHeaderRenderers,
            });
        }

        ctx.restore();
    }

    /**
     * 为 Fragment 列表注入选区/拖拽状态
     *
     * @param {import("./header/models/Fragment.js").Fragment[]} fragments
     * @param {object} range
     * @private
     */
    #enrichFragmentsWithState(fragments, range) {
        for (const frag of fragments) {
            if (!frag) continue;
            const col = frag.visStartCol;
            frag.isSource = this._dragIndicator?.isColumnSource(col) ?? false;

            const isNested = !!frag.sourceCell;
            frag.isHighlighted = !isNested && col >= range.topCol && col <= range.bottomCol;
        }
    }

    // ─── 行头渲染 ──────────────────────────────────────────

    #renderRowHeaders(ctx, sheet, vt, viewH, range) {
        const rc = sheet.rowColManager;
        const headerW = vt.headerW;
        const headerH = vt.headerH;
        const defaultStyle = sheet.getDefaultStyle();
        const headerFont = this.#buildHeaderFont(defaultStyle);
        const frozenRowsH = vt.frozenRowsH;
        const fixedRows = vt.fixedRows;
        const scrollY = vt.scrollY;

        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(0, headerH, headerW, viewH - headerH);

        this.#renderRowHeaderRegion(ctx, sheet, {
            vt,
            rc,
            clipY: headerH + frozenRowsH,
            clipH: viewH - headerH - frozenRowsH,
            headerW,
            headerH,
            defaultStyle,
            headerFont,
            range,
            fixedRows,
            isFrozen: false,
        });

        if (frozenRowsH > 0) {
            this.#renderRowHeaderRegion(ctx, sheet, {
                vt,
                rc,
                clipY: headerH,
                clipH: frozenRowsH,
                headerW,
                headerH,
                defaultStyle,
                headerFont,
                range,
                fixedRows,
                isFrozen: true,
            });
        }

        if (!this._dragIndicator?.hasRowMove()) {
            const topRowY = vt.rowToViewY(range.topRow);
            const bottomRowBottom = vt.rowBottomToViewY(range.bottomRow);
            this.#drawSelectionLine(ctx, headerW, topRowY, bottomRowBottom - topRowY, false);
        }
    }

    #renderRowHeaderRegion(ctx, sheet, opts) {
        const { vt, rc, clipY, clipH, headerW, headerH, defaultStyle, headerFont, range, fixedRows, isFrozen } = opts;
        const scrollY = isFrozen ? 0 : vt.scrollY;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, clipY, headerW, clipH);
        ctx.clip();

        const startRow = isFrozen ? 0 : Math.max(fixedRows, rc.rowAt(scrollY));
        const dataViewH = vt.frozenRowsH > 0 ? clipH + vt.frozenRowsH : clipH;
        const endRow = isFrozen ? fixedRows : Math.min(rc.rowAt(scrollY + dataViewH) + 1, rc.rowCount);

        for (let r = startRow; r < endRow; r++) {
            const y = vt.rowToViewY(r);
            const h = rc.getRowHeight(r);
            if (h <= 0) continue;

            const isSource = this._dragIndicator?.isRowSource(r) ?? false;
            const highlighted = r >= range.topRow && r <= range.bottomRow;
            const realRow = sheet.toRealRow(r);
            const rowStyle = sheet.getRowHeaderStyle(realRow);
            const mergedStyle = this.#mergeHeaderStyle(defaultStyle, rowStyle);

            this.#drawHeaderCell(ctx, 0, y, headerW, h, isSource, highlighted, mergedStyle);

            const textFont = this.#buildNestedHeaderFont(headerFont, rowStyle);
            this.#drawHeaderText(ctx, sheet.getRowHeader(r), headerW / 2, y + h - 8, mergedStyle?.color, textFont, null, "center");

            this.#drawSeparator(ctx, 0, y + h, headerW, y + h);
            this.#drawSeparator(ctx, headerW, y, headerW, y + h);
            this.#drawSeparator(ctx, 0, y, 0, y + h);
        }

        ctx.restore();
    }

    // ─── 左上角 ──────────────────────────────────────────

    #renderCorner(ctx, vt, range) {
        const headerW = vt.headerW;
        const headerH = vt.headerH;
        const allSelected = range.topRow === 0 && range.topCol === 0;

        ctx.fillStyle = allSelected ? CONFIG.HEADER_HIGHLIGHT_BG : CONFIG.HEADER_BG;
        ctx.fillRect(0, 0, headerW, headerH);

        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.strokeRect(0, 0, headerW, headerH);
    }

    // ─── 通用工具方法 ──────────────────────────────────────

    #calcStartCol(vt, rc, fixedCols, isFrozen, clipW) {
        if (isFrozen) return 0;
        const scrollX = vt.scrollX;
        const frozenColsW = vt.frozenColsW;
        const dataOffset = frozenColsW + scrollX;
        return Math.max(fixedCols, rc.colAt(dataOffset));
    }

    #calcEndCol(vt, rc, fixedCols, isFrozen, clipW) {
        if (isFrozen) return fixedCols;
        const scrollX = vt.scrollX;
        const frozenColsW = vt.frozenColsW;
        const dataEnd = frozenColsW + scrollX + clipW;
        return Math.min(rc.colAt(dataEnd) + 1, rc.colCount);
    }

    #mergeHeaderStyle(baseStyle, customStyle) {
        if (!customStyle) return baseStyle;
        return {
            ...baseStyle,
            ...customStyle,
            color: customStyle.color || baseStyle?.color || null,
            backgroundColor: customStyle.backgroundColor || baseStyle?.backgroundColor || null,
        };
    }

    #buildHeaderFont(defaultStyle) {
        const fontStyle = defaultStyle?.fontStyle === "italic" ? "italic" : "";
        const fontWeight = defaultStyle?.fontWeight === "bold" ? "bold" : "";
        const fontSize = defaultStyle?.fontSize || CONFIG.DEFAULT_FONT_SIZE;
        const fontFamily = defaultStyle?.fontFamily || CONFIG.DEFAULT_FONT_FAMILY;
        return [fontStyle, fontWeight, `${fontSize}px`, fontFamily].filter(Boolean).join(" ");
    }

    #buildNestedHeaderFont(baseFont, style) {
        if (!style) return baseFont;
        const parts = [];
        if (style.fontStyle) parts.push(style.fontStyle);
        if (style.fontWeight) parts.push(style.fontWeight);
        if (style.fontSize) parts.push(style.fontSize);
        else parts.push(baseFont.match(/^[\d.]+px/)?.[0] || `${CONFIG.DEFAULT_FONT_SIZE}px`);
        parts.push(baseFont.match(/\s+(.+)$/)?.[1] || CONFIG.DEFAULT_FONT_FAMILY);
        return parts.join(" ");
    }

    #drawHeaderCell(ctx, x, y, w, h, isSource, highlighted, defaultStyle) {
        if (isSource) {
            ctx.fillStyle = CONFIG.MOVE_SOURCE_FILL;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else if (highlighted) {
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_BG;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
        } else if (defaultStyle?.backgroundColor) {
            ctx.fillStyle = defaultStyle.backgroundColor;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = defaultStyle.color || CONFIG.HEADER_TEXT_COLOR;
        } else {
            ctx.fillStyle = defaultStyle?.color || CONFIG.HEADER_TEXT_COLOR;
        }
    }

    #drawHeaderText(ctx, text, x, y, color, font, maxWidth, textAlign = "left") {
        ctx.font = font || `${CONFIG.DEFAULT_FONT_SIZE}px ${CONFIG.DEFAULT_FONT_FAMILY}`;
        ctx.textAlign = textAlign;
        if (color) ctx.fillStyle = color;

        if (maxWidth && ctx.measureText(text).width > maxWidth) {
            const ellipsis = "...";
            let truncated = text;
            while (truncated.length > 0 && ctx.measureText(truncated + ellipsis).width > maxWidth) {
                truncated = truncated.slice(0, -1);
            }
            ctx.fillText(truncated + ellipsis, x, y);
        } else {
            ctx.fillText(text, x, y);
        }
    }

    #drawSeparator(ctx, x1, y1, x2, y2) {
        ctx.strokeStyle = CONFIG.HEADER_BORDER_COLOR;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    #drawSelectionLine(ctx, origin, origin2, length, horizontal) {
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = CONFIG.SELECTION_LINE_WIDTH;
        ctx.beginPath();
        if (horizontal) {
            ctx.moveTo(origin, origin2);
            ctx.lineTo(origin + length, origin2);
        } else {
            ctx.moveTo(origin, origin2);
            ctx.lineTo(origin, origin2 + length);
        }
        ctx.stroke();
        ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
    }

    #drawColSelectionLines(ctx, sheet, vt, y, viewW, range, frozenColsW, fixedCols) {
        const headerW = vt.headerW;

        if (fixedCols > 0) {
            const frozenStart = range.topCol;
            const frozenEnd = Math.min(range.bottomCol, fixedCols - 1);

            if (frozenStart <= frozenEnd && frozenEnd >= 0) {
                const startX = vt.colToViewX(Math.max(frozenStart, 0));
                const endX = vt.colRightToViewX(frozenEnd);

                if (endX > startX && endX > headerW) {
                    this.#drawSelectionLine(
                        ctx,
                        Math.max(startX, headerW),
                        y,
                        Math.min(endX, headerW + frozenColsW) - Math.max(startX, headerW),
                        true,
                    );
                }
            }
        }

        if (range.bottomCol >= fixedCols) {
            const scrollStart = Math.max(range.topCol, fixedCols);
            const scrollEnd = range.bottomCol;

            const startX = vt.colToViewX(scrollStart);
            const endX = vt.colRightToViewX(scrollEnd);

            const clipLeft = headerW + frozenColsW;
            const clipRight = viewW;

            const visibleStart = Math.max(startX, clipLeft);
            const visibleEnd = Math.min(endX, clipRight);

            if (visibleEnd > visibleStart) {
                this.#drawSelectionLine(ctx, visibleStart, y, visibleEnd - visibleStart, true);
            }
        }
    }
}
