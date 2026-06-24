import { describe, it, expect, vi, beforeEach } from "vitest";
import { Tile } from "../../src/render/Tile.js";

describe("Tile", () => {
    it("should create tile with correct row and col", () => {
        const tile = new Tile(3, 5);
        expect(tile.tileRow).toBe(3);
        expect(tile.tileCol).toBe(5);
    });

    it("should be dirty on creation", () => {
        const tile = new Tile(0, 0);
        expect(tile.dirty).toBe(true);
    });

    it("should create canvas element", () => {
        const tile = new Tile(0, 0);
        expect(tile.canvas).toBeDefined();
        expect(tile.ctx).toBeDefined();
    });

    it("should set canvas physical size based on DPR and TILE_SIZE", () => {
        const tile = new Tile(0, 0);
        expect(tile.canvas.width).toBeGreaterThan(0);
        expect(tile.canvas.height).toBeGreaterThan(0);
    });

    it("should cache DPR from CONFIG", () => {
        const tile = new Tile(0, 0);
        expect(tile.dpr).toBeGreaterThan(0);
    });

    it("should return correct key", () => {
        const tile = new Tile(3, 7);
        expect(tile.getKey()).toBe("3:7");
    });

    it("should return key for tile at origin", () => {
        const tile = new Tile(0, 0);
        expect(tile.getKey()).toBe("0:0");
    });

    it("should mark dirty", () => {
        const tile = new Tile(0, 0);
        tile.dirty = false;
        tile.markDirty();
        expect(tile.dirty).toBe(true);
    });

    it("should mark dirty when already dirty", () => {
        const tile = new Tile(0, 0);
        tile.markDirty();
        expect(tile.dirty).toBe(true);
    });

    it("should clear canvas and mark dirty", () => {
        const tile = new Tile(0, 0);
        tile.dirty = false;
        const clearRectSpy = vi.spyOn(tile.ctx, "clearRect");
        tile.clear();
        expect(clearRectSpy).toHaveBeenCalled();
        expect(tile.dirty).toBe(true);
        clearRectSpy.mockRestore();
    });

    it("should destroy canvas and release resources", () => {
        const tile = new Tile(0, 0);
        tile.destroy();
        expect(tile.canvas).toBeNull();
        expect(tile.ctx).toBeNull();
    });

    it("should handle destroy when already destroyed", () => {
        const tile = new Tile(0, 0);
        tile.destroy();
        expect(() => tile.destroy()).not.toThrow();
    });

    it("should set canvas width/height to 0 on destroy", () => {
        const tile = new Tile(0, 0);
        const canvas = tile.canvas;
        tile.destroy();
        expect(canvas.width).toBe(0);
        expect(canvas.height).toBe(0);
    });

    it("should create independent tiles", () => {
        const tile1 = new Tile(0, 0);
        const tile2 = new Tile(1, 0);
        expect(tile1.canvas).not.toBe(tile2.canvas);
        expect(tile1.ctx).not.toBe(tile2.ctx);
    });

    it("should handle large tile coordinates", () => {
        const tile = new Tile(9999, 9999);
        expect(tile.tileRow).toBe(9999);
        expect(tile.tileCol).toBe(9999);
        expect(tile.getKey()).toBe("9999:9999");
    });
});