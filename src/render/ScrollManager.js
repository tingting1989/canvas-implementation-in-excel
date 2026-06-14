import { CONFIG } from "../core/constants.js";

export class ScrollManager {
    #scrollX = 0;
    #scrollY = 0;
    #maxScrollX = 0;
    #maxScrollY = 0;
    #onScrollCallback = null;
    #onAfterScroll = null;
    #wheelHandler = null;
    #viewW = 0;
    #viewH = 0;

    constructor(wrap, canvas) {
        this.wrap = wrap;
        this.canvas = canvas;
    }

    get scrollX() { return this.#scrollX; }
    get scrollY() { return this.#scrollY; }
    get maxScrollX() { return this.#maxScrollX; }
    get maxScrollY() { return this.#maxScrollY; }

    get onScrollCallback() { return this.#onScrollCallback; }
    set onScrollCallback(fn) { this.#onScrollCallback = fn; }

    get onAfterScroll() { return this.#onAfterScroll; }
    set onAfterScroll(fn) { this.#onAfterScroll = fn; }

    setViewSize(w, h) {
        this.#viewW = w;
        this.#viewH = h;
    }

    bind() {
        this.#wheelHandler = (e) => {
            e.preventDefault();
            const dx = e.deltaX || 0;
            const dy = e.deltaY || 0;
            this.#scrollX = Math.max(0, Math.min(this.#maxScrollX, this.#scrollX + dx));
            this.#scrollY = Math.max(0, Math.min(this.#maxScrollY, this.#scrollY + dy));
            if (this.#onScrollCallback) {
                this.#onScrollCallback();
            }
            if (this.#onAfterScroll) {
                this.#onAfterScroll();
            }
        };
        this.wrap.addEventListener("wheel", this.#wheelHandler, { passive: false });
    }

    updateScrollBounds(totalW, totalH, viewW, viewH) {
        this.#viewW = viewW;
        this.#viewH = viewH;
        this.#maxScrollX = Math.max(0, totalW - viewW + CONFIG.HEADER_WIDTH);
        this.#maxScrollY = Math.max(0, totalH - viewH + CONFIG.HEADER_HEIGHT);
        this.#scrollX = Math.min(this.#scrollX, this.#maxScrollX);
        this.#scrollY = Math.min(this.#scrollY, this.#maxScrollY);
    }

    setScrollPosition(x, y) {
        this.#scrollX = Math.max(0, Math.min(this.#maxScrollX, x));
        this.#scrollY = Math.max(0, Math.min(this.#maxScrollY, y));
        if (this.#onScrollCallback) this.#onScrollCallback();
        if (this.#onAfterScroll) this.#onAfterScroll();
    }

    updateScrollbars(viewW, viewH) {
        this.#viewW = viewW || this.#viewW;
        this.#viewH = viewH || this.#viewH;

        const vThumb = this.wrap.querySelector(".scrollbar-v-thumb");
        const hThumb = this.wrap.querySelector(".scrollbar-h-thumb");

        if (vThumb && this.#maxScrollY > 0) {
            const trackH = this.#viewH - CONFIG.HEADER_HEIGHT - CONFIG.SCROLLBAR_WIDTH;
            const viewH2 = this.#viewH - CONFIG.HEADER_HEIGHT;
            const totalH = this.#maxScrollY + viewH2;
            const thumbH = Math.max(CONFIG.SCROLLBAR_MIN_SIZE, Math.floor(trackH * (viewH2 / totalH)));
            vThumb.style.height = thumbH + "px";
            const ratio = this.#scrollY / this.#maxScrollY;
            vThumb.style.top = (CONFIG.HEADER_HEIGHT + ratio * (trackH - thumbH)) + "px";
        }

        if (hThumb && this.#maxScrollX > 0) {
            const trackW = this.#viewW - CONFIG.HEADER_WIDTH - CONFIG.SCROLLBAR_WIDTH;
            const viewW2 = this.#viewW - CONFIG.HEADER_WIDTH;
            const totalW = this.#maxScrollX + viewW2;
            const thumbW = Math.max(CONFIG.SCROLLBAR_MIN_SIZE, Math.floor(trackW * (viewW2 / totalW)));
            hThumb.style.width = thumbW + "px";
            const ratio = this.#scrollX / this.#maxScrollX;
            hThumb.style.left = (CONFIG.HEADER_WIDTH + ratio * (trackW - thumbW)) + "px";
        }
    }

    scrollToCell(row, col, rc) {
        if (!rc) return;

        const cellX = rc.getColX(col);
        const cellY = rc.getRowY(row);
        const cellW = rc.getColWidth(col);
        const cellH = rc.getRowHeight(row);
        const viewW = this.#viewW - CONFIG.HEADER_WIDTH;
        const viewH = this.#viewH - CONFIG.HEADER_HEIGHT;

        if (cellX < this.#scrollX) {
            this.#scrollX = cellX;
        } else if (cellX + cellW > this.#scrollX + viewW) {
            this.#scrollX = cellX + cellW - viewW;
        }

        if (cellY < this.#scrollY) {
            this.#scrollY = cellY;
        } else if (cellY + cellH > this.#scrollY + viewH) {
            this.#scrollY = cellY + cellH - viewH;
        }

        this.#scrollX = Math.max(0, Math.min(this.#maxScrollX, this.#scrollX));
        this.#scrollY = Math.max(0, Math.min(this.#maxScrollY, this.#scrollY));
    }

    destroy() {
        if (this.#wheelHandler) {
            this.wrap.removeEventListener("wheel", this.#wheelHandler);
            this.#wheelHandler = null;
        }
        this.wrap = null;
        this.canvas = null;
    }
}