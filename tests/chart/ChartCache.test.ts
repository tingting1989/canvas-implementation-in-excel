import { describe, it, expect, beforeEach } from "vitest";
import { ChartCache } from "@/render/chart/ChartCache";

describe("ChartCache", () => {
    let cache: ChartCache;

    beforeEach(() => {
        cache = new ChartCache();
    });

    it("getOrCreate creates a new cache entry", () => {
        const entry = cache.getOrCreate("chart1", 400, 300);
        expect(entry).toBeDefined();
        expect(entry.width).toBe(400);
        expect(entry.height).toBe(300);
        expect(entry.canvas).toBeInstanceOf(HTMLCanvasElement);
        expect(entry.ctx).toBeDefined();
    });

    it("getOrCreate returns same entry for same id and size", () => {
        const entry1 = cache.getOrCreate("chart1", 400, 300);
        const entry2 = cache.getOrCreate("chart1", 400, 300);
        expect(entry1.canvas).toBe(entry2.canvas);
    });

    it("getOrCreate creates new canvas when size changes", () => {
        const entry1 = cache.getOrCreate("chart1", 400, 300);
        const entry2 = cache.getOrCreate("chart1", 500, 400);
        expect(entry1.canvas).not.toBe(entry2.canvas);
        expect(entry2.width).toBe(500);
        expect(entry2.height).toBe(400);
    });

    it("get returns null for non-existent id", () => {
        const result = cache.get("non-existent");
        expect(result).toBeNull();
    });

    it("get returns entry for existing id", () => {
        cache.getOrCreate("chart1", 400, 300);
        const entry = cache.get("chart1");
        expect(entry).not.toBeNull();
        expect(entry!.width).toBe(400);
    });

    it("invalidate clears canvas content", () => {
        const entry = cache.getOrCreate("chart1", 400, 300);
        const clearRectSpy = vi.spyOn(entry.ctx, "clearRect");
        cache.invalidate("chart1");
        expect(clearRectSpy).toHaveBeenCalledWith(0, 0, 400, 300);
    });

    it("invalidate does nothing for non-existent id", () => {
        expect(() => cache.invalidate("non-existent")).not.toThrow();
    });

    it("remove deletes cache entry", () => {
        cache.getOrCreate("chart1", 400, 300);
        cache.remove("chart1");
        expect(cache.get("chart1")).toBeNull();
    });

    it("destroy clears all entries", () => {
        cache.getOrCreate("chart1", 400, 300);
        cache.getOrCreate("chart2", 500, 400);
        cache.destroy();
        expect(cache.get("chart1")).toBeNull();
        expect(cache.get("chart2")).toBeNull();
    });
});