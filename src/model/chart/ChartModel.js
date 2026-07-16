import { CHART_TYPE } from "@/constants/enums/ChartType";

export { CHART_TYPE };

const DEFAULT_COLORS = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc"];

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
            showTooltip: true,
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
