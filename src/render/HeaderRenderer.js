import {CONFIG} from "../constants/config";
import {HIT_TYPE} from "../constants/hitType";

export class HeaderRenderer {
    #resizeLine = null;
    #columnMoveState = null;

    setResizeLine(type, index, position) {
        this.#resizeLine = type ? { type, index, position } : null;
    }

    setColumnMoveState(state) {
        this.#columnMoveState = state;
    }

    render(ctx, sheet, scrollX, scrollY, viewW, viewH) {
        const range = sheet.selection.getRange();

        this.#renderColumnHeaders(ctx, sheet, scrollX, viewW, range);
        this.#renderRowHeaders(ctx, sheet, scrollY, viewH, range);
        this.#renderCorner(ctx, range);
        this.#renderResizeLine(ctx, viewW, viewH);
        this.#renderColumnMoveIndicator(ctx, sheet, scrollX, viewW, viewH);
    }

    #renderColumnHeaders(ctx, sheet, scrollX, viewW, range) {
        const rc = sheet.rowColManager;
        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;

        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(headerW, 0, viewW - headerW, headerH);

        const sc = rc.colAt(scrollX);
        const ec = rc.colAt(scrollX + viewW - headerW) + 1;
        for (let c = sc; c < ec; c++) {
            const x = headerW + rc.getColX(c) - scrollX;
            const w = rc.getColWidth(c);
            const realC = sheet.toRealCol(c);
            const highlighted = realC >= range.topCol && realC <= range.bottomCol;

            if (this.#columnMoveState && realC === this.#columnMoveState.sourceCol) {
                ctx.fillStyle = "rgba(76, 139, 245, 0.3)";
                ctx.fillRect(x, 0, w, headerH);
                ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
            } else if (highlighted) {
                ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_BG;
                ctx.fillRect(x, 0, w, headerH);
                ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
            } else {
                ctx.fillStyle = "#555";
            }

            ctx.font = "12px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(sheet.getColHeader(realC), x + 4, headerH - 8);

            ctx.strokeStyle = CONFIG.GRID_COLOR;
            ctx.beginPath();
            ctx.moveTo(x + w, 0);
            ctx.lineTo(x + w, headerH);
            ctx.stroke();
        }

        if (!this.#columnMoveState) {
            ctx.strokeStyle = CONFIG.SELECTION_COLOR;
            ctx.lineWidth = 2;
            const visTopCol = sheet.toVisibleCol(range.topCol);
            const visBottomCol = sheet.toVisibleCol(range.bottomCol);
            if (visTopCol >= 0 && visBottomCol >= 0) {
                const selX = headerW + rc.getColX(visTopCol) - scrollX;
                const selW = rc.getColX(visBottomCol) + rc.getColWidth(visBottomCol) - rc.getColX(visTopCol);
                ctx.beginPath();
                ctx.moveTo(selX, headerH);
                ctx.lineTo(selX + selW, headerH);
                ctx.stroke();
            }
            ctx.lineWidth = 1;
        }
    }

    #renderRowHeaders(ctx, sheet, scrollY, viewH, range) {
        const rc = sheet.rowColManager;
        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;

        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(0, headerH, headerW, viewH - headerH);

        const sr = rc.rowAt(scrollY);
        const er = rc.rowAt(scrollY + viewH - headerH) + 1;
        for (let r = sr; r < er; r++) {
            const y = headerH + rc.getRowY(r) - scrollY;
            const h = rc.getRowHeight(r);
            const highlighted = r >= range.topRow && r <= range.bottomRow;

            if (highlighted) {
                ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_BG;
                ctx.fillRect(0, y, headerW, h);
                ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_COLOR;
            } else {
                ctx.fillStyle = "#555";
            }

            ctx.font = "12px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(sheet.getRowHeader(sheet.toRealRow(r)), 6, y + h / 2 + 4);

            ctx.strokeStyle = CONFIG.GRID_COLOR;
            ctx.beginPath();
            ctx.moveTo(0, y + h);
            ctx.lineTo(headerW, y + h);
            ctx.stroke();
        }

        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = 2;
        const selY = headerH + rc.getRowY(range.topRow) - scrollY;
        const selH = rc.getRowY(range.bottomRow) + rc.getRowHeight(range.bottomRow) - rc.getRowY(range.topRow);
        ctx.beginPath();
        ctx.moveTo(headerW, selY);
        ctx.lineTo(headerW, selY + selH);
        ctx.stroke();
        ctx.lineWidth = 1;
    }

    #renderCorner(ctx, range) {
        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;
        const allSelected = range.topRow === 0 && range.topCol === 0;

        if (allSelected) {
            ctx.fillStyle = CONFIG.HEADER_HIGHLIGHT_BG;
            ctx.fillRect(0, 0, headerW, headerH);
        } else {
            ctx.fillStyle = CONFIG.HEADER_BG;
            ctx.fillRect(0, 0, headerW, headerH);
        }

        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.strokeRect(0, 0, headerW, headerH);
    }

    #renderColumnMoveIndicator(ctx, sheet, scrollX, viewW, viewH) {
        const state = this.#columnMoveState;
        if (!state) return;

        const rc = sheet.rowColManager;
        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;

        const colScreenX = headerW + state.colX - state.scrollX;
        const ghostLeft = state.dragX - (state.dragStartX - colScreenX);

        ctx.save();
        ctx.fillStyle = "rgba(76, 139, 245, 0.15)";
        ctx.fillRect(ghostLeft, headerH, state.colW, viewH - headerH);

        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = 1;
        ctx.strokeRect(ghostLeft, headerH, state.colW, viewH - headerH);

        ctx.fillStyle = "rgba(76, 139, 245, 0.3)";
        ctx.fillRect(ghostLeft, 0, state.colW, headerH);
        ctx.fillStyle = "#fff";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(sheet.getColHeader(state.sourceCol), ghostLeft + 4, headerH - 8);

        const targetCol = state.targetCol;
        if (targetCol >= 0 && targetCol !== state.sourceCol) {
            const visTargetCol = sheet.toVisibleCol(targetCol);
            let indicatorX;
            if (visTargetCol >= 0) {
                if (targetCol > state.sourceCol) {
                    indicatorX = headerW + rc.getColX(visTargetCol) + rc.getColWidth(visTargetCol) - scrollX;
                } else {
                    indicatorX = headerW + rc.getColX(visTargetCol) - scrollX;
                }

                ctx.fillStyle = CONFIG.SELECTION_COLOR;
                ctx.fillRect(indicatorX - 1, 0, 3, headerH);
                ctx.fillRect(indicatorX - 1, headerH, 3, viewH - headerH);
            }
        }

        ctx.restore();
    }

    #renderResizeLine(ctx, viewW, viewH) {
        if (!this.#resizeLine) return;

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
        } else {
            const y = this.#resizeLine.position;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(viewW, y);
            ctx.stroke();
        }

        ctx.restore();
    }
}