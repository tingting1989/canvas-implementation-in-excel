async function testTileCache() {
    console.log("🧪 TileCache Unit Tests\n");
    console.log("=".repeat(60));

    let passed = 0;
    let failed = 0;

    function assert(condition, testName) {
        if (condition) {
            console.log(`  ✅ ${testName}`);
            passed++;
        } else {
            console.log(`  ❌ ${testName}`);
            failed++;
        }
    }

    const { TileCache } = await import("../src/render/TileCache.js");

    console.log("\n📋 1. 构造与基本属性\n");

    try {
        const cache = new TileCache();
        assert(cache.tiles instanceof Map, "tiles 应为 Map 实例");
        assert(cache.size === 0, "初始 size 为 0");
        assert(cache.maxSize > 0, "maxSize 应大于 0");
        assert(cache.dpr > 0, "dpr 应大于 0");
    } catch (e) {
        console.log(`  ❌ 构造测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 2. getOrCreate — 创建新瓦片\n");

    try {
        const cache = new TileCache();
        const tile = cache.getOrCreate(0, 0);

        assert(tile !== undefined, "getOrCreate 返回有效值");
        assert(tile.tileRow === 0, "瓦片行号正确");
        assert(tile.tileCol === 0, "瓦片列号正确");
        assert(tile.dirty === true, "新建瓦片 dirty 为 true");
        assert(cache.size === 1, "size 增加到 1");

        cache.clear();
    } catch (e) {
        console.log(`  ❌ getOrCreate 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 3. getOrCreate — 缓存命中\n");

    try {
        const cache = new TileCache();
        const tile1 = cache.getOrCreate(1, 2);
        const tile2 = cache.getOrCreate(1, 2);

        assert(tile1 === tile2, "相同位置返回同一瓦片实例");
        assert(cache.size === 1, "缓存命中不增加 size");

        cache.clear();
    } catch (e) {
        console.log(`  ❌ 缓存命中测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 4. get — 未命中返回 null\n");

    try {
        const cache = new TileCache();
        const result = cache.get(5, 5);
        assert(result === null, "未缓存的瓦片 get 返回 null");
    } catch (e) {
        console.log(`  ❌ get 未命中测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 5. get — 命中返回瓦片\n");

    try {
        const cache = new TileCache();
        cache.getOrCreate(3, 4);
        const result = cache.get(3, 4);

        assert(result !== null, "已缓存瓦片 get 返回非 null");
        assert(result.tileRow === 3 && result.tileCol === 4, "返回的瓦片坐标正确");

        cache.clear();
    } catch (e) {
        console.log(`  ❌ get 命中测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 6. markDirty / markAllDirty\n");

    try {
        const cache = new TileCache();
        cache.getOrCreate(0, 0);
        cache.getOrCreate(0, 1);
        cache.getOrCreate(1, 0);

        cache.get(0, 0).dirty = false;
        cache.get(0, 1).dirty = false;
        cache.get(1, 0).dirty = false;

        cache.markDirty(0, 1);
        assert(cache.get(0, 1).dirty === true, "markDirty 标记指定瓦片");
        assert(cache.get(0, 0).dirty === false, "markDirty 不影响其他瓦片");

        cache.markAllDirty();
        assert(cache.get(0, 0).dirty === true, "markAllDirty 标记所有瓦片");
        assert(cache.get(0, 1).dirty === true, "markAllDirty 标记所有瓦片");
        assert(cache.get(1, 0).dirty === true, "markAllDirty 标记所有瓦片");

        cache.clear();
    } catch (e) {
        console.log(`  ❌ markDirty 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 7. invalidateRegion — 区域标记\n");

    try {
        const cache = new TileCache();
        cache.getOrCreate(0, 0);
        cache.getOrCreate(1, 0);
        cache.getOrCreate(0, 1);
        cache.getOrCreate(2, 2);

        for (const node of cache.tiles.values()) node.tile.dirty = false;

        cache.invalidateRegion(0, 0, 257, 257);

        assert(cache.get(0, 0).dirty === true, "区域内的 (0,0) 被标记");
        assert(cache.get(1, 0).dirty === true, "区域内的 (1,0) 被标记");
        assert(cache.get(0, 1).dirty === true, "区域内的 (0,1) 被标记");
        assert(cache.get(2, 2).dirty === false, "区域外的 (2,2) 不被标记");

        cache.clear();
    } catch (e) {
        console.log(`  ❌ invalidateRegion 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 8. remove\n");

    try {
        const cache = new TileCache();
        cache.getOrCreate(0, 0);
        cache.getOrCreate(1, 1);
        assert(cache.size === 2, "创建后 size=2");

        cache.remove(0, 0);
        assert(cache.size === 1, "remove 后 size 减少");
        assert(cache.get(0, 0) === null, "remove 后 get 返回 null");
        assert(cache.get(1, 1) !== null, "其他瓦片仍存在");

        cache.clear();
    } catch (e) {
        console.log(`  ❌ remove 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 9. clear\n");

    try {
        const cache = new TileCache();
        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 5; c++) {
                cache.getOrCreate(r, c);
            }
        }
        assert(cache.size === 25, "创建 25 个瓦片后 size=25");

        cache.clear();
        assert(cache.size === 0, "clear 后 size=0");
        assert(cache.get(0, 0) === null, "clear 后无法获取瓦片");
    } catch (e) {
        console.log(`  ❌ clear 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 10. LRU 淘汰策略\n");

    try {
        const cache = new TileCache();

        const originalMaxSize = cache.maxSize;
        cache.maxSize = 8;

        for (let i = 0; i < 12; i++) {
            cache.getOrCreate(i, 0);
        }

        assert(cache.size <= cache.maxSize, `淘汰后 size(${cache.size}) <= maxSize(${cache.maxSize})`);

        cache.maxSize = originalMaxSize;
        cache.clear();
    } catch (e) {
        console.log(`  ❌ LRU 淘汰测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 11. LRU 访问顺序更新\n");

    try {
        const cache = new TileCache();
        cache.maxSize = 6;

        cache.getOrCreate(0, 0);
        cache.getOrCreate(1, 0);
        cache.getOrCreate(2, 0);

        cache.get(0, 0);
        cache.get(1, 0);

        for (let i = 3; i < 10; i++) {
            cache.getOrCreate(i, 0);
        }

        assert(cache.get(0, 0) !== null, "最近访问的 (0,0) 应保留");
        assert(cache.get(1, 0) !== null, "最近访问的 (1,0) 应保留");

        cache.maxSize = 512;
        cache.clear();
    } catch (e) {
        console.log(`  ❌ LRU 访问顺序测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n📊 测试结果汇总:");
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);

    if (failed === 0) {
        console.log("\n✨ 完美！TileCache 所有测试通过！");
    } else {
        console.log("\n⚠️ 存在失败用例，需要修复。");
    }

    return { passed, failed };
}

export { testTileCache };