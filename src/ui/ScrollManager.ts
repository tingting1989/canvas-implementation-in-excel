import { EVENT_NAMES } from "../constants/eventNames.js";
import { CONFIG } from "../constants/config.js";
import { SCROLL_AXIS } from "../constants/enums/ScrollAxis.js";
import { DOMComponent } from "../core/DOMComponent.js";
import "./scrollbar.css";

export class ScrollManager extends DOMComponent {
    #scrollX: number = 0;
    #scrollY: number = 0;
    #maxScrollX: number = 0;
    #maxScrollY: number = 0;
    #headerH: number = CONFIG.HEADER_HEIGHT;
    #headerW: number = CONFIG.HEADER_WIDTH;
    #frozenRowsH: number = 0;
    #frozenColsW: number = 0;
    #onScrollCallback: (() => void) | null = null;
    #onAfterScroll: (() => void) | null = null;
    #viewW: number = 0;
    #viewH: number = 0;
    #hThumb: HTMLElement | null = null;
    #vThumb: HTMLElement | null = null;
    #topCorner: HTMLElement | null = null;
    #hBar: HTMLElement | null = null;
    #vBar: HTMLElement | null = null;
    #corner: HTMLElement | null = null;
    #pendingScrollCallback: boolean = false;

    wrap: HTMLElement | null;
    canvas: HTMLCanvasElement | null;

    constructor(wrap: HTMLElement, canvas: HTMLCanvasElement) {
        super();
        this.wrap = wrap;
        this.canvas = canvas;
        this.#headerH = CONFIG.HEADER_HEIGHT;
        this.#createScrollbarDOM();
        this.#bindThumbDrag();
    }

    #createScrollbarDOM(): void {
        this.#hThumb = this.createElement("div", { className: "cs-scrollbar-h-thumb" });
        this.#hBar = this.createElement("div", { className: "cs-scrollbar-h" }, this.wrap!);
        this.#hBar.appendChild(this.#hThumb);

        this.#vThumb = this.createElement("div", { className: "cs-scrollbar-v-thumb" });
        this.#vBar = this.createElement("div", { className: "cs-scrollbar-v" }, this.wrap!);
        this.#vBar.appendChild(this.#vThumb);

