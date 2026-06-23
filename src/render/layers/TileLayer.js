import { BaseLayer } from "../BaseLayer.js";
import { TileRenderer } from "../TileRenderer.js";
import { TileCache } from "../TileCache.js";

export class TileLayer extends BaseLayer {
    constructor(tileCache = null) {
        super("tiles", 1);

        this.tileRenderer = new TileRenderer(tileCache || new TileCache());
        this.onContentReady = null;

        this.tileRenderer.onContentReady = () => {
            if (this.onContentReady) {
                this.onContentReady();
            }
            this.markDirty();
        };
    }

    bindStore(store) {
        super.bindStore(store);
        this.watch("scroll", () => {});
        this.watch("viewport", () => {});
        this.watch("tile", () => {});
    }

    render(ctx, sheet, viewport, options = {}) {
        if (!this.enabled) return;

        const scrollX = options.scrollX ?? viewport.scrollX;
        const scrollY = options.scrollY ?? viewport.scrollY;
        const viewW = options.viewW;
        const viewH = options.viewH;
        const useRealRows = options.useRealRows;

        this.tileRenderer.render(ctx, sheet, scrollX, scrollY, viewW, viewH, useRealRows ? { useRealRows: true } : undefined);

        this.renderCount++;
    }

    markCellDirty(row, col, rc) {
        this.tileRenderer.invalidateCell(row, col, rc);
        this.markDirty();
    }

    markAllDirty() {
        this.tileRenderer.invalidateAll();
        this.markDirty();
    }
}
