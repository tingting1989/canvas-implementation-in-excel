import { EVENT_NAMES } from "../constants/eventNames.js";
import { CONFIG } from "../constants/config";

let scrollbarStyleInjected = false;

function injectScrollbarStyles() {
    if (scrollbarStyleInjected) return;
    scrollbarStyleInjected = true;

    const style = document.createElement("style");
    style.textContent = `
.cs-scrollbar-h {
  position: absolute;
  bottom: 0;
  left: 50%;
  right: ${CONFIG.SCROLLBAR_WIDTH}px;
  height: ${CONFIG.SHEET_TAB_HEIGHT}px;
  background: #f1f1f1;
  border-top: 1px solid #ddd;
  z-index: 10;
}
.cs-scrollbar-h-thumb {
  position: absolute;
  top: ${(CONFIG.SHEET_TAB_HEIGHT - CONFIG.SCROLLBAR_WIDTH + 2) / 2}px;
  height: ${CONFIG.SCROLLBAR_WIDTH - 2}px;
  min-width: ${CONFIG.SCROLLBAR_MIN_SIZE}px;
  background: #c1c1c1;
  border-radius: 6px;
  cursor: pointer;
}
.cs-scrollbar-h-thumb:hover {
  background: #a8a8a8;
}
.cs-scrollbar-v {
  position: absolute;
  top: ${CONFIG.HEADER_HEIGHT}px;
  right: 0;
  bottom: ${CONFIG.SHEET_TAB_HEIGHT}px;
  width: ${CONFIG.SCROLLBAR_WIDTH}px;
  background: #f1f1f1;
  border-left: 1px solid #ddd;
  z-index: 10;
}
.cs-scrollbar-v-thumb {
  position: absolute;
  left: 1px;
  width: ${CONFIG.SCROLLBAR_WIDTH - 2}px;
  min-height: ${CONFIG.SCROLLBAR_MIN_SIZE}px;
  background: #c1c1c1;
  border-radius: 6px;
  cursor: pointer;
}
.cs-scrollbar-v-thumb:hover {
  background: #a8a8a8;
}
.cs-scrollbar-corner {
  position: absolute;
  right: 0;
  bottom: 0;
  width: ${CONFIG.SCROLLBAR_WIDTH}px;
  height: ${CONFIG.SHEET_TAB_HEIGHT}px;
  background: #f1f1f1;
  border-top: 1px solid #ddd;
  border-left: 1px solid #ddd;
  z-index: 11;
}`;
    document.head.appendChild(style);
}

export class ScrollManager {
    #scrollX = 0;
    #scrollY = 0;
    #maxScrollX = 0;
    #maxScrollY = 0;
    #onScrollCallback = null;
    #onAfterScroll = null;
    #wheelHandler = null;
    #dragMoveHandler = null;
    #dragEndHandler = null;
    #viewW = 0;
    #viewH = 0;
    #hThumb = null;
    #vThumb = null;
    #hBar = null;
    #vBar = null;
    #corner = null;

    constructor(wrap, canvas) {
        this.wrap = wrap;
        this.canvas = canvas;
        this.#createScrollbarDOM();
        this.#bindThumbDrag();
    }

    #createScrollbarDOM() {
        injectScrollbarStyles();

        this.#hBar = document.createElement("div");
        this.#hBar.className = "cs-scrollbar-h";
        this.#hThumb = document.createElement("div");
        this.#hThumb.className = "cs-scrollbar-h-thumb";
        this.#hBar.appendChild(this.#hThumb);

        this.#vBar = document.createElement("div");
        this.#vBar.className = "cs-scrollbar-v";
        this.#vThumb = document.createElement("div");
        this.#vThumb.className = "cs-scrollbar-v-thumb";
        this.#vBar.appendChild(this.#vThumb);

        this.#corner = document.createElement("div");
        this.#corner.className = "cs-scrollbar-corner";

