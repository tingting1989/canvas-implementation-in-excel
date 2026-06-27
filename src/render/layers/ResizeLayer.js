import { BaseLayer } from "../BaseLayer.js";
import { CONFIG } from "../../constants/config";
import { HIT_TYPE } from "../../constants/hitType";
import { LAYER_Z_INDEX } from "@/constants/layerZIndex";

export class ResizeLayer extends BaseLayer {
    #resizeLine = null;

    constructor() {
        super("resize", LAYER_Z_INDEX.RESIZE);
    }

    bindStore(store) {
        super.bindStore(store);
        this.watchForDirty("scroll");
        this.watchForDirty("frozenOffset");
    }

    setResizeLine(type, index, position) {
        this.#resizeLine = type ? { type, index, position } : null;
        this.markDirty();
    }

    clearResizeLine() {
        this.#resizeLine = null;
        this.markDirty();
    }

    getResizeLine() {
        return this.#resizeLine;
    }

    render(ctx, sheet, viewport, options = {}) {
        if (!this.enabled || !this.#resizeLine) return;

        const { viewW, viewH } = options;

        ctx.save();
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);

        if (this.#resizeLine.type === HIT_TYPE.COL_RESIZE) {
            const x = this.#resizeLine.position;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, viewH);
            ctx.stroke();
        } else if (this.#resizeLine.type === HIT_TYPE.ROW_RESIZE) {
            const y = this.#resizeLine.position;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(viewW, y);
            ctx.stroke();
        }

        ctx.restore();
        this.renderCount++;
    }
}
