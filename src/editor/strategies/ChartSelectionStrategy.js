import { EventStrategy } from "./EventStrategy.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { CONFIG } from "../../constants/config.js";

const DRAG_THRESHOLD = 3;

export class ChartSelectionStrategy extends EventStrategy {
    priority = 120;

    #selectedChartId = null;
    #isMoving = false;
    #isDragging = false;
    #isResizing = false;
    #resizeHandle = null;
    #dragStartX = 0;
    #dragStartY = 0;
    #dragStartOffsetX = 0;
    #dragStartOffsetY = 0;
    #dragStartWidth = 0;
    #dragStartHeight = 0;
    #mouseDownX = 0;
    #mouseDownY = 0;
    #lastRenderTime = 0;
    #pendingUpdate = null;
    #lastClientX = 0;
    #lastClientY = 0;

    constructor(handler) {
        super(handler);
    }

    init() {}

    destroy() {
        if (this.#pendingUpdate) {
            cancelAnimationFrame(this.#pendingUpdate);
            this.#pendingUpdate = null;
        }
        this.#selectedChartId = null;
        this.#isMoving = false;
        this.#isDragging = false;
        this.#isResizing = false;
    }

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#onMouseDown(e),
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (e) => this.#onHover(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e) => this.#onMouseMove(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e) => this.#onMouseUp(e),
            [DELEGATE_KEYS.DOCUMENT_KEYDOWN]: (e) => this.#onKeyDown(e),
        };
    }

    #getChartManager() {
        return this.handler.sheet?.chartManager || null;
    }

    #onMouseDown(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit || hit.type !== HIT_TYPE.CHART) {
            if (this.#selectedChartId) {
                this.#deselect();
                return true;
            }
            return;
        }

        const chart = hit.chart;
        if (!chart) return;

        this.#isMoving = true;
        this.#isDragging = false;
        this.#isResizing = false;
        this.#selectedChartId = chart.id;

        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        const handle = this.#hitHandle(px, py, chart, hit.bounds);
        if (handle) {
            this.#resizeHandle = handle;
        }

        this.#mouseDownX = e.clientX;
        this.#mouseDownY = e.clientY;
        this.#dragStartX = px;
        this.#dragStartY = py;
        this.#dragStartOffsetX = chart.offsetX;
        this.#dragStartOffsetY = chart.offsetY;
        this.#dragStartWidth = chart.width;
        this.#dragStartHeight = chart.height;

        this.handler.viewport.invalidateAll();
        this.handler.render();

        return false;
    }

    #onHover(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (this.#isMoving) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (hit && hit.type === HIT_TYPE.CHART) {
            const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const handle = this.#hitHandle(px, py, hit.chart, hit.bounds);
            this.handler.canvasContext.canvas.style.cursor = handle ? this.#getCursorForHandle(handle) : "move";
            return false;
        }
    }

    #onMouseMove(e) {
        if (!this.#isMoving) return;

        if (!this.#isDragging && !this.#isResizing) {
            const dx = Math.abs(e.clientX - this.#mouseDownX);
            const dy = Math.abs(e.clientY - this.#mouseDownY);
            if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;

            if (this.#resizeHandle) {
                this.#isResizing = true;
            } else {
                this.#isDragging = true;
            }
        }

        const now = performance.now();
        if (now - this.#lastRenderTime < 16) {
            this.#lastClientX = e.clientX;
            this.#lastClientY = e.clientY;
            if (!this.#pendingUpdate) {
                this.#pendingUpdate = requestAnimationFrame(() => {
                    this.#pendingUpdate = null;
                    this.#processMove(this.#lastClientX, this.#lastClientY);
                });
            }
            return false;
        }

        this.#lastRenderTime = now;
        this.#processMove(e.clientX, e.clientY);
        return false;
    }

    #processMove(clientX, clientY) {
        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const dx = px - this.#dragStartX;
        const dy = py - this.#dragStartY;

        const cm = this.#getChartManager();
        if (!cm) return;

        if (this.#isDragging) {
            cm.update(this.#selectedChartId, {
                offsetX: this.#dragStartOffsetX + dx,
                offsetY: this.#dragStartOffsetY + dy,
            });
            this.handler.canvasContext.canvas.style.cursor = "move";
        } else if (this.#isResizing) {
            let newW = this.#dragStartWidth;
            let newH = this.#dragStartHeight;
            const h = this.#resizeHandle;
            if (h.includes("e")) newW = Math.max(CONFIG.CHART_MIN_WIDTH, this.#dragStartWidth + dx);
            if (h.includes("w")) newW = Math.max(CONFIG.CHART_MIN_WIDTH, this.#dragStartWidth - dx);
            if (h.includes("s")) newH = Math.max(CONFIG.CHART_MIN_HEIGHT, this.#dragStartHeight + dy);
            if (h.includes("n")) newH = Math.max(CONFIG.CHART_MIN_HEIGHT, this.#dragStartHeight - dy);
            cm.update(this.#selectedChartId, { width: newW, height: newH });
            this.handler.canvasContext.canvas.style.cursor = this.#getCursorForHandle(h);
        }

        this.handler.viewport.invalidateAll();
        this.handler.render();
    }

    #onMouseUp(e) {
        if (!this.#isMoving) return;
        this.#isMoving = false;
        this.#isDragging = false;
        this.#isResizing = false;
        this.#resizeHandle = null;
        this.handler.canvasContext.canvas.style.cursor = "";

        if (this.#pendingUpdate) {
            cancelAnimationFrame(this.#pendingUpdate);
            this.#pendingUpdate = null;
        }

        this.handler.viewport.invalidateAll();
        this.handler.render();
    }

    #onKeyDown(e) {
        if (!this.#selectedChartId) return;
        if (e.key === "Delete" || e.key === "Backspace") {
            const cm = this.#getChartManager();
            if (cm) {
                cm.remove(this.#selectedChartId);
                this.#selectedChartId = null;
            }
            this.handler.viewport.invalidateAll();
            this.handler.render();
            return false;
        }
        if (e.key === "Escape") {
            this.#deselect();
            return false;
        }
    }

    #deselect() {
        this.#selectedChartId = null;
        this.handler.viewport.invalidateAll();
        this.handler.render();
    }

    #hitHandle(px, py, chart, bounds) {
        const b = bounds;
        if (!b) return null;
        const handles = this.#getHandlePositions(b);
        const half = CONFIG.CHART_SELECTION_HANDLE_SIZE / 2;
        for (const [name, pos] of Object.entries(handles)) {
            if (
                px >= pos.x - half &&
                px <= pos.x + half &&
                py >= pos.y - half &&
                py <= pos.y + half
            ) {
                return name;
            }
        }
        return null;
    }

    #getHandlePositions(b) {
        const mx = b.x + b.w / 2;
        const my = b.y + b.h / 2;
        return {
            nw: { x: b.x, y: b.y },
            n: { x: mx, y: b.y },
            ne: { x: b.x + b.w, y: b.y },
            e: { x: b.x + b.w, y: my },
            se: { x: b.x + b.w, y: b.y + b.h },
            s: { x: mx, y: b.y + b.h },
            sw: { x: b.x, y: b.y + b.h },
            w: { x: b.x, y: my },
        };
    }

    #getCursorForHandle(handle) {
        const cursorMap = {
            nw: "nwse-resize",
            se: "nwse-resize",
            ne: "nesw-resize",
            sw: "nesw-resize",
            n: "ns-resize",
            s: "ns-resize",
            e: "ew-resize",
            w: "ew-resize",
        };
        return cursorMap[handle] || "default";
    }

    renderSelectionOverlay(ctx, chart, vt) {
        if (!this.#selectedChartId || !chart || chart.id !== this.#selectedChartId) return;
        const b = chart.getBounds(vt);
        if (!b) return;
        ctx.save();
        ctx.strokeStyle = CONFIG.CHART_SELECTION_BORDER_COLOR;
        ctx.lineWidth = CONFIG.CHART_SELECTION_BORDER_WIDTH;
        ctx.setLineDash(CONFIG.UI_DASH_PATTERN);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.setLineDash([]);
        const handles = this.#getHandlePositions(b);
        const half = CONFIG.CHART_SELECTION_HANDLE_SIZE / 2;
        for (const pos of Object.values(handles)) {
            ctx.fillStyle = CONFIG.CHART_SELECTION_HANDLE_FILL;
            ctx.strokeStyle = CONFIG.CHART_SELECTION_BORDER_COLOR;
            ctx.lineWidth = CONFIG.CHART_SELECTION_HANDLE_LINE_WIDTH;
            ctx.fillRect(
                pos.x - half,
                pos.y - half,
                CONFIG.CHART_SELECTION_HANDLE_SIZE,
                CONFIG.CHART_SELECTION_HANDLE_SIZE
            );
            ctx.strokeRect(
                pos.x - half,
                pos.y - half,
                CONFIG.CHART_SELECTION_HANDLE_SIZE,
                CONFIG.CHART_SELECTION_HANDLE_SIZE
            );
        }
        ctx.restore();
    }

    get selectedChartId() {
        return this.#selectedChartId;
    }
}
