import { ScrollManager } from "../ui/ScrollManager.js";
import { SheetTabManager } from "../ui/sheetTab/SheetTabManager.js";
import { ViewportTransform } from "./ViewportTransform.js";
import { EVENT_NAMES } from "../constants/eventNames.js";
import { CONFIG } from "../constants/config";
import { HIT_TYPE } from "../constants/hitType";
import { CONTENT_TYPE } from "../constants/enums/ContentType.js";
import { SELECTION_CONFIG } from "../constants/selectionConfig";
import { LayerCompositor } from "./LayerCompositor.js";
import { TileLayer } from "./layers/TileLayer.js";
import { SelectionLayer } from "./layers/SelectionLayer.js";
import { FrozenLayer } from "./layers/FrozenLayer.js";
import { InteractionLayer } from "./layers/InteractionLayer.js";
import { HeaderLayer } from "./layers/HeaderLayer.js";
import { ChartLayer } from "./layers/ChartLayer.js";
import { ReactiveStore } from "../state/ReactiveStore.js";
import { DOMComponent } from "../core/DOMComponent.js";

export class RenderEngine extends DOMComponent {
    #currentSheet = null;
    #rafId = null;
    #pendingRender = false;
    #viewW = 0;
    #viewH = 0;
    #cachedVT = null;
    #cachedVTSheetKey = "";
    #userWidth = null;
    #userHeight = null;

    constructor(canvasId) {
        super();
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext("2d");
        this.outerWrap = this.canvas.parentElement;

        this.onAfterRender = null;

        this.wrap = this.createElement("div", {
            className: "cs-canvas-wrap",
            style: { position: "relative", overflow: "hidden" },
        });
        this.outerWrap.insertBefore(this.wrap, this.canvas);
        this.wrap.appendChild(this.canvas);

        this.scrollMgr = new ScrollManager(this.wrap, this.canvas);
        this.trackChild(this.scrollMgr);

        this.sheetTabBar = new SheetTabManager(this.wrap, null);
        this.trackChild(this.sheetTabBar);

        this.#initLayerSystem();
        this.#initCanvasSize();
        this.#bindEvents();
    }

