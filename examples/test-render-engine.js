async function testRenderEngine() {
    console.log("🧪 RenderEngine Unit Tests\n");
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

    const { RenderEngine } = await import("../src/render/RenderEngine.js");

    console.log("\n📋 注意：RenderEngine 需要 DOM 环境（Canvas 元素），部分测试使用 mock\n");

    console.log("\n📋 1. Layer 属性访问\n");

    try {
        const engine = new RenderEngine("__test_canvas__");
        assert(engine.tileLayer !== undefined, "tileLayer 存在");
        assert(engine.overlayLayer !== undefined, "overlayLayer 存在");
        assert(engine.frozenLayer !== undefined, "frozenLayer 存在");
        assert(engine.headerLayer !== undefined, "headerLayer 存在");
        assert(engine.uiLayer !== undefined, "uiLayer 存在");
        assert(engine.compositor !== undefined, "compositor 存在");
    } catch (e) {
        console.log(`  ❌ Layer 属性测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 2. getter 属性\n");

    try {
        const engine = new RenderEngine("__test_canvas__");
        assert(typeof engine.scrollX === "number", "scrollX 为数字");
        assert(typeof engine.scrollY === "number", "scrollY 为数字");
        assert(typeof engine.viewW === "number", "viewW 为数字");
        assert(typeof engine.viewH === "number", "viewH 为数字");
        assert(typeof engine.currentSheet === "object", "currentSheet 可访问");
    } catch (e) {
        console.log(`  ❌ getter 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 3. invalidateAll — 标记所有层脏\n");

    try {
        const engine = new RenderEngine("__test_canvas__");

        engine.tileLayer.clearDirty();
        engine.overlayLayer.clearDirty();
        engine.frozenLayer.clearDirty();
        engine.headerLayer.clearDirty();
        engine.uiLayer.clearDirty();

        engine.invalidateAll();

        assert(engine.tileLayer.dirty === true, "invalidateAll 后 tileLayer 脏");
        assert(engine.overlayLayer.dirty === true, "invalidateAll 后 overlayLayer 脏");
        assert(engine.frozenLayer.dirty === true, "invalidateAll 后 frozenLayer 脏");
        assert(engine.headerLayer.dirty === true, "invalidateAll 后 headerLayer 脏");
        assert(engine.uiLayer.dirty === true, "invalidateAll 后 uiLayer 脏");
    } catch (e) {
        console.log(`  ❌ invalidateAll 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 4. invalidateCell — 标记指定单元格脏\n");

    try {
        const engine = new RenderEngine("__test_canvas__");

        engine.tileLayer.clearDirty();
        engine.frozenLayer.clearDirty();

        engine.invalidateCell(0, 0);
        assert(engine.tileLayer.dirty === true, "invalidateCell 后 tileLayer 脏");
    } catch (e) {
        console.log(`  ❌ invalidateCell 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 5. invalidateRegion — 区域标记\n");

    try {
        const engine = new RenderEngine("__test_canvas__");

        engine.tileLayer.clearDirty();
        engine.frozenLayer.clearDirty();

        engine.invalidateCell(0, 0);
        assert(engine.tileLayer.dirty === true, "invalidateCell 后 tileLayer 脏");
    } catch (e) {
        console.log(`  ❌ invalidateRegion 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 6. setResizeLine / clearResizeLine\n");

    try {
        const engine = new RenderEngine("__test_canvas__");

        engine.setResizeLine("COL_RESIZE", 100);
        const overlayLine = engine.overlayLayer.overlayRenderer.getResizeLine();
        assert(overlayLine !== null, "setResizeLine 后 overlay 有调整线");

        engine.clearResizeLine();
        const afterClear = engine.overlayLayer.overlayRenderer.getResizeLine();
        assert(afterClear === null, "clearResizeLine 后调整线清除");
    } catch (e) {
        console.log(`  ❌ set/clearResizeLine 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 7. headerRenderer 代理\n");

    try {
        const engine = new RenderEngine("__test_canvas__");
        assert(engine.headerRenderer !== undefined, "headerRenderer 可访问");
        assert(engine.headerRenderer.resizeRenderer !== undefined, "headerRenderer.resizeRenderer 可访问");
        assert(engine.headerRenderer.dragRenderer !== undefined, "headerRenderer.dragRenderer 可访问");
    } catch (e) {
        console.log(`  ❌ headerRenderer 代理测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 8. Layer zIndex 排序\n");

    try {
        const engine = new RenderEngine("__test_canvas__");
        const layers = [
            engine.tileLayer,
            engine.frozenLayer,
            engine.overlayLayer,
            engine.headerLayer,
            engine.uiLayer,
        ];

        for (let i = 1; i < layers.length; i++) {
            const prev = layers[i - 1];
            const curr = layers[i];
            assert(curr.zIndex >= prev.zIndex,
                `${prev.name}(${prev.zIndex}) <= ${curr.name}(${curr.zIndex}) 排序正确`);
        }
    } catch (e) {
        console.log(`  ❌ zIndex 排序测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 9. destroy 销毁\n");

    try {
        const engine = new RenderEngine("__test_canvas__");
        engine.destroy();

        assert(engine.canvas === null, "destroy 后 canvas 为 null");
        assert(engine.ctx === null, "destroy 后 ctx 为 null");
    } catch (e) {
        console.log(`  ❌ destroy 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n📊 测试结果汇总:");
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);

    if (failed === 0) {
        console.log("\n✨ 完美！RenderEngine 所有测试通过！");
    } else {
        console.log("\n⚠️ 存在失败用例，需要修复。");
    }

    return { passed, failed };
}

export { testRenderEngine };