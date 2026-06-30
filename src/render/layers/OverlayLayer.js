import { BaseLayer } from "../BaseLayer.js";
import { OverlayRenderer } from "../OverlayRenderer.js";
import { LAYER_Z_INDEX } from "@/constants/layerZIndex";

export class OverlayLayer extends BaseLayer {
    constructor() {
        super("overlays", LAYER_Z_INDEX.OVERLAY);

        this.overlayRenderer = new OverlayRenderer();
    }

    bindStore(store) {
        super.bindStore(store);
        this.watchForDirty("selection");
        this.watchForDirty("frozenOffset");
        this.watchForDirty("frozen");
        this.watchForDirty("scroll");
    }

    render(ctx, sheet, viewport, options = {}) {
        if (!this.enabled) return;

        const { viewW, viewH } = options;

        const frozenColsW = sheet.frozenColsWidth ?? 0;
        const frozenRowsH = sheet.frozenRowsHeight ?? 0;
        const headerW = typeof sheet.getHeaderWidth === "function" ? sheet.getHeaderWidth() : 0;
        const headerH = typeof sheet.getHeaderHeight === "function" ? sheet.getHeaderHeight() : 0;

        let clipped = false;
        if (frozenColsW > 0 || frozenRowsH > 0) {
            const clipX = headerW + frozenColsW;
            const clipY = headerH + frozenRowsH;
            const clipW = viewW - headerW - frozenColsW;
            const clipH = viewH - headerH - frozenRowsH;
            if (clipW > 0 && clipH > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(clipX, clipY, clipW, clipH);
                ctx.clip();
                clipped = true;
            }
        }

        this.overlayRenderer.renderMerges(ctx, sheet, viewport);
        this.overlayRenderer.renderSelection(ctx, sheet, viewport, viewW, viewH);

        if (clipped) {
            ctx.restore();
        }

        this.renderCount++;
    }
}