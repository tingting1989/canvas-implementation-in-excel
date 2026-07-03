import { EventStrategy } from "./EventStrategy.js";
import { CONFIG } from "../../constants/config.js";
import { CONTENT_TYPE } from "../../constants/enums/ContentType.js";

export class ChartSelectionStrategy extends EventStrategy {
    priority = 120;

    #selectedChartId = null;
    #isDragging = false;
    #isResizing = false;
    #resizeHandle = null;
    #dragStartX = 0;
    #dragStartY = 0;
    #dragStartOffsetX = 0;
    #dragStartOffsetY = 0;
    #dragStartWidth = 0;
    #dragStartHeight = 0;

    constructor(handler) {
        super(handler);
    }

    getEventHandlers() {
        return {
            "canvas:mousedown": (e) => this.#onMouseDown(e),
            "document:mousemove": (e) => this.#onMouseMove(e),
            "document:mouseup": (e) => this.#onMouseUp(e),
            "document:keydown": (e) => this.#onKeyDown(e),
        };
    }

    #getChartLayer() {
        return this.handler?.renderEngine?.chartLayer;
    }

    #getChartPlugin() {
        return this.handler?.workbook?.getPlugin?.("chart");
    }

    #getSheet() {
        return this.handler?.workbook?.activeSheet;
    }

    #getViewport() {
        return this.handler?.renderEngine?.getViewportTransform?.();
    }

    #onMouseDown(e) {
        const sheet = this.#getSheet();
        if (!sheet || !sheet.chartManager) return false;
        const chartLayer = this.#getChartLayer();
        if (!chartLayer) return false;

        const { px, py } = this.#getCoords(e);
        const vt = this.#getViewport();
        const hit = chartLayer.hitTest(px, py, sheet, vt);

        if (!hit || hit.type !== CONTENT_TYPE.CHART) {
            if (this.#selectedChartId) {
                this.#deselect();
                return true;
            }
            return false;
        }

        const chart = hit.chart;
        this.#selectedChartId = chart.id;

        const handle = this.#hitHandle(px, py, chart, vt);
        if (handle) {
            this.#isResizing = true;
            this.#resizeHandle = handle;
        } else {
            this.#isDragging = true;
        }

        this.#dragStartX = px;
        this.#dragStartY = py;
        this.#dragStartOffsetX = chart.offsetX;
        this.#dragStartOffsetY = chart.offsetY;
        this.#dragStartWidth = chart.width;
        this.#dragStartHeight = chart.height;

        const plugin = this.#getChartPlugin();
        if (plugin) plugin.selectChart(chart.id);

        return true;
    }

    #onMouseMove(e) {
        if (!this.#isDragging && !this.#isResizing) return false;

        const { px, py } = this.#getCoords(e);
        const dx = px - this.#dragStartX;
        const dy = py - this.#dragStartY;
        const plugin = this.#getChartPlugin();
        if (!plugin) return false;

        if (this.#isDragging) {
            plugin.moveChart(this.#selectedChartId, undefined, undefined, this.#dragStartOffsetX + dx, this.#dragStartOffsetY + dy);
        } else if (this.#isResizing) {
            let newW = this.#dragStartWidth;
            let newH = this.#dragStartHeight;
            const h = this.#resizeHandle;
            if (h.includes("e")) newW = Math.max(100, this.#dragStartWidth + dx);
            if (h.includes("w")) newW = Math.max(100, this.#dragStartWidth - dx);
            if (h.includes("s")) newH = Math.max(80, this.#dragStartHeight + dy);
            if (h.includes("n")) newH = Math.max(80, this.#dragStartHeight - dy);
            plugin.resizeChart(this.#selectedChartId, newW, newH);
        }

        return true;
    }

    #onMouseUp(e) {
        if (!this.#isDragging && !this.#isResizing) return false;
        this.#isDragging = false;
        this.#isResizing = false;
        this.#resizeHandle = null;
        return true;
    }

    #onKeyDown(e) {
        if (!this.#selectedChartId) return false;
        if (e.key === "Delete" || e.key === "Backspace") {
            const plugin = this.#getChartPlugin();
            if (plugin) {
                plugin.removeChart(this.#selectedChartId);
                this.#selectedChartId = null;
            }
            return true;
        }
        if (e.key === "Escape") {
            this.#deselect();
            return true;
        }
        return false;
    }

    #deselect() {
        this.#selectedChartId = null;
        const plugin = this.#getChartPlugin();
        if (plugin) plugin.deselectChart();
    }

    #getCoords(e) {
        const canvas = this.handler?.renderEngine?.canvas;
        if (!canvas) return { px: 0, py: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            px: (e.clientX || 0) - rect.left,
            py: (e.clientY || 0) - rect.top,
        };
    }

    #hitHandle(px, py, chart, vt) {
        const b = chart.getBounds(vt);
        const handles = this.#getHandlePositions(b);
        const half = CONFIG.CHART_SELECTION_HANDLE_SIZE / 2;
        for (const [name, pos] of Object.entries(handles)) {
            if (px >= pos.x - half && px <= pos.x + half && py >= pos.y - half && py <= pos.y + half) {
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

    renderSelectionOverlay(ctx, chart, vt) {
        if (!this.#selectedChartId || !chart || chart.id !== this.#selectedChartId) return;
        const b = chart.getBounds(vt);
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
            ctx.fillRect(pos.x - half, pos.y - half, CONFIG.CHART_SELECTION_HANDLE_SIZE, CONFIG.CHART_SELECTION_HANDLE_SIZE);
            ctx.strokeRect(pos.x - half, pos.y - half, CONFIG.CHART_SELECTION_HANDLE_SIZE, CONFIG.CHART_SELECTION_HANDLE_SIZE);
        }
        ctx.restore();
    }

    get selectedChartId() {
        return this.#selectedChartId;
    }

    destroy() {
        this.#selectedChartId = null;
        this.#isDragging = false;
        this.#isResizing = false;
        super.destroy();
    }
}