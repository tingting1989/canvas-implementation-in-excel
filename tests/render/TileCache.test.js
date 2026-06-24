import { describe, it, expect, vi, beforeEach } from "vitest";
import { TileCache } from "../../src/render/TileCache.js";
import { Tile } from "../../src/render/Tile.js";

describe("TileCache", () => {
    let cache;

    beforeEach(() => {
        cache = new TileCache();
    });

    it("should start with zero tiles", () => {
        expect(cache.size).toBe(0);
    });

    it("should create tile on getOrCreate", () => {
        const tile = cache.getOrCreate(0, 0);
        expect(tile).toBeInstanceOf(Tile);
        expect(tile.tileRow).toBe(0);
        expect(tile.tileCol).toBe(0);
        expect(cache.size).toBe(1);
    });

    it("should return same tile on second getOrCreate", () => {
        const tile1 = cache.getOrCreate(0, 0);
        const tile2 = cache.getOrCreate(0, 0);
        expect(tile1).toBe(tile2);
        expect(cache.size).toBe(1);
    });

    it("should return null for non-existent tile on get", () => {
        expect(cache.get(0, 0)).toBeNull();
    });

    it("should return cached tile on get", () => {
        const created = cache.getOrCreate(0, 0);
        const retrieved = cache.get(0, 0);
        expect(retrieved).toBe(created);
    });

    it("should mark single tile dirty", () => {
        const tile = cache.getOrCreate(0, 0);
        tile.dirty = false;
        cache.markDirty(0, 0);
        expect(tile.dirty).toBe(true);
    });

    it("should mark all tiles dirty", () => {
        const a = cache.getOrCreate(0, 0);
        const b = cache.getOrCreate(1, 1);
        a.dirty = false;
        b.dirty = false;
        cache.markAllDirty();
        expect(a.dirty).toBe(true);
        expect(b.dirty).toBe(true);
    });

    it("should remove tile", () => {
        cache.getOrCreate(0, 0);
        cache.remove(0, 0);
        expect(cache.size).toBe(0);
        expect(cache.get(0, 0)).toBeNull();
    });

    it("should clear all tiles", () => {
        cache.getOrCreate(0, 0);
        cache.getOrCreate(1, 1);
        cache.getOrCreate(2, 2);
        cache.clear();
        expect(cache.size).toBe(0);
    });

    it("should evict tiles when exceeding maxSize", () => {
        cache.maxSize = 4;
        cache.getOrCreate(0, 0);
        cache.getOrCreate(1, 0);
        cache.getOrCreate(2, 0);
        cache.getOrCreate(3, 0);
        expect(cache.size).toBe(4);

        cache.getOrCreate(4, 0);
        expect(cache.size).toBeLessThanOrEqual(4);
    });

    it("should evict least recently used tiles first", () => {
        cache.maxSize = 3;
        const tile0 = cache.getOrCreate(0, 0);
        const tile1 = cache.getOrCreate(1, 0);
        const tile2 = cache.getOrCreate(2, 0);

        cache.get(0, 0);

        cache.getOrCreate(3, 0);

        expect(cache.get(1, 0)).toBeNull();
        expect(cache.get(0, 0)).toBe(tile0);
        expect(cache.get(2, 0)).toBe(tile2);
    });

    it("should invalidate region", () => {
        cache.getOrCreate(0, 0);
        cache.getOrCreate(1, 0);
        cache.getOrCreate(0, 1);
        cache.getOrCreate(1, 1);

        for (const node of cache.tiles.values()) {
            node.tile.dirty = false;
        }

        cache.invalidateRegion(0, 0, 256, 256);

        const t00 = cache.get(0, 0);
        const t10 = cache.get(1, 0);
        const t01 = cache.get(0, 1);
        const t11 = cache.get(1, 1);

        expect(t00.dirty).toBe(true);
    });
});