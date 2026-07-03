import { EVENT_NAMES } from "../constants/eventNames.js";
import { CONFIG } from "../constants/config";
import { SCROLL_AXIS } from "../constants/enums/ScrollAxis.js";
import { DOMComponent } from "../core/DOMComponent.js";
import "./scrollbar.css";

export class ScrollManager extends DOMComponent {
    #scrollX = 0;
    #scrollY = 0;
    #maxScrollX = 0;
    #maxScrollY = 0;
    #headerH = CONFIG.HEADER_HEIGHT;
    #headerW = CONFIG.HEADER_WIDTH;

    /** 冻结区域尺寸（用于滚动条轨道计算） */
    #frozenRowsH = 0;
    #frozenColsW = 0;
    #onScrollCallback = null;
    #onAfterScroll = null;
    #viewW = 0;
    #viewH = 0;
    #hThumb = null;
    #vThumb = null;
    #topCorner = null;
    #hBar = null;
    #vBar = null;
    #corner = null;

    /** rAF 合并标志：scroll 回调是否已在本帧调度 */
    #pendingScrollCallback = false;

    constructor(wrap, canvas) {
        super();
        this.wrap = wrap;
        this.canvas = canvas;
        this.#headerH = CONFIG.HEADER_HEIGHT;
        this.#createScrollbarDOM();
        this.#bindThumbDrag();
    }

    #createScrollbarDOM() {
        this.#hThumb = this.createElement("div", { className: "cs-scrollbar-h-thumb" });
        this.#hBar = this.createElement("div", { className: "cs-scrollbar-h" }, this.wrap);
        this.#hBar.appendChild(this.#hThumb);

        this.#vThumb = this.createElement("div", { className: "cs-scrollbar-v-thumb" });
        this.#vBar = this.createElement("div", { className: "cs-scrollbar-v" }, this.wrap);
        this.#vBar.appendChild(this.#vThumb);

