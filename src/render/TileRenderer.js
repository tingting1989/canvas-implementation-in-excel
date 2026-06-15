import { stylePool } from "../styles/index.js";
import { CONFIG } from "../constants/config";

export class TileRenderer {
    constructor(tileCache) {
        this.tileCache = tileCache;
    }

    render(ctx, sheet, scrollX, scrollY, viewW, viewH) {
        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;
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
                tile.touch();

                const drawX = headerW + tc * tileSize - scrollX;
                const drawY = headerH + tr * tileSize - scrollY;

                ctx.drawImage(tile.canvas, 0, 0, tile.canvas.width, tile.canvas.height, drawX, drawY, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
            }
        }
    }

    #paintTile(tile, sheet, tileRow, tileCol) {
        const rc = sheet.rowColManager;
        const tileSize = CONFIG.TILE_SIZE;
        const tileCtx = tile.ctx;

        tileCtx.clearRect(0, 0, tileSize, tileSize);

        const pixelY0 = tileRow * tileSize;
        const pixelX0 = tileCol * tileSize;
        const pixelY1 = pixelY0 + tileSize;
        const pixelX1 = pixelX0 + tileSize;

        const sr = rc.rowAt(pixelY0);
        const sc = rc.colAt(pixelX0);
        const er = rc.rowAt(pixelY1) + 1;
        const ec = rc.colAt(pixelX1) + 1;

        for (let r = sr; r < er; r++) {
            const rowY = rc.getRowY(r);
            const rowH = rc.getRowHeight(r);
            const localY = rowY - pixelY0;

            if (localY + rowH <= 0 || localY >= tileSize) continue;

            const realR = sheet.toRealRow(r);

            for (let c = sc; c < ec; c++) {
                const colW = rc.getColWidth(c);
                if (colW <= 0) continue;

                if (sheet.isMergedCell(realR, c)) continue;

                const colX = rc.getColX(c);
                const localX = colX - pixelX0;

                if (localX + colW <= 0 || localX >= tileSize) continue;

                const cell = sheet.cellStore.get(realR, c);
                const merge = sheet.getMerge(r, c);
                let w = colW;
                let h = rowH;
                let drawX = localX;
                let drawY = localY;

                if (merge) {
                    w = rc.getColX(merge.bottomCol) + rc.getColWidth(merge.bottomCol) - rc.getColX(merge.topCol);
                    h = rc.getRowY(merge.bottomRow) + rc.getRowHeight(merge.bottomRow) - rc.getRowY(merge.topRow);
                    drawX = rc.getColX(merge.topCol) - pixelX0;
                    drawY = rc.getRowY(merge.topRow) - pixelY0;
                }

                this.#drawCellBackground(tileCtx, sheet, realR, c, cell, drawX, drawY, w, h);
                this.#drawCellBorder(tileCtx, merge, drawX, drawY, w, h);
                this.#drawCellText(tileCtx, sheet, realR, c, cell, drawX, drawY, w, h);
            }
        }
    }

    #drawCellBackground(ctx, sheet, r, c, cell, drawX, drawY, w, h) {
        let bgColor = r % 2 === 0 ? CONFIG.ZEBRA_LIGHT : CONFIG.ZEBRA_DARK;
        ctx.fillStyle = bgColor;
        ctx.fillRect(drawX, drawY, w, h);

        const cfStyleId = sheet.matchConditionalStyle(r, c, cell);
        if (cfStyleId !== null) {
            const cfStyle = stylePool.getStyle(cfStyleId);
            if (cfStyle.backgroundColor) {
                ctx.fillStyle = cfStyle.backgroundColor;
                ctx.fillRect(drawX, drawY, w, h);
            }
        }

        const dbStyleId = sheet.getDataBindStyle(r, c);
        if (dbStyleId !== null) {
            const dbStyle = stylePool.getStyle(dbStyleId);
            if (dbStyle.backgroundColor) {
                ctx.fillStyle = dbStyle.backgroundColor;
                ctx.fillRect(drawX, drawY, w, h);
            }
        }

        if (cell?.disabled) {
            ctx.fillStyle = CONFIG.DISABLED_BG;
            ctx.fillRect(drawX, drawY, w, h);
        }
    }

    #drawCellBorder(ctx, merge, drawX, drawY, w, h) {
        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.lineWidth = 1;
        if (!merge) {
            ctx.strokeRect(drawX + 0.5, drawY + 0.5, w - 1, h - 1);
        }
    }

    #drawCellText(ctx, sheet, r, c, cell, drawX, drawY, w, h) {
        if (cell?.value === undefined) return;

        const finalStyle = sheet.resolveStyle(r, c);
        ctx.fillStyle = cell.disabled ? CONFIG.DISABLED_COLOR : finalStyle.color || "#222";

        /**
         * 构建字体字符串
         * 格式：[fontStyle] [fontWeight] [fontSize]px [fontFamily]
         * fontStyle: italic / normal
         * fontWeight: bold / normal
         */
        const fontStyle = finalStyle.fontStyle === "italic" ? "italic" : "";
        const fontWeight = finalStyle.fontWeight || "normal";
        const fontSize = finalStyle.fontSize || 12;
        const fontFamily = finalStyle.fontFamily || "Segoe UI";
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`.trim();

        const textAlign = finalStyle.textAlign || "left";
        ctx.textAlign = textAlign;

        let textX = drawX + 4;
        if (textAlign === "center") {
            textX = drawX + w / 2;
        } else if (textAlign === "right") {
            textX = drawX + w - 4;
        }

        ctx.fillText(String(cell.value), textX, drawY + h / 2 + 4);

        /**
         * 绘制下划线
         * textDecoration: underline 时在文字下方绘制一条线
         */
        if (finalStyle.textDecoration === "underline") {
            const text = String(cell.value);
            const textWidth = ctx.measureText(text).width;
            let lineX = textX;
            if (textAlign === "center") {
                lineX = textX - textWidth / 2;
            } else if (textAlign === "right") {
                lineX = textX - textWidth;
            }
            const lineY = drawY + h / 2 + 6;
            ctx.beginPath();
            ctx.moveTo(lineX, lineY);
            ctx.lineTo(lineX + textWidth, lineY);
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    invalidateCell(row, col, rc) {
        if (!rc) return;
        const tileSize = CONFIG.TILE_SIZE;
        const tileRow = Math.floor(rc.getRowY(row) / tileSize);
        const tileCol = Math.floor(rc.getColX(col) / tileSize);
        this.tileCache.markDirty(tileRow, tileCol);
    }

    invalidateAll() {
        this.tileCache.markAllDirty();
    }

    destroy() {
        this.tileCache.clear();
    }
}
