import { BaseLayer } from "../BaseLayer.js";
import { OverlayRenderer } from "../OverlayRenderer.js";

export class OverlayLayer extends BaseLayer {
    constructor() {
        super("overlays", 2);

        this.overlayRenderer = new OverlayRenderer();
    }

    bindStore(store) {
        super.bindStore(store);
        this.watch("selection", () => {});
        this.watch("frozenOffset", () => {});
    }

    render(ctx, sheet, viewport, options = {}) {
        if (!this.enabled) return;

        const { viewW, viewH } = options;

        this.overlayRenderer.renderMerges(ctx, sheet, viewport);
        this.overlayRenderer.renderSelection(ctx, sheet, viewport, viewW, viewH);

        this.renderCount++;
    }
}
