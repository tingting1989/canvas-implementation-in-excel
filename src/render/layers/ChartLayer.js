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

    constructor() {
        super("chart", LAYER_Z_INDEX.CHART, { offscreen: true });
    }

    bindSheet(sheet) {
        if (this.#cacheManager) this.#cacheManager.destroy();
        this.#cacheManager = new ChartCacheManager(sheet);
    }

    render(ctx, sheet, viewport) {
        if (!sheet || !sheet.chartManager) return;
        const charts = sheet.chartManager.getAll();
        if (charts.length === 0) return;

        const vt = viewport || sheet.viewportTransform;
        const viewW = vt.viewW || 0;
        const viewH = vt.viewH || 0;

        for (const chart of charts) {
            const bounds = chart.getBounds(vt);
            if (bounds.x + bounds.w < 0 || bounds.y + bounds.h < 0) continue;
            if (bounds.x > viewW || bounds.y > viewH) continue;

            const isDirty = this.#cacheManager ? this.#cacheManager.isDirty(chart.id) : true;

            if (!isDirty) {
                const cached = this.#cache.get(chart.id);
                if (cached) {
                    ctx.drawImage(cached.canvas, bounds.x, bounds.y, bounds.w, bounds.h);
                    continue;
                }
            }

            this.#renderToCache(chart, sheet);
            const cached = this.#cache.get(chart.id);
            if (cached) {
                ctx.drawImage(cached.canvas, bounds.x, bounds.y, bounds.w, bounds.h);
            }
            if (this.#cacheManager) this.#cacheManager.markClean(chart.id);
        }
    }

    async #renderToCache(chart, sheet) {
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
    }

    hitTest(px, py, sheet, vt) {
        if (!sheet || !sheet.chartManager) return null;
        const charts = sheet.chartManager.getAll();

        for (let i = charts.length - 1; i >= 0; i--) {
            const chart = charts[i];
            if (chart.containsPoint(px, py, vt)) {
                return { type: "chart", chartId: chart.id, chart };
            }
        }
        return null;
    }

    invalidateChart(chartId) {
        this.#cache.invalidate(chartId);
        this.markDirty();
    }

    removeChartCache(chartId) {
        this.#cache.remove(chartId);
    }

    markDirty() {
        super.markDirty();
    }

    destroy() {
        this.#cache.destroy();
        if (this.#cacheManager) this.#cacheManager.destroy();
        this.#dataExtractor.destroy();
        super.destroy();
    }
}
