export class ChartCache {
    #caches = new Map();
    #dpr = 1;

    constructor() {
        this.#dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    }

    getOrCreate(chartId, width, height) {
        let entry = this.#caches.get(chartId);
        const pw = Math.round(width * this.#dpr);
        const ph = Math.round(height * this.#dpr);
        if (entry && entry.canvas.width === pw && entry.canvas.height === ph) {
            return entry;
        }
        const canvas = document.createElement("canvas");
        canvas.width = pw;
        canvas.height = ph;
        if (canvas.style) {
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
        }
        const ctx = canvas.getContext("2d");
        ctx.scale(this.#dpr, this.#dpr);
        entry = { canvas, ctx, width, height };
        this.#caches.set(chartId, entry);
        return entry;
    }

    get(chartId) {
        return this.#caches.get(chartId) || null;
    }

    invalidate(chartId) {
        const entry = this.#caches.get(chartId);
        if (entry) {
            entry.ctx.clearRect(0, 0, entry.width, entry.height);
        }
    }

    remove(chartId) {
        const entry = this.#caches.get(chartId);
        if (entry) {
            entry.canvas.width = 0;
            entry.canvas.height = 0;
            this.#caches.delete(chartId);
        }
    }

    destroy() {
        this.#caches.forEach((entry) => {
            entry.canvas.width = 0;
            entry.canvas.height = 0;
        });
        this.#caches.clear();
    }
}