        this.#corner = this.createElement("div", { className: "cs-scrollbar-corner" }, this.wrap!);
        this.#topCorner = this.createElement("div", { className: "cs-scrollbar-corner-top" }, this.wrap!);
    }

    #bindThumbDrag(): void {
        let dragging: string | null = null;
        let startMouse: number = 0;
        let startScroll: number = 0;
        let dragOwner: string | null = null;

        const onDragMove = (e: MouseEvent): void => {
            if (!dragging) return;
            if (dragging === SCROLL_AXIS.HORIZONTAL) {
                const dx = e.clientX - startMouse;
                const hw = this.#headerW ?? CONFIG.HEADER_WIDTH;
                const trackW = (this.#viewW - CONFIG.SCROLLBAR_WIDTH) / 2;
                const dataViewW = this.#viewW - hw - this.#frozenColsW;
                const totalContent = this.#maxScrollX + dataViewW;
                const ratio = totalContent > 0 ? trackW / totalContent : 1;
                const newX = Math.max(0, Math.min(this.#maxScrollX, startScroll + dx / ratio));
                this.setScrollPosition(newX, this.#scrollY);
            } else if (dragging === SCROLL_AXIS.VERTICAL) {
                const dy = e.clientY - startMouse;
                const hh = this.#headerH ?? CONFIG.HEADER_HEIGHT;
                const trackH = this.#viewH - hh - this.#frozenRowsH;
                const dataViewH = this.#viewH - hh - this.#frozenRowsH;
                const totalContent = this.#maxScrollY + dataViewH;
                const ratio = totalContent > 0 ? trackH / totalContent : 1;
                const newY = Math.max(0, Math.min(this.#maxScrollY, startScroll + dy / ratio));
                this.setScrollPosition(this.#scrollX, newY);
            }
        };

        const onDragEnd = (): void => {
            dragging = null;
            dragOwner = null;
            document.removeEventListener(EVENT_NAMES.MOUSEMOVE, onDragMove);
            document.removeEventListener(EVENT_NAMES.MOUSEUP, onDragEnd);
        };

        const ownerKey = `scroll-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        this.trackEvent(this.#hThumb!, EVENT_NAMES.MOUSEDOWN, (e: Event) => {
            (e as MouseEvent).preventDefault();
            dragging = SCROLL_AXIS.HORIZONTAL;
            dragOwner = ownerKey;
            startMouse = (e as MouseEvent).clientX;
            startScroll = this.#scrollX;
            document.addEventListener(EVENT_NAMES.MOUSEMOVE, onDragMove);
            document.addEventListener(EVENT_NAMES.MOUSEUP, onDragEnd);
        });

        this.trackEvent(this.#vThumb!, EVENT_NAMES.MOUSEDOWN, (e: Event) => {
            (e as MouseEvent).preventDefault();
            dragging = SCROLL_AXIS.VERTICAL;
            dragOwner = ownerKey;
            startMouse = (e as MouseEvent).clientY;
            startScroll = this.#scrollY;
            document.addEventListener(EVENT_NAMES.MOUSEMOVE, onDragMove);
            document.addEventListener(EVENT_NAMES.MOUSEUP, onDragEnd);
        });
    }

    get scrollX(): number {
        return this.#scrollX;
    }

    get scrollY(): number {
        return this.#scrollY;
    }

    get maxScrollX(): number {
        return this.#maxScrollX;
    }

    get maxScrollY(): number {
        return this.#maxScrollY;
    }

    get hasHScrollbar(): boolean {
        return this.#maxScrollX > 0;
    }

    get onScrollCallback(): (() => void) | null {
        return this.#onScrollCallback;
    }

    set onScrollCallback(fn: (() => void) | null) {
        this.#onScrollCallback = fn;
    }

    get onAfterScroll(): (() => void) | null {
        return this.#onAfterScroll;
    }

    set onAfterScroll(fn: (() => void) | null) {
        this.#onAfterScroll = fn;
    }

    setViewSize(w: number, h: number): void {
        this.#viewW = w;
        this.#viewH = h;
    }

    bind(): void {
        this.trackEvent(
            this.wrap!,
            EVENT_NAMES.WHEEL,
            (e: Event) => {
                (e as WheelEvent).preventDefault();
                const dx = (e as WheelEvent).deltaX || 0;
                const dy = (e as WheelEvent).deltaY || 0;
                this.#scrollX = Math.max(0, Math.min(this.#maxScrollX, this.#scrollX + dx));
                this.#scrollY = Math.max(0, Math.min(this.#maxScrollY, this.#scrollY + dy));
                this.#scheduleScrollCallbacks();
            },
            { passive: false },
        );
    }

    #scheduleScrollCallbacks(): void {
        if (this.#pendingScrollCallback) return;
        this.#pendingScrollCallback = true;
        requestAnimationFrame(() => {
            this.#pendingScrollCallback = false;
            if (this.#onScrollCallback) this.#onScrollCallback();
            if (this.#onAfterScroll) this.#onAfterScroll();
        });
    }

    updateScrollBounds(
        totalW: number,
        totalH: number,
        viewW: number,
        viewH: number,
        headerH: number = CONFIG.HEADER_HEIGHT,
        headerW: number = CONFIG.HEADER_WIDTH,
        frozenRowsH: number = 0,
        frozenColsW: number = 0,
    ): void {
        this.#viewW = viewW;
        this.#viewH = viewH;
        this.#headerH = headerH;
        this.#headerW = headerW;
        this.#frozenRowsH = frozenRowsH;
        this.#frozenColsW = frozenColsW;

        this.#maxScrollX = Math.max(0, totalW - viewW + headerW);
        this.#maxScrollY = Math.max(0, totalH - viewH + headerH);

        this.#scrollX = Math.min(this.#scrollX, this.#maxScrollX);
        this.#scrollY = Math.min(this.#scrollY, this.#maxScrollY);
    }

    setScrollPosition(x: number, y: number): void {
        this.#scrollX = Math.max(0, Math.min(this.#maxScrollX, x));
        this.#scrollY = Math.max(0, Math.min(this.#maxScrollY, y));
        this.#scheduleScrollCallbacks();
    }

    updateScrollbars(viewW?: number, viewH?: number): void {
        this.#viewW = viewW || this.#viewW;
        this.#viewH = viewH || this.#viewH;
        const hh = this.#headerH ?? CONFIG.HEADER_HEIGHT;
        const hw = this.#headerW ?? CONFIG.HEADER_WIDTH;

        const showV = this.#maxScrollY > 0;
        const showH = this.#maxScrollX > 0;

        if (this.#vBar) this.#vBar.style.display = showV ? "" : "none";
        if (this.#hBar) this.#hBar.style.display = showH ? "" : "none";
        if (this.#corner) this.#corner.style.display = showV && showH ? "" : "none";
        if (this.#topCorner) this.#topCorner.style.display = showV ? "" : "none";

        if (this.#vThumb && showV) {
            const trackH = this.#viewH - hh;
            const dataViewH = this.#viewH - hh - this.#frozenRowsH;
            const totalH = this.#maxScrollY + dataViewH;
            const thumbH = Math.max(CONFIG.SCROLLBAR_MIN_SIZE, Math.floor(trackH * (dataViewH / totalH)));
            this.#vThumb.style.height = thumbH + "px";
            const ratio = this.#maxScrollY > 0 ? this.#scrollY / this.#maxScrollY : 0;
            this.#vThumb.style.top = ratio * (trackH - thumbH) + "px";
        }

        if (this.#hThumb && showH) {
            const trackW = (this.#viewW - CONFIG.SCROLLBAR_WIDTH) / 2;
            const dataViewW = this.#viewW - hw - this.#frozenColsW;
            const totalW = this.#maxScrollX + dataViewW;
            const thumbW = Math.max(CONFIG.SCROLLBAR_MIN_SIZE, Math.floor(trackW * (dataViewW / totalW)));
            this.#hThumb.style.width = thumbW + "px";
            const ratio = this.#maxScrollX > 0 ? this.#scrollX / this.#maxScrollX : 0;
            this.#hThumb.style.left = ratio * (trackW - thumbW) + "px";
        }
    }

    scrollToCell(row: number, col: number, rc: any, frozenRowsH: number = 0, frozenColsW: number = 0): void {
        if (!rc) return;

        const cellX = rc.getColX(col);
        const cellY = rc.getRowY(row);
        const cellW = rc.getColWidth(col);
        const cellH = rc.getRowHeight(row);
        const viewW = this.#viewW - (this.#headerW ?? CONFIG.HEADER_WIDTH) - frozenColsW;
        const viewH = this.#viewH - (this.#headerH ?? CONFIG.HEADER_HEIGHT) - frozenRowsH;

        let newScrollX = this.#scrollX;
        let newScrollY = this.#scrollY;

        if (cellX < frozenColsW) {
            // cell is in frozen column area, no horizontal scroll needed
        } else {
            if (cellX - frozenColsW < this.#scrollX) {
                newScrollX = cellX - frozenColsW;
            } else if (cellX + cellW - frozenColsW > this.#scrollX + viewW) {
                newScrollX = cellX + cellW - frozenColsW - viewW;
            }
        }

        if (cellY < frozenRowsH) {
            // cell is in frozen row area, no vertical scroll needed
        } else {
            if (cellY - frozenRowsH < this.#scrollY) {
                newScrollY = cellY - frozenRowsH;
            } else if (cellY + cellH - frozenRowsH > this.#scrollY + viewH) {
                newScrollY = cellY + cellH - frozenRowsH - viewH;
            }
        }

        this.setScrollPosition(newScrollX, newScrollY);
    }

    onDestroy(): void {
        this.#pendingScrollCallback = false;
        this.wrap = null;
        this.canvas = null;
    }
}