        this.wrap.appendChild(this.#hBar);
        this.wrap.appendChild(this.#vBar);
        this.wrap.appendChild(this.#corner);
    }

    #bindThumbDrag() {
        let dragging = null;
        let startMouse = 0;
        let startScroll = 0;

        const onHThumbDown = (e) => {
            e.preventDefault();
            dragging = "h";
            startMouse = e.clientX;
            startScroll = this.#scrollX;
            document.addEventListener("mousemove", onDragMove);
            document.addEventListener("mouseup", onDragEnd);
        };

        const onVThumbDown = (e) => {
            e.preventDefault();
            dragging = "v";
            startMouse = e.clientY;
            startScroll = this.#scrollY;
            document.addEventListener("mousemove", onDragMove);
            document.addEventListener("mouseup", onDragEnd);
        };

        const onDragMove = (e) => {
            if (dragging === "h") {
                const dx = e.clientX - startMouse;
                const trackW = this.#viewW / 2 - CONFIG.SCROLLBAR_WIDTH;
                const viewW = this.#viewW - CONFIG.HEADER_WIDTH;
                const totalContent = this.#maxScrollX + viewW;
                const ratio = totalContent > 0 ? trackW / totalContent : 1;
                const newX = Math.max(0, Math.min(this.#maxScrollX, startScroll + dx / ratio));
                this.setScrollPosition(newX, this.#scrollY);
            } else if (dragging === "v") {
                const dy = e.clientY - startMouse;
                const trackH = this.#viewH - CONFIG.HEADER_HEIGHT;
                const viewH = this.#viewH - CONFIG.HEADER_HEIGHT;
                const totalContent = this.#maxScrollY + viewH;
                const ratio = totalContent > 0 ? trackH / totalContent : 1;
                const newY = Math.max(0, Math.min(this.#maxScrollY, startScroll + dy / ratio));
                this.setScrollPosition(this.#scrollX, newY);
            }
        };

        const onDragEnd = () => {
            dragging = null;
            document.removeEventListener("mousemove", onDragMove);
            document.removeEventListener("mouseup", onDragEnd);
        };

        this.#hThumb.addEventListener("mousedown", onHThumbDown);
        this.#vThumb.addEventListener("mousedown", onVThumbDown);

        this.#dragMoveHandler = onDragMove;
        this.#dragEndHandler = onDragEnd;
    }

    get scrollX() {
        return this.#scrollX;
    }
    get scrollY() {
        return this.#scrollY;
    }
    get maxScrollX() {
        return this.#maxScrollX;
    }
    get maxScrollY() {
        return this.#maxScrollY;
    }

    get onScrollCallback() {
        return this.#onScrollCallback;
    }
    set onScrollCallback(fn) {
        this.#onScrollCallback = fn;
    }

    get onAfterScroll() {
        return this.#onAfterScroll;
    }
    set onAfterScroll(fn) {
        this.#onAfterScroll = fn;
    }

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
        this.wrap.addEventListener(EVENT_NAMES.WHEEL, this.#wheelHandler, { passive: false });
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

        if (this.#vThumb && this.#maxScrollY > 0) {
            const trackH = this.#viewH - CONFIG.HEADER_HEIGHT;
            const viewH2 = this.#viewH - CONFIG.HEADER_HEIGHT;
            const totalH = this.#maxScrollY + viewH2;
            const thumbH = Math.max(CONFIG.SCROLLBAR_MIN_SIZE, Math.floor(trackH * (viewH2 / totalH)));
            this.#vThumb.style.height = thumbH + "px";
            const ratio = this.#scrollY / this.#maxScrollY;
            this.#vThumb.style.top = ratio * (trackH - thumbH) + "px";
        }

        if (this.#hThumb && this.#maxScrollX > 0) {
            const trackW = this.#viewW / 2 - CONFIG.SCROLLBAR_WIDTH;
            const viewW2 = this.#viewW - CONFIG.HEADER_WIDTH;
            const totalW = this.#maxScrollX + viewW2;
            const thumbW = Math.max(CONFIG.SCROLLBAR_MIN_SIZE, Math.floor(trackW * (viewW2 / totalW)));
            this.#hThumb.style.width = thumbW + "px";
            const ratio = this.#scrollX / this.#maxScrollX;
            this.#hThumb.style.left = ratio * (trackW - thumbW) + "px";
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
            this.wrap.removeEventListener(EVENT_NAMES.WHEEL, this.#wheelHandler);
            this.#wheelHandler = null;
        }
        if (this.#dragMoveHandler) {
            document.removeEventListener("mousemove", this.#dragMoveHandler);
            this.#dragMoveHandler = null;
        }
        if (this.#dragEndHandler) {
            document.removeEventListener("mouseup", this.#dragEndHandler);
            this.#dragEndHandler = null;
        }
        if (this.#hBar && this.#hBar.parentElement) {
            this.#hBar.parentElement.removeChild(this.#hBar);
        }
        if (this.#vBar && this.#vBar.parentElement) {
            this.#vBar.parentElement.removeChild(this.#vBar);
        }
        if (this.#corner && this.#corner.parentElement) {
            this.#corner.parentElement.removeChild(this.#corner);
        }
        this.#hBar = null;
        this.#vBar = null;
        this.#corner = null;
        this.#hThumb = null;
        this.#vThumb = null;
        this.wrap = null;
        this.canvas = null;
    }
}
