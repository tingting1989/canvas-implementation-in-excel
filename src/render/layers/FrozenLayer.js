import { BaseLayer } from "../BaseLayer.js";
import { TileRenderer } from "../TileRenderer.js";
import { TileCache } from "../TileCache.js";
import { OverlayRenderer } from "../OverlayRenderer.js";

export class FrozenLayer extends BaseLayer {
    constructor() {
        super("frozen", 2.5);

        this.tileRenderer = new TileRenderer(new TileCache());
        this.overlayRenderer = new OverlayRenderer();

        this._cachedFrozenColsW = -1;
        this._cachedFrozenRowsH = -1;
    }

    markCellDirty(row, col, rc) {
        this.tileRenderer.invalidateCell(row, col, rc);
        this.markDirty();
    }

    bindStore(store) {
        super.bindStore(store);
        this.watch("frozen", () => {});
        this.watch("frozenOffset", () => {});
        this.watch("scroll", () => {});
        this.watch("selection", () => {});
    }

    #checkFrozenStateChange(sheet) {
        const currentColsW = sheet.frozenColsWidth;
        const currentRowsH = sheet.frozenRowsHeight;

        if (currentColsW !== this._cachedFrozenColsW || currentRowsH !== this._cachedFrozenRowsH) {
            this._cachedFrozenColsW = currentColsW;
            this._cachedFrozenRowsH = currentRowsH;
            return true;
        }
        return false;
    }

    render(ctx, sheet, viewport, options = {}) {
        if (!this.enabled) return;

        const frozenColsW = sheet.frozenColsWidth;
        const frozenRowsH = sheet.frozenRowsHeight;

        if (frozenColsW === 0 && frozenRowsH === 0) {
            return;
        }

        if (this.#checkFrozenStateChange(sheet)) {
            this.markDirty();
        }

        const headerW = sheet.getHeaderWidth();
        const headerH = sheet.getHeaderHeight();
        const viewW = options.viewW;
        const viewH = options.viewH;
        const scrollX = options.scrollX ?? viewport.scrollX;
        const scrollY = options.scrollY ?? viewport.scrollY;
        const isPaginationActive = options.isPaginationActive ?? false;
        const tileOptions = isPaginationActive ? { useRealRows: true } : undefined;

        if (frozenColsW > 0) {
            this.#renderClippedRegion(
                ctx,
                sheet,
                headerW,
                headerH,
                frozenColsW,
                viewH - headerH,
                0,
                scrollY,
                frozenColsW + headerW,
                viewH,
                viewport,
                tileOptions,
            );
        }

        if (frozenRowsH > 0) {
            this.#renderClippedRegion(
                ctx,
                sheet,
                headerW,
                headerH,
                viewW - headerW,
                frozenRowsH,
                scrollX,
                0,
                viewW,
                frozenRowsH + headerH,
                viewport,
                tileOptions,
            );
        }

        if (frozenRowsH > 0 && frozenColsW > 0) {
            this.#renderClippedRegion(
                ctx,
                sheet,
                headerW,
                headerH,
                frozenColsW,
                frozenRowsH,
                0,
                0,
                frozenColsW + headerW,
                frozenRowsH + headerH,
                viewport,
                tileOptions,
            );
        }

        this.renderCount++;
    }

    #renderClippedRegion(ctx, sheet, clipX, clipY, clipW, clipH, scrollX, scrollY, viewW, viewH, viewport, tileOptions) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(clipX, clipY, clipW, clipH);
        ctx.clip();

        this.tileRenderer.render(ctx, sheet, scrollX, scrollY, viewW, viewH, tileOptions);
        this.overlayRenderer.renderMerges(ctx, sheet, viewport);
        this.overlayRenderer.renderSelection(ctx, sheet, viewport, viewW, viewH);

        ctx.restore();
    }
}