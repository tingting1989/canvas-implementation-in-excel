import { BaseLayer } from "../BaseLayer.js";
import { HeaderRenderer } from "../HeaderRenderer.js";

export class HeaderLayer extends BaseLayer {
    constructor() {
        super("headers", 3);

        this.headerRenderer = new HeaderRenderer();
    }

    bindStore(store) {
        super.bindStore(store);
        this.watch("scroll", () => {});
        this.watch("frozen", () => {});
        this.watch("viewport", () => {});
        this.watch("selection", () => {});
    }

    render(ctx, sheet, viewport, options = {}) {
        if (!this.enabled) return;

        const { viewW, viewH } = options;

        this.headerRenderer.render(ctx, sheet, viewport, viewW, viewH);

        this.renderCount++;
    }
}