import { describe, it, expect, vi, beforeEach } from "vitest";
import { TileCache } from "../../src/render/TileCache.js";
import { Tile } from "../../src/render/Tile.js";

vi.mock("../../src/constants/config.js", () => ({
    CONFIG: {
        TILE_SIZE: 256,
        TILE_CACHE_MAX: 5,
        DPR: 1,
    },
}));

describe("TileCache - Bug Hunting", () => {
    let cache;

    beforeEach(() => {
        cache = new TileCache();
    });

    describe("LRU淘汰一致性", () => {
        it("BUG: 淘汰的瓦片应从tiles Map中移除", () => {
            for (let i = 0; i < 6; i++) {
                cache.getOrCreate(0, i);
            }

            expect(cache.tiles.has("0:0")).toBe(false);
            expect(cache.size).toBe(5);
        });

        it("BUG: 淘汰后get应返回null", () => {
            const tile = cache.getOrCreate(0, 0);
            for (let i = 1; i < 6; i++) {
                cache.getOrCreate(0, i);
            }

            const result = cache.get(0, 0);
            expect(result).toBeNull();
        });

        it("BUG: get应将瓦片移到LRU尾部（避免被淘汰）", () => {
            cache.getOrCreate(0, 0);
            cache.getOrCreate(0, 1);
            cache.getOrCreate(0, 2);
            cache.getOrCreate(0, 3);
            cache.getOrCreate(0, 4);

            cache.get(0, 0);

            cache.getOrCreate(0, 5);

            expect(cache.get(0, 0)).not.toBeNull();
            expect(cache.get(0, 1)).toBeNull();
        });

        it("BUG: 淘汰的瓦片应调用destroy", () => {
            const tile = cache.getOrCreate(0, 0);
            const destroySpy = vi.spyOn(tile, "destroy");

            for (let i = 1; i < 6; i++) {
                cache.getOrCreate(0, i);
            }

            expect(destroySpy).toHaveBeenCalled();
        });
    });

    describe("getOrCreate - 幂等性", () => {
        it("BUG: 同一位置多次getOrCreate应返回同一瓦片", () => {
            const tile1 = cache.getOrCreate(0, 0);
            const tile2 = cache.getOrCreate(0, 0);

            expect(tile1).toBe(tile2);
        });

        it("BUG: getOrCreate不应增加已存在瓦片的缓存数", () => {
            cache.getOrCreate(0, 0);
            const sizeBefore = cache.size;

            cache.getOrCreate(0, 0);

            expect(cache.size).toBe(sizeBefore);
        });
    });

    describe("markDirty - 脏标记", () => {
        it("BUG: markDirty应将瓦片标记为脏", () => {
            const tile = cache.getOrCreate(0, 0);
            tile.dirty = false;

            cache.markDirty(0, 0);

            expect(tile.dirty).toBe(true);
        });

        it("BUG: markDirty不存在的瓦片不应报错", () => {
            expect(() => cache.markDirty(99, 99)).not.toThrow();
        });

        it("BUG: markAllDirty应将所有瓦片标记为脏", () => {
            const t1 = cache.getOrCreate(0, 0);
            const t2 = cache.getOrCreate(0, 1);
            t1.dirty = false;
            t2.dirty = false;

            cache.markAllDirty();

            expect(t1.dirty).toBe(true);
            expect(t2.dirty).toBe(true);
        });
    });

    describe("invalidateRegion - 区域失效", () => {
        it("BUG: 与区域重叠的瓦片应被标记为脏", () => {
            const t1 = cache.getOrCreate(0, 0);
            const t2 = cache.getOrCreate(1, 0);
            t1.dirty = false;
            t2.dirty = false;

            cache.invalidateRegion(0, 0, 300, 300);

            expect(t1.dirty).toBe(true);
            expect(t2.dirty).toBe(true);
        });

        it("BUG: 不与区域重叠的瓦片不应被标记为脏", () => {
            const t1 = cache.getOrCreate(0, 0);
            const t2 = cache.getOrCreate(10, 0);
            t1.dirty = false;
            t2.dirty = false;

            cache.invalidateRegion(0, 0, 100, 100);

            expect(t1.dirty).toBe(true);
            expect(t2.dirty).toBe(false);
        });
    });

    describe("remove - 移除瓦片", () => {
        it("BUG: remove后瓦片应从缓存中消失", () => {
            cache.getOrCreate(0, 0);
            cache.remove(0, 0);

            expect(cache.get(0, 0)).toBeNull();
            expect(cache.size).toBe(0);
        });

        it("BUG: remove不存在的瓦片不应报错", () => {
            expect(() => cache.remove(99, 99)).not.toThrow();
        });

        it("BUG: remove应调用destroy", () => {
            const tile = cache.getOrCreate(0, 0);
            const destroySpy = vi.spyOn(tile, "destroy");

            cache.remove(0, 0);

            expect(destroySpy).toHaveBeenCalled();
        });
    });

    describe("clear - 清空缓存", () => {
        it("BUG: clear后所有瓦片应被销毁", () => {
            const t1 = cache.getOrCreate(0, 0);
            const t2 = cache.getOrCreate(0, 1);
            const spy1 = vi.spyOn(t1, "destroy");
            const spy2 = vi.spyOn(t2, "destroy");

            cache.clear();

            expect(spy1).toHaveBeenCalled();
            expect(spy2).toHaveBeenCalled();
            expect(cache.size).toBe(0);
        });

        it("BUG: clear后get应返回null", () => {
            cache.getOrCreate(0, 0);
            cache.clear();

            expect(cache.get(0, 0)).toBeNull();
        });
    });
});

describe("Tile - Bug Hunting", () => {
    it("BUG: markDirty应将dirty设为true", () => {
        const tile = new Tile(0, 0);
        tile.dirty = false;
        tile.markDirty();
        expect(tile.dirty).toBe(true);
    });

    it("BUG: clear应将dirty设为true", () => {
        const tile = new Tile(0, 0);
        tile.dirty = false;
        tile.clear();
        expect(tile.dirty).toBe(true);
    });

    it("BUG: destroy后canvas应为null", () => {
        const tile = new Tile(0, 0);
        tile.destroy();
        expect(tile.canvas).toBeNull();
        expect(tile.ctx).toBeNull();
    });

    it("BUG: getKey应返回正确格式", () => {
        const tile = new Tile(3, 7);
        expect(tile.getKey()).toBe("3:7");
    });
});