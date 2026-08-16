import { CONFIG } from "../constants/config.js";
import { SHEET_EVENTS } from "../constants/sheetEvents.js";
import { CellRenderContext } from "../types/CellRenderContext.js";
import { FONT_STYLE } from "../constants/enums/FontStyle.js";
import { BORDER_STYLE } from "../constants/enums/BorderStyle.js";
import { TEXT_ALIGN } from "../constants/enums/TextAlign.js";
import { VERTICAL_ALIGN } from "../constants/enums/VerticalAlign.js";
import { CONTENT_TYPE } from "../constants/enums/ContentType.js";
import { isUrl } from "../utils/UrlDetector.js";
import { TileCache } from "./TileCache.js";
import type { Sheet } from "../workbook/Sheet.js";

/**
 * 瓦片渲染器（TileRenderer）—— 负责将单元格数据绘制到瓦片上
 *
 * 核心职责：
 * 1. 计算可视区域需要哪些瓦片
 * 2. 只重绘脏（dirty）瓦片，复用未脏瓦片的缓存
 * 3. 将瓦片内容绘制到主 Canvas 上
 * 4. 管理脏标记（单个单元格/区域/全部）
 *
 * ## 绘制层次（从底到顶）
 *
 * 1. 斑马纹背景（奇偶行交替色）
 * 2. 单元格自定义背景色
 * 3. 条件样式背景色
 * 4. 数据绑定样式背景色
 * 5. 禁用单元格灰色背景
 * 6. 网格线（边框）
 * 7. 单元格文字
 * 8. 下划线装饰
 *
 * @see TileCache 瓦片缓存，管理瓦片生命周期和 LRU 淘汰
 */
export class TileRenderer {
    /** @private 私有字段 - 字体字符串缓存，避免重复 font parsing */
    #lastFont: string | null = null;

    /** @private 私有字段 - 图片元素缓存，键为 Object URL */
    #imageElementCache: Map<string, HTMLImageElement> = new Map();

    /** 瓦片缓存，用于获取/创建瓦片 */
    tileCache: TileCache;

    /** 图片异步加载完成时的回调，由 RenderEngine 设置 */
    onContentReady: (() => void) | null = null;

    /**
     * @param tileCache - 瓦片缓存实例
     */
    constructor(tileCache: TileCache) {
        this.tileCache = tileCache;
    }

