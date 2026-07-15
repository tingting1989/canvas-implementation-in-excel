import { BaseLayer } from "../BaseLayer.js";
import { LAYER_Z_INDEX } from "../../constants/layerZIndex.js";
import { CONFIG } from "../../constants/config.js";
import { ChartRendererFactory } from "../chart/ChartRendererFactory.js";
import { DataExtractor } from "../chart/DataExtractor.js";
import { ChartCache } from "../chart/ChartCache.js";
import { ChartCacheManager } from "../chart/ChartCacheManager.js";
import { NativeChartRenderer } from "../chart/NativeChartRenderer.js";

const PADDING = { top: 36, right: 20, bottom: 44, left: 56 };
const HANDLE_SIZE = CONFIG.CHART_SELECTION_HANDLE_SIZE || 8;

export class ChartLayer extends BaseLayer {
    #cache = new ChartCache();
    #cacheManager = null;
    #dataExtractor = new DataExtractor();
    #isRendering = false;
    #isResizing = false;
    #pendingCharts = new Set();
    #selectedChartId = null;
    #hoverInfo = null;
    #hoverChartId = null;

    constructor() {
        super("chart", LAYER_Z_INDEX.CHART, { offscreen: true });
    }

    bindSheet(sheet) {
        if (this.#cacheManager) this.#cacheManager.destroy();
        this.#cacheManager = new ChartCacheManager(sheet);
        this.markDirty();
    }

    bindStore(store) {
        super.bindStore(store);
        this.watchForDirty("scroll");
        this.watchForDirty("viewport");
        this.watchForDirty("frozen");
        this.watchForDirty("frozenOffset");
    }

    get selectedChartId() {
        return this.#selectedChartId;
    }

    set selectedChartId(id) {
        if (this.#selectedChartId !== id) {
            this.#selectedChartId = id;
            this.markDirty();
        }
    }

    render(ctx, sheet, viewport, options = {}) {
        if (!sheet || !sheet.chartManager) return;

        const charts = sheet.chartManager.getAll();
        if (charts.length === 0) return;

        const vt = viewport || sheet.viewportTransform;
        const viewW = options.viewW || 0;
        const viewH = options.viewH || 0;

        const visibleCharts = [];

        for (const chart of charts) {
            const bounds = chart.getBounds(vt);
            if (bounds.x + bounds.w < 0 || bounds.y + bounds.h < 0) continue;
            if (bounds.x > viewW || bounds.y > viewH) continue;
            visibleCharts.push(chart);
        }

        for (const chart of visibleCharts) {
            const isDirty = this.#cacheManager ? this.#cacheManager.isDirty(chart.id) : true;

            const cached = this.#cache.get(chart.id);
            
            if (isDirty && this.#isResizing && cached) {
                const bounds = chart.getBounds(vt);
                ctx.drawImage(cached.canvas, bounds.x, bounds.y, bounds.w, bounds.h);
                this.#pendingCharts.add(chart.id);
                continue;
            }
            
            if (!isDirty && cached) {
                const bounds = chart.getBounds(vt);
                ctx.drawImage(cached.canvas, bounds.x, bounds.y, bounds.w, bounds.h);
                continue;
            }

            this.#pendingCharts.add(chart.id);
        }

        if (this.#pendingCharts.size > 0 && !this.#isRendering) {
            this.#renderPendingCharts(sheet);
        }

        for (const chart of visibleCharts) {
            const cached = this.#cache.get(chart.id);
            if (cached) {
                const bounds = chart.getBounds(vt);
                ctx.drawImage(cached.canvas, bounds.x, bounds.y, bounds.w, bounds.h);
            }
        }

        if (this.#selectedChartId) {
            const selectedChart = sheet.chartManager.get(this.#selectedChartId);
            if (selectedChart) {
                this.#renderSelectionOverlay(ctx, selectedChart, vt);
            }
        }

        if (this.#hoverInfo && this.#hoverChartId) {
            const chart = sheet.chartManager.get(this.#hoverChartId);
            if (chart && chart.style.showTooltip !== false) {
                const bounds = chart.getBounds(vt);
                NativeChartRenderer.renderTooltip(ctx, this.#hoverInfo, bounds, chart.style);
            }
        }
    }

    setHoverInfo(chartId, info) {
        if (this.#hoverChartId !== chartId || !this.#isEqual(this.#hoverInfo, info)) {
            this.#hoverChartId = chartId;
            this.#hoverInfo = info;
            this.markDirty();
        }
    }

    setIsResizing(isResizing) {
        this.#isResizing = isResizing;
    }

    #isEqual(a, b) {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return a.category === b.category && a.seriesName === b.seriesName && a.value === b.value;
    }
    #renderSelectionOverlay(ctx, chart, vt) {
        const b = chart.getBounds(vt);
        if (!b) return;

        ctx.save();
        ctx.strokeStyle = CONFIG.CHART_SELECTION_BORDER_COLOR || "#4472C4";
        ctx.lineWidth = CONFIG.CHART_SELECTION_BORDER_WIDTH || 1.5;
        ctx.setLineDash(CONFIG.UI_DASH_PATTERN || [5, 3]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.setLineDash([]);

        const handles = this.#getHandlePositions(b);
        const half = HANDLE_SIZE / 2;
        for (const pos of Object.values(handles)) {
            ctx.fillStyle = "#fff";
            ctx.strokeStyle = CONFIG.CHART_SELECTION_BORDER_COLOR || "#4472C4";
            ctx.lineWidth = 1;
            ctx.fillRect(pos.x - half, pos.y - half, HANDLE_SIZE, HANDLE_SIZE);
            ctx.strokeRect(pos.x - half, pos.y - half, HANDLE_SIZE, HANDLE_SIZE);
        }

        ctx.restore();
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

    async #renderPendingCharts(sheet) {
        if (this.#isRendering) return;
        this.#isRendering = true;

        const pendingIds = Array.from(this.#pendingCharts);
        this.#pendingCharts.clear();

        for (const chartId of pendingIds) {
            if (this.#pendingCharts.has(chartId)) continue;

            const chart = sheet.chartManager?.get(chartId);
            if (!chart) continue;

            await this.#renderToCache(chart, sheet);

            if (this.#cacheManager) {
                this.#cacheManager.markClean(chartId);
            }
        }

        this.#isRendering = false;
    this.#isResizing = false;
        this.markDirty();
        if (typeof this.onContentReady === "function") {
            this.onContentReady();
        }

        if (this.#pendingCharts.size > 0) {
            this.#renderPendingCharts(sheet);
        }
    }

    async #renderToCache(chart, sheet) {
        try {
            const entry = this.#cache.getOrCreate(chart.id, chart.width, chart.height);
            entry.ctx.clearRect(0, 0, chart.width, chart.height);

            const renderer = ChartRendererFactory.getRenderer(chart.type);
            if (!renderer) return;

            const data = await this.#dataExtractor.extract(chart, sheet);
            if (!data || !data.data || data.data.length === 0) return;

            const plotArea = {
                x: PADDING.left,
                y: PADDING.top,
                w: chart.width - PADDING.left - PADDING.right,
                h: chart.height - PADDING.top - PADDING.bottom,
            };

            renderer.render(entry.ctx, chart, data, plotArea, chart.style);
            chart._cachedData = data;
        } catch (e) {
            console.warn("[ChartLayer] Error rendering chart:", e);
        }
    }

    hitTest(px, py, sheet, vt) {
        if (!sheet || !sheet.chartManager) return null;
        const charts = sheet.chartManager.getAll();

        for (let i = charts.length - 1; i >= 0; i--) {
            const chart = charts[i];
            if (chart.containsPoint(px, py, vt)) {
                return { type: "chart", chartId: chart.id, chart, bounds: chart.getBounds(vt), vt };
            }
        }
        return null;
    }

    invalidateChart(chartId) {
        this.#cacheManager?.invalidateAll();
        this.#pendingCharts.add(chartId);
        this.markDirty();
    }

    invalidateChartData() {
        this.#cacheManager?.invalidateAll();
        this.markDirty();
    }

    removeChartCache(chartId) {
        this.#cache.remove(chartId);
        this.#pendingCharts.delete(chartId);
        this.markDirty();
    }

    markDirty() {
        super.markDirty();
    }

    destroy() {
        this.#cache.destroy();
        if (this.#cacheManager) this.#cacheManager.destroy();
        this.#dataExtractor.destroy();
        this.#pendingCharts.clear();
        super.destroy();
    }
}