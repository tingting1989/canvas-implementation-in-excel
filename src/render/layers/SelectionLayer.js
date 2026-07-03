import { BaseLayer } from "../BaseLayer.js";
import { OverlayRenderer } from "../OverlayRenderer.js";
import { CONFIG } from "../../constants/config";
import { LAYER_Z_INDEX } from "@/constants/layerZIndex";

const INDICATOR_WIDTH = 3;
const INDICATOR_HALF = 1;

export class SelectionLayer extends BaseLayer {
    #columnMoveState = null;
    #rowMoveState = null;

    constructor() {
        super("selection", LAYER_Z_INDEX.SELECTION, { offscreen: false });

        this.overlayRenderer = new OverlayRenderer();
    }

    bindStore(store) {
        super.bindStore(store);
        this.watchForDirty("selection");
        this.watchForDirty("frozenOffset");
        this.watchForDirty("frozen");
        this.watchForDirty("scroll");
        this.watchForDirty("viewport");
    }

    setColumnMoveState(state) {
        this.#columnMoveState = state;
        this.markDirty();
    }

    setRowMoveState(state) {
        this.#rowMoveState = state;
        this.markDirty();
    }

    hasColumnMove() {
        return this.#columnMoveState !== null;
    }

    hasRowMove() {
        return this.#rowMoveState !== null;
    }

    isColumnSource(col) {
        return this.#columnMoveState !== null && this.#columnMoveState.sourceCol === col;
    }

    isRowSource(row) {
        return this.#rowMoveState !== null && this.#rowMoveState.sourceRow === row;
    }

    render(ctx, sheet, viewport, options = {}) {
        if (!this.enabled) return;

        const { viewW, viewH } = options;

        this.#renderOverlay(ctx, sheet, viewport, viewW, viewH);

        if (this.#columnMoveState) {
            this.#renderColumnMoveIndicator(ctx, sheet, viewport, viewW, viewH);
        }

        if (this.#rowMoveState) {
            this.#renderRowMoveIndicator(ctx, sheet, viewport, viewW, viewH);
        }

        this.renderCount++;
    }

    #renderOverlay(ctx, sheet, viewport, viewW, viewH) {
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
    }

    #buildHeaderFont(defaultStyle) {
        const fontSize = defaultStyle?.fontSize || 12;
        const fontFamily = defaultStyle?.fontFamily || "Segoe UI";
        return `${fontSize}px ${fontFamily}`;
    }

    #drawHeaderText(ctx, text, x, y, color, font) {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(text, x, y);
    }

    #renderColumnMoveIndicator(ctx, sheet, vt, viewW, viewH) {
        const state = this.#columnMoveState;
        if (!state) return;

        const headerW = vt.headerW;
        const headerH = vt.headerH;
        const headerFont = this.#buildHeaderFont(sheet.getDefaultStyle());

        const colScreenX = vt.colToViewX(state.sourceCol);
        const ghostLeft = state.dragX - (state.dragStartX - colScreenX);

        ctx.save();

        ctx.fillStyle = CONFIG.GHOST_FILL;
        ctx.fillRect(ghostLeft, headerH, state.colW, viewH - headerH);
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
        ctx.strokeRect(ghostLeft, headerH, state.colW, viewH - headerH);

        ctx.fillStyle = CONFIG.MOVE_SOURCE_FILL;
        ctx.fillRect(ghostLeft, 0, state.colW, headerH);
        this.#drawHeaderText(ctx, sheet.getColHeader(state.sourceCol), ghostLeft + sheet.cellPadding, headerH - 8, CONFIG.GHOST_TEXT_COLOR, headerFont);

        if (state.targetCol >= 0 && state.targetCol !== state.sourceCol) {
            const indicatorX = this.#getColumnIndicatorX(vt, state);
            ctx.fillStyle = CONFIG.SELECTION_COLOR;
            ctx.fillRect(indicatorX - INDICATOR_HALF, headerH, INDICATOR_WIDTH, viewH - headerH);
        }

        ctx.restore();
    }

    #getColumnIndicatorX(vt, state) {
        if (state.targetCol > state.sourceCol) {
            return vt.colRightToViewX(state.targetCol);
        }
        return vt.colToViewX(state.targetCol);
    }

    #renderRowMoveIndicator(ctx, sheet, vt, viewW, viewH) {
        const state = this.#rowMoveState;
        if (!state) return;

        const headerW = vt.headerW;
        const headerH = vt.headerH;
        const headerFont = this.#buildHeaderFont(sheet.getDefaultStyle());

        const rowScreenY = vt.rowToViewY(state.sourceRow);
        const ghostTop = state.dragY - (state.dragStartY - rowScreenY);

        ctx.save();

        ctx.fillStyle = CONFIG.GHOST_FILL;
        ctx.fillRect(headerW, ghostTop, viewW - headerW, state.rowH);
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = CONFIG.GRID_LINE_WIDTH;
        ctx.strokeRect(headerW, ghostTop, viewW - headerW, state.rowH);

        ctx.fillStyle = CONFIG.MOVE_SOURCE_FILL;
        ctx.fillRect(0, ghostTop, headerW, state.rowH);
        this.#drawHeaderText(ctx, String(state.sourceRow + 1), sheet.cellPadding, ghostTop + state.rowH - 8, CONFIG.GHOST_TEXT_COLOR, headerFont);

        if (state.targetRow >= 0 && state.targetRow !== state.sourceRow) {
            const indicatorY = this.#getRowIndicatorY(vt, state);
            ctx.fillStyle = CONFIG.SELECTION_COLOR;
            ctx.fillRect(headerW, indicatorY - INDICATOR_HALF, viewW - headerW, INDICATOR_WIDTH);
        }

        ctx.restore();
    }

    #getRowIndicatorY(vt, state) {
        if (state.targetRow > state.sourceRow) {
            return vt.rowBottomToViewY(state.targetRow);
        }
        return vt.rowToViewY(state.targetRow);
    }
}