    #initLayerSystem() {
        this.store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            selection: { ranges: [], activeRange: null, merges: [] },
            editor: { visible: false, row: -1, col: -1, value: "" },
            viewport: { width: 0, height: 0 },
            tile: { size: 256, cacheMax: 512 },
            charts: { version: 0 },
        });

        this.compositor = new LayerCompositor();

        this.tileLayer = new TileLayer();
        this.selectionLayer = new SelectionLayer();
        this.frozenLayer = new FrozenLayer();
        this.interactionLayer = new InteractionLayer();
        this.headerLayer = new HeaderLayer();
        this.chartLayer = new ChartLayer();

        this.tileLayer.onContentReady = () => {
            this.requestRender();
        };

        this.compositor.register(this.tileLayer);
        this.compositor.register(this.selectionLayer);
        this.compositor.register(this.frozenLayer);
        this.compositor.register(this.chartLayer);
        this.compositor.register(this.interactionLayer);
        this.compositor.register(this.headerLayer);

        this.headerLayer.setDragIndicator(this.selectionLayer);

        this.compositor.bindAllLayers(this.store);
    }

    get scrollX() {
        return this.scrollMgr.scrollX;
    }
    get scrollY() {
        return this.scrollMgr.scrollY;
    }
    get viewW() {
        return this.#viewW;
    }
    get viewH() {
        return this.#viewH;
    }
    get currentSheet() {
        return this.#currentSheet;
    }

    get headerRenderer() {
        return this.headerLayer.headerRenderer;
    }

    get overlayRenderer() {
        return this.selectionLayer.overlayRenderer;
    }

    setResizeLine(type, index, position) {
        this.interactionLayer.setResizeLine(type, index, position);
    }

    clearResizeLine() {
        this.interactionLayer.clearResizeLine();
    }

    get onScrollCallback() {
        return this.scrollMgr.onScrollCallback;
    }
    set onScrollCallback(fn) {
        this.scrollMgr.onScrollCallback = fn;
    }

    #initCanvasSize(width, height) {
        const rect = this.outerWrap.getBoundingClientRect();
        const w = width ?? rect.width;
        const h = height ?? rect.height;
        const canvasW = w - CONFIG.SCROLLBAR_WIDTH;
        const canvasH = h - CONFIG.SHEET_TAB_HEIGHT;
        this.#viewW = canvasW;
        this.#viewH = canvasH;
        this.canvas.width = canvasW * CONFIG.DPR;
        this.canvas.height = canvasH * CONFIG.DPR;
        this.canvas.style.width = canvasW + "px";
        this.canvas.style.height = canvasH + "px";
        this.wrap.style.width = w + "px";
        this.wrap.style.height = h + "px";
    }

    setCanvasSize(width, height) {
        if (width != null) this.#userWidth = width;
        if (height != null) this.#userHeight = height;
        this.#initCanvasSize(this.#userWidth, this.#userHeight);
        this.requestRender();
    }

    #bindEvents() {
        this.scrollMgr.bind();
        this.scrollMgr.onAfterScroll = () => {
            this.requestRender();
        };

        this.trackEvent(window, EVENT_NAMES.RESIZE, () => {
            this.#initCanvasSize(this.#userWidth, this.#userHeight);
            this.requestRender();
        });
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

        sheet.invalidateFreezeCache();

        const rc = sheet.rowColManager;
        const headerH = sheet.getHeaderHeight();
        const headerW = sheet.getHeaderWidth();
        const frozenRowsH = sheet.frozenRowsHeight;
        const frozenColsW = sheet.frozenColsWidth;

        const pc = sheet.pageContext;
        const isPaginationActive = pc.isActive;

        // 分页模式下冻结行处理：
        // - 第 1 页（pageStart == 0）：冻结行数据在当前页内，正常使用 frozenRowsH
        // - 第 2 页及以后（pageStart > 0）：冻结行不在当前页，冻结行高度计为 0
        const effectiveFrozenRowsH = isPaginationActive && pc.pageStart > 0 ? 0 : frozenRowsH;
        this.scrollMgr.updateScrollBounds(
            rc.totalWidth,
            rc.totalHeight,
            this.#viewW,
            this.#viewH,
            headerH,
            headerW,
            effectiveFrozenRowsH,
            frozenColsW,
        );

        this.wrap.style.setProperty("--header-height", `${headerH}px`);
        this.wrap.style.setProperty("--header-width", `${headerW}px`);

        const ctx = this.ctx;
        const viewW = this.#viewW;
        const viewH = this.#viewH;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;

        ctx.setTransform(CONFIG.DPR, 0, 0, CONFIG.DPR, 0, 0);
        ctx.clearRect(0, 0, viewW, viewH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        this.store.batch(() => {
            this.store.state.scroll.x = sx;
            this.store.state.scroll.y = sy;
            this.store.state.frozen.rows = sheet.fixedRowsTop;
            this.store.state.frozen.cols = sheet.fixedColumnsStart;
            this.store.state.frozenOffset.colsWidth = frozenColsW;
            this.store.state.frozenOffset.rowsHeight = frozenRowsH;
            this.store.state.viewport.width = viewW;
            this.store.state.viewport.height = viewH;

            const range = sheet.selection.getRange();
            const [focusRow, focusCol] = sheet.selection.getFocus();
            this.store.state.selection.activeRange = range;
            this.store.state.selection.focusRow = focusRow;
            this.store.state.selection.focusCol = focusCol;

            this.store.state.editor.visible = this.editor?.isVisible ?? false;
            this.store.state.editor.row = this.editor?.activeRow ?? -1;
            this.store.state.editor.col = this.editor?.activeCol ?? -1;
        });

        this.store.flush();

        const vt = this.#getViewportTransform();

        const composeOptions = {
            scrollX: sx,
            scrollY: sy,
            pageContext: pc,
        };

        this.compositor.compose(ctx, sheet, vt, viewW, viewH, composeOptions);

        this.scrollMgr.updateScrollbars(this.#viewW, this.#viewH);

        if (this.onAfterRender) {
            this.onAfterRender();
        }
    }

    #getViewportTransform() {
        const sheet = this.#currentSheet;
        if (!sheet) return null;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;
        const sheetKey = `${sheet.name}:${sheet.frozenColsWidth}:${sheet.frozenRowsHeight}:${sheet.getHeaderWidth()}:${sheet.getHeaderHeight()}`;
        if (!this.#cachedVT || this.#cachedVTSheetKey !== sheetKey || this.#cachedVT.scrollX !== sx || this.#cachedVT.scrollY !== sy) {
            this.#cachedVT = new ViewportTransform(sheet, sx, sy);
            this.#cachedVTSheetKey = sheetKey;
        }
        return this.#cachedVT;
    }

    getCellRect(row, col, mergeInfo = null) {
        const sheet = this.#currentSheet;
        if (!sheet || !sheet.rowColManager) return { x: 0, y: 0, w: 0, h: 0 };

        const vt = this.#getViewportTransform();

        if (mergeInfo) {
            const pageTopRow = sheet.toPageRow(mergeInfo.topRow);
            const pageBottomRow = sheet.toPageRow(mergeInfo.bottomRow);
            const pageMerge = { topRow: pageTopRow, topCol: mergeInfo.topCol, bottomRow: pageBottomRow, bottomCol: mergeInfo.bottomCol };
            return vt.mergeToViewRect(pageMerge);
        }

        return vt.cellToViewRect(row, col);
    }

    hitTest(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const sheet = this.#currentSheet;
        if (!sheet) return null;
        const vt = this.#getViewportTransform();
        const rc = sheet.rowColManager;
        const headerW = vt.headerW;
        const headerH = vt.headerH;

        if (px > this.#viewW || py > this.#viewH) return null;

        if (px >= 0 && px <= headerW && py >= 0 && py <= headerH) {
            return { type: HIT_TYPE.CORNER };
        }

        if (py >= 0 && py <= headerH && px > headerW) {
            const col = vt.viewXToCol(px);
            if (col >= 0 && col < rc.colCount) {
                return { type: HIT_TYPE.COL_HEADER, index: col };
            }
        }

        if (px >= 0 && px <= headerW && py > headerH) {
            const row = vt.viewYToRow(py);
            if (row >= 0 && row < rc.rowCount) {
                return { type: HIT_TYPE.ROW_HEADER, index: row };
            }
        }

        if (px > headerW && py > headerH) {
            const chartHit = this.chartLayer?.hitTest(px, py, sheet, vt);
            if (chartHit && chartHit.type === CONTENT_TYPE.CHART) {
                return { type: HIT_TYPE.CHART, ...chartHit };
            }
            const col = vt.viewXToCol(px);
            const row = vt.viewYToRow(py);
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
        const sheet = this.#currentSheet;
        if (!sheet) return null;
        const rc = sheet.rowColManager;
        const vt = this.#getViewportTransform();
        const headerW = vt.headerW;
        const headerH = vt.headerH;
        const hitArea = CONFIG.RESIZE_HIT_AREA;
        if (px > this.#viewW || py > this.#viewH) return null;

        if (py >= 0 && py <= headerH && px > headerW) {
            const dataX = vt.viewXToDataX(px);
            const col = rc.colAt(dataX);
            const colRight = vt.colRightToDataX(col);
            if (Math.abs(dataX - colRight) <= hitArea) {
                return { type: HIT_TYPE.COL_RESIZE, index: col };
            }
        }

        if (px >= 0 && px <= headerW && py > headerH) {
            const dataY = vt.viewYToDataY(py);
            const row = rc.rowAt(dataY);
            const rowBottom = vt.rowBottomToDataY(row);
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
        const sheet = this.#currentSheet;
        const range = sheet.selection.getRange();

        const vt = this.#getViewportTransform();
        const x2 = vt.colRightToViewX(range.bottomCol);
        const y2 = vt.rowBottomToViewY(range.bottomRow);

        const handleSize = SELECTION_CONFIG.FILL_HANDLE_HIT_SIZE;
        return px >= x2 - handleSize && px <= x2 && py >= y2 - handleSize && py <= y2;
    }

    scrollToCell(row, col) {
        const sheet = this.#currentSheet;
        const rc = sheet ? sheet.rowColManager : null;
        const frozenRowsH = sheet ? sheet.frozenRowsHeight : 0;
        const frozenColsW = sheet ? sheet.frozenColsWidth : 0;
        this.scrollMgr.scrollToCell(row, col, rc, frozenRowsH, frozenColsW);
    }

    get maxScrollX() {
        return this.scrollMgr.maxScrollX;
    }
    get maxScrollY() {
        return this.scrollMgr.maxScrollY;
    }

    invalidateAll() {
        this.tileLayer.markAllDirty();
        this.frozenLayer.markAllDirty();
        this.selectionLayer.markDirty();
        this.interactionLayer.markDirty();
        this.headerLayer.markDirty();
        this.chartLayer?.markDirty();
        this.requestRender();
    }

    invalidateCell(pageRow, col) {
        const rc = this.#currentSheet ? this.#currentSheet.rowColManager : null;
        this.tileLayer.markCellDirty(pageRow, col, rc);
        this.frozenLayer.markCellDirty(pageRow, col, rc);
        this.requestRender();
    }

    /** @override */
    onDestroy() {
        if (this.#rafId != null) {
            cancelAnimationFrame(this.#rafId);
        }
        this.compositor.destroyAll();
        this.store.destroy();
        this.canvas = null;
        this.ctx = null;
    }
}
