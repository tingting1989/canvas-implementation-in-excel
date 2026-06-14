import { CONFIG } from "../core/constants.js";

export class Tile {
    constructor(tileRow, tileCol, dpr = 1) {
        this.tileRow = tileRow;
        this.tileCol = tileCol;
        this.dirty = true;
        this.lastUsed = 0;
        this.dpr = dpr;
        this.canvas = document.createElement("canvas");
        this.canvas.width = CONFIG.TILE_SIZE * dpr;
        this.canvas.height = CONFIG.TILE_SIZE * dpr;
        this.ctx = this.canvas.getContext("2d");
        this.ctx.scale(dpr, dpr);
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