import { CONFIG } from "../constants/config";

export class Tile {
    constructor(tileRow, tileCol) {
        this.tileRow = tileRow;
        this.tileCol = tileCol;
        this.dirty = true;
        this.lastUsed = 0;
        this.dpr = CONFIG.DPR;
        this.canvas = document.createElement("canvas");
        this.canvas.width = CONFIG.TILE_SIZE * CONFIG.DPR;
        this.canvas.height = CONFIG.TILE_SIZE * CONFIG.DPR;
        this.ctx = this.canvas.getContext("2d");
        this.ctx.scale(CONFIG.DPR, CONFIG.DPR);
    }

    getKey() {
        return `${this.tileRow}:${this.tileCol}`;
    }

    markDirty() {
        this.dirty = true;
    }

    touch() {
        this.lastUsed = performance.now();
    }

    clear() {
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.ctx.clearRect(0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
        this.dirty = true;
    }

    destroy() {
        this.canvas.width = 0;
        this.canvas.height = 0;
        this.ctx = null;
        this.canvas = null;
    }
}
