import {CONFIG} from "../constants/config";
import {HIT_TYPE} from "../constants/hitType";

export class HeaderRenderer {
    #resizeLine = null;

    setResizeLine(type, index, position) {
        this.#resizeLine = type ? { type, index, position } : null;
    }

    render(ctx, sheet, scrollX, scrollY, viewW, viewH) {
        this.#renderColumnHeaders(ctx, sheet, scrollX, viewW);
        this.#renderRowHeaders(ctx, sheet, scrollY, viewH);
        this.#renderCorner(ctx);
        this.#renderResizeLine(ctx, viewW, viewH);
    }

    #renderColumnHeaders(ctx, sheet, scrollX, viewW) {
        const rc = sheet.rowColManager;
        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;

        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(0, 0, viewW, headerH);

        ctx.fillStyle = "#555";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "left";

        const sc = rc.colAt(scrollX);
        const ec = rc.colAt(scrollX + viewW - headerW) + 1;
        for (let c = sc; c < ec; c++) {
            const x = headerW + rc.getColX(c) - scrollX;
            const w = rc.getColWidth(c);
            ctx.fillText(this.#colLabel(c), x + 4, headerH - 8);
            ctx.strokeStyle = CONFIG.GRID_COLOR;
            ctx.beginPath();
            ctx.moveTo(x + w, 0);
            ctx.lineTo(x + w, headerH);
            ctx.stroke();
        }
    }

    #renderRowHeaders(ctx, sheet, scrollY, viewH) {
        const rc = sheet.rowColManager;
        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;

        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(0, 0, headerW, viewH);

        ctx.fillStyle = "#555";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "left";

        const sr = rc.rowAt(scrollY);
        const er = rc.rowAt(scrollY + viewH - headerH) + 1;
        for (let r = sr; r < er; r++) {
            const y = headerH + rc.getRowY(r) - scrollY;
            const h = rc.getRowHeight(r);
            ctx.fillText(String(r + 1), 6, y + h / 2 + 4);
            ctx.strokeStyle = CONFIG.GRID_COLOR;
            ctx.beginPath();
            ctx.moveTo(0, y + h);
            ctx.lineTo(headerW, y + h);
            ctx.stroke();
        }
    }

    #renderCorner(ctx) {
        ctx.fillStyle = CONFIG.HEADER_BG;
        ctx.fillRect(0, 0, CONFIG.HEADER_WIDTH, CONFIG.HEADER_HEIGHT);
        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.strokeRect(0, 0, CONFIG.HEADER_WIDTH, CONFIG.HEADER_HEIGHT);
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

    #colLabel(col) {
        let label = "";
        let n = col;
        do {
            label = String.fromCharCode(65 + (n % 26)) + label;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return label;
    }
}