import { TileCache } from "./TileCache.js";
import { ScrollManager } from "./ScrollManager.js";
import { TileRenderer } from "./TileRenderer.js";
import { OverlayRenderer } from "./OverlayRenderer.js";
import { HeaderRenderer } from "./HeaderRenderer.js";
import { EVENT_NAMES } from "../constants/eventNames.js";
import {CONFIG} from "../constants/config";
import {HIT_TYPE} from "../constants/hitType";

export class RenderEngine {
    #currentSheet = null;
    #rafId = null;
    #pendingRender = false;
    #resizeHandler = null;
    #dpr = 1;
    #viewW = 0;
    #viewH = 0;

    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext("2d");
        this.wrap = this.canvas.parentElement;
        this.#dpr = window.devicePixelRatio || 1;

        this.scrollMgr = new ScrollManager(this.wrap, this.canvas);
        this.tileRenderer = new TileRenderer(new TileCache(this.#dpr));
        this.overlayRenderer = new OverlayRenderer();
        this.headerRenderer = new HeaderRenderer();

        this.#initCanvasSize();
        this.#bindEvents();
    }

    get scrollX() { return this.scrollMgr.scrollX; }
    get scrollY() { return this.scrollMgr.scrollY; }
    get viewW() { return this.#viewW; }
    get viewH() { return this.#viewH; }
    get dpr() { return this.#dpr; }
    get currentSheet() { return this.#currentSheet; }

    get onScrollCallback() { return this.scrollMgr.onScrollCallback; }
    set onScrollCallback(fn) { this.scrollMgr.onScrollCallback = fn; }

    #initCanvasSize() {
        const rect = this.wrap.getBoundingClientRect();
        this.#viewW = rect.width;
        this.#viewH = rect.height;
        this.canvas.width = rect.width * this.#dpr;
        this.canvas.height = rect.height * this.#dpr;
        this.canvas.style.width = rect.width + "px";
        this.canvas.style.height = rect.height + "px";
    }

    #bindEvents() {
        this.scrollMgr.bind();
        this.scrollMgr.onAfterScroll = () => {
            this.requestRender();
        };

        this.#resizeHandler = () => {
            this.#initCanvasSize();
            this.requestRender();
        };
        window.addEventListener(EVENT_NAMES.RESIZE, this.#resizeHandler);
    }

    requestRender() {
        if (this.#pendingRender) return;
        this.#pendingRender = true;
        this.#rafId = requestAnimationFrame(() => {
            this.#pendingRender = false;
            if (this.#currentSheet) {
                this.render(this.#currentSheet);
            }
        });
    }

    render(sheet) {
        if (!sheet || !sheet.visible) return;
        this.#currentSheet = sheet;

        const rc = sheet.rowColManager;
        this.scrollMgr.updateScrollBounds(rc.totalWidth, rc.totalHeight, this.#viewW, this.#viewH);

        const ctx = this.ctx;
        const viewW = this.#viewW;
        const viewH = this.#viewH;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;

        ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
        ctx.clearRect(0, 0, viewW, viewH);

        this.tileRenderer.render(ctx, sheet, sx, sy, viewW, viewH);
        this.overlayRenderer.renderMerges(ctx, sheet, sx, sy);
        this.overlayRenderer.renderSelection(ctx, sheet, sx, sy, viewW, viewH);
        this.headerRenderer.render(ctx, sheet, sx, sy, viewW, viewH);

        this.scrollMgr.updateScrollbars(this.#viewW, this.#viewH);
    }

    getCellRect(row, col, mergeInfo = null) {
        const rc = this.#currentSheet ? this.#currentSheet.rowColManager : null;
        if (!rc) return { x: 0, y: 0, w: 0, h: 0 };

        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;

        if (mergeInfo) {
            const x = headerW + rc.getColX(mergeInfo.topCol) - sx;
            const y = headerH + rc.getRowY(mergeInfo.topRow) - sy;
            const w = rc.getColX(mergeInfo.bottomCol) + rc.getColWidth(mergeInfo.bottomCol) - rc.getColX(mergeInfo.topCol);
            const h = rc.getRowY(mergeInfo.bottomRow) + rc.getRowHeight(mergeInfo.bottomRow) - rc.getRowY(mergeInfo.topRow);
            return { x, y, w, h };
        }

        const x = headerW + rc.getColX(col) - sx;
        const y = headerH + rc.getRowY(row) - sy;
        const w = rc.getColWidth(col);
        const h = rc.getRowHeight(row);
        return { x, y, w, h };
    }

    hitTest(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;

        if (px >= 0 && px <= headerW && py >= 0 && py <= headerH) {
            return { type: HIT_TYPE.CORNER };
        }

        if (py >= 0 && py <= headerH && px > headerW) {
            const rc = this.#currentSheet ? this.#currentSheet.rowColManager : null;
            if (!rc) return null;
            const dataX = px - headerW + this.scrollMgr.scrollX;
            const col = rc.colAt(dataX);
            if (col >= 0 && col < rc.colCount) {
                return { type: HIT_TYPE.COL_HEADER, index: col };
            }
        }

        if (px >= 0 && px <= headerW && py > headerH) {
            const rc = this.#currentSheet ? this.#currentSheet.rowColManager : null;
            if (!rc) return null;
            const dataY = py - headerH + this.scrollMgr.scrollY;
            const row = rc.rowAt(dataY);
            if (row >= 0 && row < rc.rowCount) {
                return { type: HIT_TYPE.ROW_HEADER, index: row };
            }
        }

        if (px > headerW && py > headerH) {
            const rc = this.#currentSheet ? this.#currentSheet.rowColManager : null;
            if (!rc) return null;
            const dataX = px - headerW + this.scrollMgr.scrollX;
            const dataY = py - headerH + this.scrollMgr.scrollY;
            const col = rc.colAt(dataX);
            const row = rc.rowAt(dataY);
            if (row >= 0 && row < rc.rowCount && col >= 0 && col < rc.colCount) {
                return { type: HIT_TYPE.CELL, row, col };
            }
        }

        return null;
    }

    headerHitTest(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const rc = this.#currentSheet ? this.#currentSheet.rowColManager : null;
        if (!rc) return null;

        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;
        const hitArea = CONFIG.RESIZE_HIT_AREA;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;

        if (py >= 0 && py <= headerH && px > headerW) {
            const dataX = px - headerW + sx;
            const col = rc.colAt(dataX);
            const colRight = rc.getColX(col) + rc.getColWidth(col);
            if (Math.abs(dataX - colRight) <= hitArea) {
                return { type: HIT_TYPE.COL_RESIZE, index: col };
            }
        }

        if (px >= 0 && px <= headerW && py > headerH) {
            const dataY = py - headerH + sy;
            const row = rc.rowAt(dataY);
            const rowBottom = rc.getRowY(row) + rc.getRowHeight(row);
            if (Math.abs(dataY - rowBottom) <= hitArea) {
                return { type: HIT_TYPE.ROW_RESIZE, index: row };
            }
        }

        return null;
    }

    fillHandleHitTest(clientX, clientY) {
        if (!this.#currentSheet) return false;

        const rect = this.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const rc = this.#currentSheet.rowColManager;
        const range = this.#currentSheet.selection.getRange();

        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;

        const x2 = headerW + rc.getColX(range.bottomCol) + rc.getColWidth(range.bottomCol) - sx;
        const y2 = headerH + rc.getRowY(range.bottomRow) + rc.getRowHeight(range.bottomRow) - sy;

        const handleSize = 6;
        return px >= x2 - handleSize && px <= x2 &&
               py >= y2 - handleSize && py <= y2;
    }

    scrollToCell(row, col) {
        const rc = this.#currentSheet ? this.#currentSheet.rowColManager : null;
        this.scrollMgr.scrollToCell(row, col, rc);
    }

    get maxScrollX() { return this.scrollMgr.maxScrollX; }
    get maxScrollY() { return this.scrollMgr.maxScrollY; }

    setScrollPosition(x, y) {
        this.scrollMgr.setScrollPosition(x, y);
        this.requestRender();
    }

    invalidateCell(row, col) {
        const rc = this.#currentSheet ? this.#currentSheet.rowColManager : null;
        this.tileRenderer.invalidateCell(row, col, rc);
    }

    invalidateAll() {
        this.tileRenderer.invalidateAll();
    }

    destroy() {
        if (this.#rafId) {
            cancelAnimationFrame(this.#rafId);
        }
        this.scrollMgr.destroy();
        this.tileRenderer.destroy();
        window.removeEventListener(EVENT_NAMES.RESIZE, this.#resizeHandler);
    }
}