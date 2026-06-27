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
    }

    render(ctx, sheet, viewport, options = {}) {
        if (!this.enabled) return;

        const { viewW, viewH } = options;

        this.overlayRenderer.renderMerges(ctx, sheet, viewport);
        this.overlayRenderer.renderSelection(ctx, sheet, viewport, viewW, viewH);

        this.renderCount++;
    }
}