    /**
     * 渲染可视区域
     *
     * 根据滚动位置计算需要显示的瓦片范围，重绘脏瓦片，
     * 然后将所有瓦片通过 drawImage 合成到主 Canvas。
     *
     * @param ctx - 主 Canvas 的 2D 上下文
     * @param sheet - 当前工作表
     * @param scrollX - 水平滚动偏移（数据坐标，像素）
     * @param scrollY - 垂直滚动偏移（数据坐标，像素）
     * @param viewW - 可视区域宽度（含行头，CSS 像素）
     * @param viewH - 可视区域高度（含列头，CSS 像素）
     */
    render(ctx: CanvasRenderingContext2D, sheet: Sheet, scrollX: number, scrollY: number, viewW: number, viewH: number): void {
        const headerW = (sheet as any).getHeaderWidth();
        const headerH = (sheet as any).getHeaderHeight();
        const cellViewW = viewW - headerW;
        const cellViewH = viewH - headerH;

        if (cellViewW <= 0 || cellViewH <= 0) return;

        const tileSize = CONFIG.TILE_SIZE;
        const startTileCol = Math.floor(scrollX / tileSize);
        const startTileRow = Math.floor(scrollY / tileSize);
        const endTileCol = Math.ceil((scrollX + cellViewW) / tileSize);
        const endTileRow = Math.ceil((scrollY + cellViewH) / tileSize);

        for (let tr = startTileRow; tr <= endTileRow; tr++) {
            for (let tc = startTileCol; tc <= endTileCol; tc++) {
                const tile = this.tileCache.getOrCreate(tr, tc);
                if (tile.dirty) {
                    this.#paintTile(tile, sheet, tr, tc);
                    tile.dirty = false;
                }
                const drawX = headerW + tc * tileSize - scrollX;
                const drawY = headerH + tr * tileSize - scrollY;
                const srcSize = CONFIG.TILE_SIZE * CONFIG.DPR;
                ctx.drawImage(tile.canvas!, 0, 0, srcSize, srcSize, drawX, drawY, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
            }
        }
    }

    /**
     * @private 私有方法 - 绘制单个瓦片
     *
     * @param tile - 目标瓦片
     * @param sheet - 当前工作表
     * @param tileRow - 瓦片行号
     * @param tileCol - 瓦片列号
     */
    #paintTile(tile: any, sheet: Sheet, tileRow: number, tileCol: number): void {
        const rc = (sheet as any).rowColManager;
        const tileSize = CONFIG.TILE_SIZE;
        const tileCtx = tile.ctx;

        tileCtx.clearRect(0, 0, tileSize, tileSize);
        this.#lastFont = null;

        const pixelY0 = tileRow * tileSize;
        const pixelX0 = tileCol * tileSize;
        const pixelY1 = pixelY0 + tileSize;
        const pixelX1 = pixelX0 + tileSize;

        const sr = rc.rowAt(pixelY0);
        const sc = rc.colAt(pixelX0);
        const er = Math.min(rc.rowAt(pixelY1) + 1, rc.rowCount);
        const ec = Math.min(rc.colAt(pixelX1) + 1, rc.colCount);

        const renderedMerges = new Set<string>();

        for (let r = sr; r < er; r++) {
            const rowY = rc.getRowY(r);
            const rowH = rc.getRowHeight(r);
            if (rowH <= 0) continue;

            const localY = rowY - pixelY0;
            if (localY + rowH <= 0 || localY >= tileSize) continue;

            for (let c = sc; c < ec; c++) {
                const colW = rc.getColWidth(c);
                if (colW <= 0) continue;

                const merge = (sheet as any).getMerge(r, c);
                const isMerged = (sheet as any).isMergedCell(r, c);

                if (isMerged) {
                    if (merge) {
                        const mergeKey = `${merge.topRow},${merge.topCol}`;
                        if (!renderedMerges.has(mergeKey)) {
                            this.#drawMergeRegion(tileCtx, sheet, merge, rc, pixelX0, pixelY0, tileSize);
                            renderedMerges.add(mergeKey);
                        }
                    }
                    continue;
                }

                const colX = rc.getColX(c);
                const localX = colX - pixelX0;

                if (localX + colW <= 0 || localX >= tileSize) continue;

                const cell = (sheet as any).cellStore.get(r, c);
                let w = colW;
                let h = rowH;
                let drawX = localX;
                let drawY = localY;

                if (merge) {
                    w = rc.getColX(merge.bottomCol) + rc.getColWidth(merge.bottomCol) - rc.getColX(merge.topCol);
                    h = rc.getRowY(merge.bottomRow) + rc.getRowHeight(merge.bottomRow) - rc.getRowY(merge.topRow);
                    drawX = rc.getColX(merge.topCol) - pixelX0;
                    drawY = rc.getRowY(merge.topRow) - pixelY0;
                    renderedMerges.add(`${merge.topRow},${merge.topCol}`);
                }

                this.#drawCellBackground(tileCtx, sheet, r, c, cell, drawX, drawY, w, h, merge);

                const hasContent = this.#drawCellContent(tileCtx, sheet, r, c, drawX, drawY, w, h);
                if (!hasContent) {
                    this.#drawCellBorder(tileCtx, sheet, r, c, merge, drawX, drawY, w, h);

                    if (merge && (drawX < 0 || drawY < 0 || drawX + w > tileSize || drawY + h > tileSize)) {
                        tileCtx.save();
                        tileCtx.beginPath();
                        tileCtx.rect(
                            Math.max(0, drawX),
                            Math.max(0, drawY),
                            Math.min(tileSize, drawX + w) - Math.max(0, drawX),
                            Math.min(tileSize, drawY + h) - Math.max(0, drawY),
                        );
                        tileCtx.clip();
                        this.#drawCellContentOrText(tileCtx, sheet, r, c, cell, drawX, drawY, w, h, merge);
                        tileCtx.restore();
                    } else {
                        this.#drawCellContentOrText(tileCtx, sheet, r, c, cell, drawX, drawY, w, h, merge);
                    }
                }
            }
        }
    }

    /**
     * @private 私有方法 - 绘制合并区域（用于合并左上角在当前瓦片之外的补全绘制）
     */
    #drawMergeRegion(ctx: CanvasRenderingContext2D, sheet: Sheet, merge: any, rc: any, pixelX0: number, pixelY0: number, tileSize: number): void {
        const { topRow, topCol, bottomRow, bottomCol } = merge;

