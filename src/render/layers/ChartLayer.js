import { BaseLayer } from "../BaseLayer.js";
import { LAYER_Z_INDEX } from "../../constants/layerZIndex.js";
import { ChartRendererFactory } from "../chart/ChartRendererFactory.js";
import { DataExtractor } from "../chart/DataExtractor.js";
import { ChartCache } from "../chart/ChartCache.js";
import { ChartCacheManager } from "../chart/ChartCacheManager.js";

const PADDING = { top: 36, right: 20, bottom: 44, left: 56 };

export class ChartLayer extends BaseLayer {
    #cache = new ChartCache();
    #cacheManager = null;
    #dataExtractor = new DataExtractor();
    #isRendering = false;
    #pendingCharts = new Set();

    constructor() {
        super("chart", LAYER_Z_INDEX.CHART, { offscreen: true });
    }

    bindSheet(sheet) {
        if (this.#cacheManager) this.#cacheManager.destroy();
        this.#cacheManager = new ChartCacheManager(sheet);
        this.markDirty();
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
            
            if (!isDirty) {
                const cached = this.#cache.get(chart.id);
                if (cached) {
                    const bounds = chart.getBounds(vt);
                    ctx.drawImage(cached.canvas, bounds.x, bounds.y, bounds.w, bounds.h);
                    continue;
                }
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
                return { type: "chart", chartId: chart.id, chart, bounds: chart.getBounds(vt) };
            }
        }
        return null;
    }

    invalidateChart(chartId) {
        this.#cache.invalidate(chartId);
        this.#pendingCharts.add(chartId);
        this.markDirty();
    }

    removeChartCache(chartId) {
        this.#cache.remove(chartId);
        this.#pendingCharts.delete(chartId);
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