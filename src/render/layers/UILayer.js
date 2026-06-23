import { BaseLayer } from "../BaseLayer.js";

export class UILayer extends BaseLayer {
    constructor() {
        super("ui", 4);

        this.debugMode = false;
    }

    bindStore(store) {
        super.bindStore(store);
        this.watch("frozenOffset", () => {});
        this.watch("editor", () => {});
    }

    render(ctx, sheet, viewport, options = {}) {
        if (!this.enabled) return;

        const headerW = sheet.getHeaderWidth();
        const headerH = sheet.getHeaderHeight();
        const frozenColsW = sheet.frozenColsWidth;
        const frozenRowsH = sheet.frozenRowsHeight;
        const viewW = options.viewW;
        const viewH = options.viewH;

        if (frozenColsW > 0 || frozenRowsH > 0) {
            this.#renderFreezeLines(ctx, headerW, headerH, frozenColsW, frozenRowsH, viewW, viewH);
        }

        if (this.debugMode) {
            this.#renderDebugInfo(ctx, sheet, viewport, options);
        }

        this.renderCount++;
    }

    #renderFreezeLines(ctx, headerW, headerH, frozenColsW, frozenRowsH, viewW, viewH) {
        ctx.save();
        ctx.strokeStyle = "#217346";
        ctx.lineWidth = 2;

        if (frozenColsW > 0) {
            const x = headerW + frozenColsW;
            ctx.beginPath();
            ctx.moveTo(x, headerH);
            ctx.lineTo(x, viewH);
            ctx.stroke();
        }

        if (frozenRowsH > 0) {
            const y = headerH + frozenRowsH;
            ctx.beginPath();
            ctx.moveTo(headerW, y);
            ctx.lineTo(viewW, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    #renderDebugInfo(ctx, sheet, viewport, options) {
        const layers = options.layers || [];

        ctx.save();
        ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
        ctx.font = "12px monospace";

        let y = 20;
        ctx.fillText(`[UILayer Debug] Total Layers: ${layers.length}`, 10, y);

        for (const layer of layers) {
            y += 16;
            const info = layer.getDebugInfo();
            const status = layer.dirty ? "DIRTY" : "CLEAN";
            ctx.fillText(`  ${info.name} (z:${info.zIndex}) ${status} renders:${layer.renderCount}`, 10, y);
        }

        ctx.restore();
    }
}