        this.#corner = this.createElement("div", { className: "cs-scrollbar-corner" }, this.wrap);
        this.#topCorner = this.createElement("div", { className: "cs-scrollbar-corner-top" }, this.wrap);
    }

    #bindThumbDrag() {
        let dragging = null;
        let startMouse = 0;
        let startScroll = 0;

        const onDragMove = (e) => {
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

        const onDragEnd = () => {
            dragging = null;
            document.removeEventListener(EVENT_NAMES.MOUSEMOVE, onDragMove);
            document.removeEventListener(EVENT_NAMES.MOUSEUP, onDragEnd);
        };

        this.trackEvent(this.#hThumb, EVENT_NAMES.MOUSEDOWN, (e) => {
            e.preventDefault();
            dragging = SCROLL_AXIS.HORIZONTAL;
            startMouse = e.clientX;
            startScroll = this.#scrollX;
            document.addEventListener(EVENT_NAMES.MOUSEMOVE, onDragMove);
            document.addEventListener(EVENT_NAMES.MOUSEUP, onDragEnd);
        });

        this.trackEvent(this.#vThumb, EVENT_NAMES.MOUSEDOWN, (e) => {
            e.preventDefault();
            dragging = SCROLL_AXIS.VERTICAL;
            startMouse = e.clientY;
            startScroll = this.#scrollY;
            document.addEventListener(EVENT_NAMES.MOUSEMOVE, onDragMove);
            document.addEventListener(EVENT_NAMES.MOUSEUP, onDragEnd);
        });
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

    get hasHScrollbar() {
        return this.#maxScrollX > 0;
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
        this.trackEvent(
            this.wrap,
            EVENT_NAMES.WHEEL,
            (e) => {
                e.preventDefault();
                const dx = e.deltaX || 0;
                const dy = e.deltaY || 0;
                this.#scrollX = Math.max(0, Math.min(this.#maxScrollX, this.#scrollX + dx));
                this.#scrollY = Math.max(0, Math.min(this.#maxScrollY, this.#scrollY + dy));
                this.#scheduleScrollCallbacks();
            },
            { passive: false },
        );
    }

    /**
     * 通过 rAF 合并滚动回调，确保同一帧内只执行一次
     * 滚动位置本身已立即更新，回调延迟到下一帧取最新值
     */
    #scheduleScrollCallbacks() {
        if (this.#pendingScrollCallback) return;
        this.#pendingScrollCallback = true;
        requestAnimationFrame(() => {
            this.#pendingScrollCallback = false;
            if (this.#onScrollCallback) this.#onScrollCallback();
            if (this.#onAfterScroll) this.#onAfterScroll();
        });
    }

    /**
     * 更新滚动范围
     *
     * 冻结区域始终可见，实际可滚动的数据区为：
     *   dataViewW = viewW - headerW - frozenColsW
     *   dataViewH = viewH - headerH - frozenRowsH
     *
     * 因此最大滚动偏移为：
     *   maxScrollX = totalW - dataViewW = totalW - viewW + headerW + frozenColsW
     *   maxScrollY = totalH - dataViewH = totalH - viewH + headerH + frozenRowsH
     *
     * @param {number} totalW - 内容总宽度
     * @param {number} totalH - 内容总高度
     * @param {number} viewW - 视口宽度
     * @param {number} viewH - 视口高度
     * @param {number} [headerH] - 表头高度
     * @param {number} [headerW] - 表头宽度
     * @param {number} [frozenRowsH] - 冻结行像素高度
     * @param {number} [frozenColsW] - 冻结列像素宽度
     */
    updateScrollBounds(
        totalW,
        totalH,
        viewW,
        viewH,
        headerH = CONFIG.HEADER_HEIGHT,
        headerW = CONFIG.HEADER_WIDTH,
        frozenRowsH = 0,
        frozenColsW = 0,
    ) {
        this.#viewW = viewW;
        this.#viewH = viewH;
        this.#headerH = headerH;
        this.#headerW = headerW;
        this.#frozenRowsH = frozenRowsH;
        this.#frozenColsW = frozenColsW;

        this.#maxScrollX = Math.max(0, totalW - viewW + headerW + frozenColsW);
        this.#maxScrollY = Math.max(0, totalH - viewH + headerH + frozenRowsH);

        this.#scrollX = Math.min(this.#scrollX, this.#maxScrollX);
        this.#scrollY = Math.min(this.#scrollY, this.#maxScrollY);
    }

    setScrollPosition(x, y) {
        this.#scrollX = Math.max(0, Math.min(this.#maxScrollX, x));
        this.#scrollY = Math.max(0, Math.min(this.#maxScrollY, y));
        this.#scheduleScrollCallbacks();
    }

    updateScrollbars(viewW, viewH) {
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

    scrollToCell(row, col, rc, frozenRowsH = 0, frozenColsW = 0) {
        if (!rc) return;

        const cellX = rc.getColX(col);
        const cellY = rc.getRowY(row);
        const cellW = rc.getColWidth(col);
        const cellH = rc.getRowHeight(row);
        const viewW = this.#viewW - (this.#headerW ?? CONFIG.HEADER_WIDTH) - frozenColsW;
        const viewH = this.#viewH - (this.#headerH ?? CONFIG.HEADER_HEIGHT) - frozenRowsH;

        if (cellX < frozenColsW) {
            // cell is in frozen column area, no horizontal scroll needed
        } else {
            if (cellX - frozenColsW < this.#scrollX) {
                this.#scrollX = cellX - frozenColsW;
            } else if (cellX + cellW - frozenColsW > this.#scrollX + viewW) {
                this.#scrollX = cellX + cellW - frozenColsW - viewW;
            }
        }

        if (cellY < frozenRowsH) {
            // cell is in frozen row area, no vertical scroll needed
        } else {
            if (cellY - frozenRowsH < this.#scrollY) {
                this.#scrollY = cellY - frozenRowsH;
            } else if (cellY + cellH - frozenRowsH > this.#scrollY + viewH) {
                this.#scrollY = cellY + cellH - frozenRowsH - viewH;
            }
        }

        this.#scrollX = Math.max(0, Math.min(this.#maxScrollX, this.#scrollX));
        this.#scrollY = Math.max(0, Math.min(this.#maxScrollY, this.#scrollY));
    }

    /** @override */
    onDestroy() {
        this.#pendingScrollCallback = false;
        this.wrap = null;
        this.canvas = null;
    }
}
