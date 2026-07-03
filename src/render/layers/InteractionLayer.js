import { BaseLayer } from "../BaseLayer.js";
import { CONFIG } from "../../constants/config";
import { UI_CONFIG } from "../../constants/uiConfig";
import { HIT_TYPE } from "../../constants/hitType";
import { LAYER_Z_INDEX } from "@/constants/layerZIndex";

export class InteractionLayer extends BaseLayer {
    #resizeLine = null;

    constructor() {
        super("interaction", LAYER_Z_INDEX.INTERACTION, { offscreen: false });

        this.debugMode = false;
    }

    bindStore(store) {
        super.bindStore(store);
        this.watchForDirty("scroll");
        this.watchForDirty("frozenOffset");
        this.watchForDirty("frozen");
        this.watchForDirty("editor");
        this.watchForDirty("selection");
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
        if (!this.enabled) return;

        const { viewW, viewH } = options;

        this.#renderFreezeLines(ctx, sheet, viewW, viewH);

        this.#renderResizeLine(ctx, viewW, viewH);

        this.#renderEditor(ctx, sheet, viewport);

        if (this.debugMode) {
            this.#renderDebugInfo(ctx, options);
        }

        this.renderCount++;
    }

    #renderFreezeLines(ctx, sheet, viewW, viewH) {
        const frozenColsW = sheet.frozenColsWidth ?? 0;
        const frozenRowsH = sheet.frozenRowsHeight ?? 0;

        if (frozenColsW === 0 && frozenRowsH === 0) return;

        const headerW = typeof sheet.getHeaderWidth === "function" ? sheet.getHeaderWidth() : 0;
        const headerH = typeof sheet.getHeaderHeight === "function" ? sheet.getHeaderHeight() : 0;

        ctx.save();
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = CONFIG.SELECTION_LINE_WIDTH;

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

    #renderResizeLine(ctx, viewW, viewH) {
        if (!this.#resizeLine) return;

        ctx.save();
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = CONFIG.SELECTION_LINE_WIDTH;
        ctx.setLineDash(CONFIG.UI_DASH_PATTERN);

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
    }

    #renderEditor(ctx, sheet, viewport) {
        const store = this.getStore();
        if (!store) return;

        const editorVisible = store.state.editor.visible;
        if (!editorVisible) return;

        const row = store.state.editor.row;
        const col = store.state.editor.col;
        if (row < 0 || col < 0) return;

        const merge = sheet.getMerge(row, col);
        let rect;
        if (merge) {
            rect = viewport.mergeToViewRect(merge);
        } else {
            rect = viewport.cellToViewRect(row, col);
        }

        ctx.save();
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = CONFIG.SELECTION_LINE_WIDTH;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

        ctx.fillStyle = CONFIG.INTERACTION_HOVER_FILL;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
    }

    #renderDebugInfo(ctx, options) {
        const layers = options.layers || [];

        ctx.save();
        ctx.fillStyle = CONFIG.ERROR_HIGHLIGHT_FILL;
        ctx.font = `${CONFIG.DEFAULT_FONT_SIZE}px ${CONFIG.MONO_FONT_FAMILY}`;

        let y = UI_CONFIG.DEBUG_START_Y;
        ctx.fillText(`[Debug] Total Layers: ${layers.length}`, 10, y);

        for (const layer of layers) {
            y += UI_CONFIG.DEBUG_LINE_HEIGHT;
            const info = layer.getDebugInfo();
            const status = layer.dirty ? "DIRTY" : "CLEAN";
            ctx.fillText(`  ${info.name} (z:${info.zIndex}) ${status} renders:${layer.renderCount}`, 10, y);
        }

        ctx.restore();
    }
}