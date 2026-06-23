async function testTile() {
    console.log("🧪 Tile Unit Tests\n");
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

    const { Tile } = await import("../src/render/Tile.js");

    console.log("\n📋 1. 构造函数验证\n");

    try {
        const tile = new Tile(2, 3);
        assert(tile.tileRow === 2, "tileRow 应正确设置");
        assert(tile.tileCol === 3, "tileCol 应正确设置");
        assert(tile.dirty === true, "新建瓦片 dirty 应为 true");
        assert(tile.dpr > 0, "dpr 应大于0");
        assert(tile.canvas instanceof HTMLCanvasElement, "canvas 应为 HTMLCanvasElement");
        assert(tile.ctx instanceof CanvasRenderingContext2D, "ctx 应为 CanvasRenderingContext2D");
    } catch (e) {
        console.log(`  ❌ 构造测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 2. Canvas 尺寸（DPR 适配）\n");

    try {
        const tile = new Tile(0, 0);
        const expectedSize = 256 * tile.dpr;
        assert(tile.canvas.width === expectedSize, `canvas.width 应为 ${expectedSize} (TILE_SIZE × DPR)`);
        assert(tile.canvas.height === expectedSize, `canvas.height 应为 ${expectedSize} (TILE_SIZE × DPR)`);
    } catch (e) {
        console.log(`  ❌ 尺寸测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 3. getKey\n");

    try {
        const tile = new Tile(5, 10);
        const key = tile.getKey();
        assert(key === "5:10", "getKey 格式应为 'tileRow:tileCol'");
    } catch (e) {
        console.log(`  ❌ getKey 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 4. markDirty / clear\n");

    try {
        const tile = new Tile(0, 0);

        tile.clearDirty();
        assert(tile.dirty === false, "clearDirty 后 dirty 为 false");

        tile.markDirty();
        assert(tile.dirty === true, "markDirty 后 dirty 为 true");

        tile.markDirty();
        assert(tile.dirty === true, "重复 markDirty 保持 true");
    } catch (e) {
        console.log(`  ❌ markDirty/clear 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 5. clear 方法\n");

    try {
        const tile = new Tile(0, 0);
        tile.dirty = false;

        tile.clear();
        assert(tile.dirty === true, "clear 后应标记为脏");
        assert(tile.canvas.width > 0, "clear 后 canvas width 仍有效");
    } catch (e) {
        console.log(`  ❌ clear 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 6. destroy\n");

    try {
        const tile = new Tile(0, 0);
        tile.destroy();

        assert(tile.canvas === null, "destroy 后 canvas 为 null");
        assert(tile.ctx === null, "destroy 后 ctx 为 null");
    } catch (e) {
        console.log(`  ❌ destroy 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 7. 唯一性：不同行列号生成不同瓦片\n");

    try {
        const t1 = new Tile(0, 0);
        const t2 = new Tile(0, 1);
        const t3 = new Tile(1, 0);

        assert(t1 !== t2, "不同列号的瓦片是不同实例");
        assert(t1 !== t3, "不同行号的瓦片是不同实例");
        assert(t2 !== t3, "不同行列号的瓦片是不同实例");
        assert(t1.getKey() !== t2.getKey(), "不同列号 key 不同");
        assert(t1.getKey() !== t3.getKey(), "不同行号 key 不同");

        t1.destroy();
        t2.destroy();
        t3.destroy();
    } catch (e) {
        console.log(`  ❌ 唯一性测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n📊 测试结果汇总:");
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);

    if (failed === 0) {
        console.log("\n✨ 完美！Tile 所有测试通过！");
    } else {
        console.log("\n⚠️ 存在失败用例，需要修复。");
    }

    return { passed, failed };
}

export { testTile };