        const mergeLeft = rc.getColX(topCol);
        const mergeTop = rc.getRowY(topRow);
        const mergeRight = rc.getColX(bottomCol) + rc.getColWidth(bottomCol);
        const mergeBottom = rc.getRowY(bottomRow) + rc.getRowHeight(bottomRow);

        const drawX = Math.max(0, mergeLeft - pixelX0);
        const drawY = Math.max(0, mergeTop - pixelY0);
        const drawW = Math.min(tileSize, mergeRight - pixelX0) - drawX;
        const drawH = Math.min(tileSize, mergeBottom - pixelY0) - drawY;

        if (drawW <= 0 || drawH <= 0) return;

        const cell = (sheet as any).cellStore.get(topRow, topCol);
        this.#drawCellBackground(ctx, sheet, topRow, topCol, cell, drawX, drawY, drawW, drawH, merge);

        const hasContent = this.#drawCellContent(ctx, sheet, topRow, topCol, drawX, drawY, drawW, drawH);
        if (!hasContent) {
            this.#drawCellBorder(ctx, sheet, topRow, topCol, merge, drawX, drawY, drawW, drawH);

            const fullDrawX = mergeLeft - pixelX0;
            const fullDrawY = mergeTop - pixelY0;
            const fullW = mergeRight - mergeLeft;
            const fullH = mergeBottom - mergeTop;

            ctx.save();
            ctx.beginPath();
            ctx.rect(drawX, drawY, drawW, drawH);
            ctx.clip();
            this.#drawCellContentOrText(ctx, sheet, topRow, topCol, cell, fullDrawX, fullDrawY, fullW, fullH, merge);
            ctx.restore();
        }
    }

    /**
     * @private 私有方法 - 绘制单元格背景
     */
    #drawCellBackground(
        ctx: CanvasRenderingContext2D,
        sheet: Sheet,
        r: number,
        c: number,
        cell: any,
        drawX: number,
        drawY: number,
        w: number,
        h: number,
        merge: any,
    ): void {
        const resolvedStyle = (sheet as any).resolveStyle(r, c);
        let bgColor = resolvedStyle.backgroundColor || (r % 2 === 0 ? CONFIG.ZEBRA_LIGHT : CONFIG.ZEBRA_DARK);

        if (cell?.disabled) {
            bgColor = CONFIG.DISABLED_BG;
        }

        ctx.fillStyle = bgColor;
        ctx.fillRect(drawX, drawY, w, h);
    }

    /**
     * @private 私有方法 - 绘制单元格边框（网格线）
     */
    #drawCellBorder(
        ctx: CanvasRenderingContext2D,
        sheet: Sheet,
        r: number,
        c: number,
        merge: any,
        drawX: number,
        drawY: number,
        w: number,
        h: number,
    ): void {
        if (merge) return;
        const style = (sheet as any).resolveStyle(r, c);
        if (style.border) {
            const { top, right, bottom, left } = this.#normalizeBorder(style.border);
            ctx.save();
            if (top) this.#drawBorderEdge(ctx, drawX, drawY, drawX + w, drawY, top);
            if (right) this.#drawBorderEdge(ctx, drawX + w, drawY, drawX + w, drawY + h, right);
            if (bottom) this.#drawBorderEdge(ctx, drawX, drawY + h, drawX + w, drawY + h, bottom);
            if (left) this.#drawBorderEdge(ctx, drawX, drawY, drawX, drawY + h, left);
            ctx.restore();
        } else {
            ctx.strokeStyle = CONFIG.GRID_COLOR;
            ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
            ctx.beginPath();
            ctx.moveTo(drawX + w - 0.5, drawY);
            ctx.lineTo(drawX + w - 0.5, drawY + h);
            ctx.moveTo(drawX, drawY + h - 0.5);
            ctx.lineTo(drawX + w, drawY + h - 0.5);
            ctx.stroke();
        }
    }

    /**
     * @private 私有方法 - 绘制单条边框线
     */
    #drawBorderEdge(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, borderDef: any): void {
        ctx.strokeStyle = borderDef.color || CONFIG.CELL_BORDER_COLOR;
        ctx.lineWidth = borderDef.width || 1;
        if (borderDef.style === BORDER_STYLE.DASHED) {
            ctx.setLineDash(CONFIG.BORDER_DASH_SOLID);
        } else if (borderDef.style === BORDER_STYLE.DOTTED) {
            ctx.setLineDash(CONFIG.BORDER_DASH_DOTTED);
        } else {
            ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(x1 + 0.5, y1 + 0.5);
        ctx.lineTo(x2 + 0.5, y2 + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /**
     * @private 私有方法 - 规范化边框定义
     */
    #normalizeBorder(border: any): any {
        if (!border) return {};
        if (border.top || border.right || border.bottom || border.left) {
            return border;
        }
        return { top: border, right: border, bottom: border, left: border };
    }

    /**
     * @private 私有方法 - 绘制单元格内容：自定义渲染器或默认文本
     */
    #drawCellContentOrText(
        ctx: CanvasRenderingContext2D,
        sheet: Sheet,
        r: number,
        col: number,
        cell: any,
        drawX: number,
        drawY: number,
        w: number,
        h: number,
        merge: any,
    ): void {
        const cellType = (sheet as any).getCellTypeInstance(r, col);
        if (cellType.hasCustomRenderer) {
            const context = this.#createRenderContext(ctx, sheet, r, col, cell, drawX, drawY, w, h, merge);
            cellType.render(context);
        } else {
            this.#drawCellText(ctx, sheet, r, col, cell, drawX, drawY, w, h, merge);
        }
    }

    /**
     * @private 私有方法 - 创建单元格渲染上下文
     */
    #createRenderContext(
        ctx: CanvasRenderingContext2D,
        sheet: Sheet,
        row: number,
        col: number,
        cell: any,
        drawX: number,
        drawY: number,
        w: number,
        h: number,
        merge: any,
    ): CellRenderContext {
        const displayValue = (sheet as any).formatCellValue(row, col, cell?.value);
        const style = (sheet as any).resolveStyle(row, col);

        return new CellRenderContext({
            ctx,
            x: drawX,
            y: drawY,
            width: w,
            height: h,
            value: cell?.value,
            displayValue,
            style,
            sheet,
            row,
            col,
            isSelected: (sheet as any).selection?.contains(row, col) ?? false,
            isDisabled: cell?.disabled === true,
            isMerged: !!merge,
            mergeInfo: merge,
        });
    }

    /**
     * @private 私有方法 - 绘制单元格文字（编排方法）
     */
    #drawCellText(
        ctx: CanvasRenderingContext2D,
        sheet: Sheet,
        r: number,
        c: number,
        cell: any,
        drawX: number,
        drawY: number,
        w: number,
        h: number,
        merge: any,
    ): void {
        if (cell?.value === undefined) return;

        const finalStyle = (sheet as any).resolveStyle(r, c);
        const fontSize = finalStyle.fontSize || 12;
        const textAlign = finalStyle.textAlign || TEXT_ALIGN.LEFT;
        const verticalAlign = finalStyle.verticalAlign || VERTICAL_ALIGN.MIDDLE;

        this.#applyFont(ctx, finalStyle);

        const displayValue = (sheet as any).formatCellValue(r, c, cell.value);
        const urlValue = isUrl(displayValue) ? displayValue : null;

        this.#applyTextStyle(ctx, finalStyle, cell, urlValue);

        const { textX, textY, effectiveW } = this.#calcTextPosition(ctx, sheet, drawX, drawY, w, h, fontSize, textAlign, verticalAlign, merge);

        const renderedText = this.#truncateText(ctx, displayValue, effectiveW, (sheet as any).cellPadding, (sheet as any).textOverflowEllipsis);

        if (renderedText !== displayValue) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(drawX, drawY, w, h);
            ctx.clip();
            ctx.fillText(renderedText, textX, textY);
            ctx.restore();
        } else {
            ctx.fillText(renderedText, textX, textY);
        }

        if (finalStyle.textDecoration === FONT_STYLE.UNDERLINE) {
            this.#drawUnderline(ctx, renderedText, textX, textY, fontSize, textAlign, ctx.fillStyle as string, CONFIG.GRID_LINE_WIDTH, 0);
        }

        if (urlValue) {
            this.#drawUnderline(
                ctx,
                renderedText,
                textX,
                textY,
                fontSize,
                textAlign,
                CONFIG.AUTO_LINK_COLOR,
                CONFIG.AUTO_LINK_UNDERLINE_WIDTH,
                CONFIG.AUTO_LINK_UNDERLINE_OFFSET,
            );
        }
    }

    /**
     * @private 私有方法 - 构建字体字符串并应用到 ctx
     */
    #applyFont(ctx: CanvasRenderingContext2D, style: any): void {
        const fontStyle = style.fontStyle === FONT_STYLE.ITALIC ? FONT_STYLE.ITALIC : "";
        const fontWeight = style.fontWeight || "normal";
        const fontSize = style.fontSize || 12;
        const fontFamily = style.fontFamily || "Segoe UI";
        const fontString = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`.trim().replace(/\s+/g, " ");
        if (this.#lastFont !== fontString) {
            ctx.font = fontString;
            this.#lastFont = fontString;
        }
    }

    /**
     * @private 私有方法 - 应用文本样式
     */
    #applyTextStyle(ctx: CanvasRenderingContext2D, style: any, cell: any, urlValue: string | null): void {
        const verticalAlign = style.verticalAlign || VERTICAL_ALIGN.MIDDLE;
        const baselineMap: Record<string, CanvasTextBaseline> = {
            [VERTICAL_ALIGN.TOP]: "top",
            [VERTICAL_ALIGN.MIDDLE]: "middle",
            [VERTICAL_ALIGN.BOTTOM]: "bottom",
        };
        ctx.textBaseline = baselineMap[verticalAlign] || "middle";
        ctx.fillStyle = urlValue ? CONFIG.AUTO_LINK_COLOR : cell.disabled ? CONFIG.DISABLED_COLOR : style.color || CONFIG.CELL_TEXT_COLOR;
        ctx.textAlign = style.textAlign || TEXT_ALIGN.LEFT;
    }

    /**
     * @private 私有方法 - 计算文本绘制坐标
     */
    #calcTextPosition(
        ctx: CanvasRenderingContext2D,
        sheet: Sheet,
        drawX: number,
        drawY: number,
        w: number,
        h: number,
        fontSize: number,
        textAlign: string,
        verticalAlign: string,
        merge: any,
    ): { textX: number; textY: number; effectiveW: number } {
        const rc = (sheet as any).rowColManager;
        let textX = Math.round(drawX + (sheet as any).cellPadding);
        let effectiveW = w;

        if (merge && (textAlign === TEXT_ALIGN.CENTER || textAlign === TEXT_ALIGN.RIGHT)) {
            const mergeStartX = rc.getColX(merge.topCol);
            const mergeEndX = rc.getColX(merge.bottomCol) + rc.getColWidth(merge.bottomCol);
            effectiveW = mergeEndX - mergeStartX;

            if (textAlign === TEXT_ALIGN.CENTER) {
                textX = Math.round(mergeStartX + effectiveW / 2);
            } else if (textAlign === TEXT_ALIGN.RIGHT) {
                textX = Math.round(mergeEndX - (sheet as any).cellPadding);
            }
        } else if (textAlign === TEXT_ALIGN.CENTER) {
            textX = Math.round(drawX + w / 2);
        } else if (textAlign === TEXT_ALIGN.RIGHT) {
            textX = Math.round(drawX + w - (sheet as any).cellPadding);
        }

        let textY: number;
        if (verticalAlign === VERTICAL_ALIGN.TOP) {
            textY = Math.round(drawY + fontSize / 2 + 2);
        } else if (verticalAlign === VERTICAL_ALIGN.BOTTOM) {
            textY = Math.round(drawY + h - fontSize / 2 - 2);
        } else {
            textY = Math.round(drawY + h / 2);
        }

        return { textX, textY, effectiveW };
    }

    /**
     * @private 私有方法 - 文本截断（二分查找）
     */
    #truncateText(ctx: CanvasRenderingContext2D, text: string, effectiveW: number, cellPadding: number, textOverflowEllipsis: boolean): string {
        const maxTextWidth = effectiveW - cellPadding * 2;
        if (maxTextWidth <= 0) return text;

        const fullWidth = ctx.measureText(text).width;
        if (fullWidth <= maxTextWidth) return text;

        const suffix = textOverflowEllipsis ? "..." : "";
        let lo = 0;
        let hi = text.length;
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (ctx.measureText(text.slice(0, mid) + suffix).width > maxTextWidth) {
                hi = mid - 1;
            } else {
                lo = mid;
            }
        }
        return text.slice(0, lo) + suffix;
    }

    /**
     * @private 私有方法 - 绘制下划线
     */
    #drawUnderline(
        ctx: CanvasRenderingContext2D,
        renderedText: string,
        textX: number,
        textY: number,
        fontSize: number,
        textAlign: string,
        color: string,
        lineWidth: number,
        offsetY: number,
    ): void {
        const textWidth = ctx.measureText(renderedText).width;
        let lineX = textX;
        if (textAlign === TEXT_ALIGN.CENTER) {
            lineX = textX - textWidth / 2;
        } else if (textAlign === TEXT_ALIGN.RIGHT) {
            lineX = textX - textWidth;
        }
        const lineY = textY + Math.round(fontSize * 0.6) + offsetY;
        ctx.beginPath();
        ctx.moveTo(lineX, lineY);
        ctx.lineTo(lineX + textWidth, lineY);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }

    /**
     * @private 私有方法 - 绘制单元格富内容（图片等）
     */
    #drawCellContent(
        ctx: CanvasRenderingContext2D,
        sheet: Sheet,
        row: number,
        col: number,
        drawX: number,
        drawY: number,
        w: number,
        h: number,
    ): boolean {
        const clipboard = (sheet as any).bus.emit(SHEET_EVENTS.GET_CLIPBOARD, undefined, { source: "TileRenderer" });
        if (!clipboard) return false;

        const content = clipboard.getCellContent(sheet, row, col);
        if (!content) return false;

        if (content.type === CONTENT_TYPE.IMAGE) {
            return this.#drawCellImage(ctx, content.objectUrl, drawX, drawY, w, h);
        }

        return false;
    }

    /**
     * @private 私有方法 - 绘制图片到单元格区域
     */
    #drawCellImage(ctx: CanvasRenderingContext2D, imageUrl: string, drawX: number, drawY: number, w: number, h: number): boolean {
        const img = this.#getOrLoadImage(imageUrl);
        if (!img || !img.complete) {
            return true;
        }

        const cellRatio = w / h;
        const imgRatio = img.naturalWidth / img.naturalHeight;
        let drawW: number, drawH: number, offsetX: number, offsetY: number;

        if (imgRatio > cellRatio) {
            drawW = w;
            drawH = w / imgRatio;
            offsetX = 0;
            offsetY = (h - drawH) / 2;
        } else {
            drawH = h;
            drawW = h * imgRatio;
            offsetX = (w - drawW) / 2;
            offsetY = 0;
        }

        ctx.drawImage(img, drawX + offsetX, drawY + offsetY, drawW, drawH);
        return true;
    }

    /**
     * @private 私有方法 - 获取或加载图片元素
     */
    #getOrLoadImage(url: string): HTMLImageElement | null {
        if (this.#imageElementCache.has(url)) {
            return this.#imageElementCache.get(url)!;
        }
        const img = new Image();

        img.onload = () => {
            this.tileCache.markAllDirty();
            if (this.onContentReady) {
                this.onContentReady();
            }
        };
        img.onerror = () => {
            this.#imageElementCache.delete(url);
        };

        img.src = url;
        this.#imageElementCache.set(url, img);

        if (img.complete) {
            this.tileCache.markAllDirty();
            if (this.onContentReady) {
                this.onContentReady();
            }
        }

        return img;
    }

    /**
     * 将指定单元格覆盖的所有瓦片标记为脏
     *
     * @param row - 单元格行号
     * @param col - 单元格列号
     * @param rc - 行列管理器
     */
    invalidateCell(row: number, col: number, rc: any): void {
        if (!rc) return;

        const tileSize = CONFIG.TILE_SIZE;
        const rowY = rc.getRowY(row);
        const rowH = rc.getRowHeight(row);
        const colX = rc.getColX(col);
        const colW = rc.getColWidth(col);

        if (rowH <= 0 || colW <= 0) return;

        const startTileRow = Math.floor(rowY / tileSize);
        const endTileRow = Math.floor((rowY + rowH) / tileSize);
        const startTileCol = Math.floor(colX / tileSize);
        const endTileCol = Math.floor((colX + colW) / tileSize);

        for (let tr = startTileRow; tr <= endTileRow; tr++) {
            for (let tc = startTileCol; tc <= endTileCol; tc++) {
                this.tileCache.markDirty(tr, tc);
            }
        }
    }

    /** 将所有瓦片标记为脏（用于全量重绘场景） */
    invalidateAll(): void {
        this.tileCache.markAllDirty();
    }

    /** 销毁渲染器，清空瓦片缓存和图片元素缓存 */
    destroy(): void {
        this.tileCache.clear();
        this.#imageElementCache.clear();
    }
}
