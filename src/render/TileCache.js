import { CONFIG } from "../core/constants.js";
import { Tile } from "./Tile.js";

export class TileCache {
    constructor(dpr = 1) {
        this.tiles = new Map();
        this.maxSize = CONFIG.TILE_CACHE_MAX;
        this.dpr = dpr;
    }

    get(tileRow, tileCol) {
        const key = `${tileRow}:${tileCol}`;
        const tile = this.tiles.get(key);
        if (tile) {
            tile.touch();
        }
        return tile || null;
    }

    getOrCreate(tileRow, tileCol) {
        const key = `${tileRow}:${tileCol}`;
        let tile = this.tiles.get(key);
        if (tile) {
            tile.touch();
            return tile;
        }
        this.#evictIfNeeded();
        tile = new Tile(tileRow, tileCol, this.dpr);
        this.tiles.set(key, tile);
        return tile;
    }

    markDirty(tileRow, tileCol) {
        const key = `${tileRow}:${tileCol}`;
        const tile = this.tiles.get(key);
        if (tile) {
            tile.markDirty();
        }
    }

    markAllDirty() {
        for (const tile of this.tiles.values()) {
            tile.markDirty();
        }
    }

    invalidateRegion(startRow, startCol, endRow, endCol) {
        const tileSize = CONFIG.TILE_SIZE;
        for (const [key, tile] of this.tiles) {
            const tileStartRow = tile.tileRow;
            const tileStartCol = tile.tileCol;
            const tileEndRow = tileStartRow + tileSize;
            const tileEndCol = tileStartCol + tileSize;
            if (tileEndRow >= startRow && tileStartRow <= endRow &&
                tileEndCol >= startCol && tileStartCol <= endCol) {
                tile.markDirty();
            }
        }
    }

    remove(tileRow, tileCol) {
        const key = `${tileRow}:${tileCol}`;
        const tile = this.tiles.get(key);
        if (tile) {
            tile.destroy();
            this.tiles.delete(key);
        }
    }

    clear() {
        for (const tile of this.tiles.values()) {
            tile.destroy();
        }
        this.tiles.clear();
    }

    get size() {
        return this.tiles.size;
    }

    #evictIfNeeded() {
        if (this.tiles.size < this.maxSize) return;
        let oldest = null;
        let oldestTime = Infinity;
        for (const [key, tile] of this.tiles) {
            if (tile.lastUsed < oldestTime) {
                oldestTime = tile.lastUsed;
                oldest = key;
            }
        }
        if (oldest) {
            const tile = this.tiles.get(oldest);
            if (tile) tile.destroy();
            this.tiles.delete(oldest);
        }
    }
}