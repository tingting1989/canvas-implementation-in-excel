export const CHART_TYPE = Object.freeze({
    BAR: "bar",
    LINE: "line",
    PIE: "pie",
    AREA: "area",
    SCATTER: "scatter",
});

const DEFAULT_COLORS = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47", "#264478", "#9B59B6"];

export class ChartModel {
    constructor(options = {}) {
        this.id = options.id || crypto.randomUUID();
        this.type = options.type || CHART_TYPE.BAR;
        this.anchorRow = options.anchorRow ?? 0;
        this.anchorCol = options.anchorCol ?? 0;
        this.offsetX = options.offsetX ?? 0;
        this.offsetY = options.offsetY ?? 0;
        this.width = options.width ?? 400;
        this.height = options.height ?? 300;
        this.dataRange = options.dataRange || null;
        this.style = {
            title: "",
            showLegend: true,
            showGrid: true,
            colors: [...DEFAULT_COLORS],
            ignoreHiddenData: false,
            ...options.style,
        };
        this._cachedData = null;
        this._cacheVersion = -1;
    }

    getBounds(viewport) {
        if (!viewport) {
            return { x: this.offsetX, y: this.offsetY, w: this.width, h: this.height };
        }
        const anchorX = viewport.colToViewX(this.anchorCol);
        const anchorY = viewport.rowToViewY(this.anchorRow);
        return {
            x: anchorX + this.offsetX,
            y: anchorY + this.offsetY,
            w: this.width,
            h: this.height,
        };
    }

    containsPoint(px, py, viewport) {
        const b = this.getBounds(viewport);
        return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            anchorRow: this.anchorRow,
            anchorCol: this.anchorCol,
            offsetX: this.offsetX,
            offsetY: this.offsetY,
            width: this.width,
            height: this.height,
            dataRange: this.dataRange,
            style: { ...this.style },
        };
    }

    static fromJSON(json) {
        return new ChartModel(json);
    }
}
