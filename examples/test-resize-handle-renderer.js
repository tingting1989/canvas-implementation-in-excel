async function testResizeHandleRenderer() {
    console.log("🧪 ResizeHandleRenderer Unit Tests\n");
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

    const { ResizeHandleRenderer } = await import("../src/render/ResizeHandleRenderer.js");
    const { HIT_TYPE } = await import("../src/constants/hitType.js");

    console.log("\n📋 1. 构造与初始状态\n");

    try {
        const renderer = new ResizeHandleRenderer();
        assert(renderer !== undefined, "实例创建成功");
    } catch (e) {
        console.log(`  ❌ 构造测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 2. setResizeLine / clearResizeLine\n");

    try {
        const renderer = new ResizeHandleRenderer();

        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 3, 150);
        assert(renderer.getResizeLine() !== null, "设置后 resizeLine 非空");

        renderer.clearResizeLine();
        assert(renderer.getResizeLine() === null, "清除后 resizeLine 为 null");
    } catch (e) {
        console.log(`  ❌ set/clear 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 3. render — 无状态不绘制\n");

    try {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext("2d");

        const renderer = new ResizeHandleRenderer();
        ctx.clearRect(0, 0, 400, 300);
        renderer.render(ctx, 400, 300);

        const imageData = ctx.getImageData(0, 0, 1, 1).data;
        assert(imageData[3] === 0, "无状态时 render 不绘制任何内容（透明）");
    } catch (e) {
        console.log(`  ❌ render 无状态测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 4. render — COL_RESIZE 绘制竖线\n");

    try {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext("2d");

        const renderer = new ResizeHandleRenderer();
        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 2, 200);
        renderer.render(ctx, 400, 300);

        const linePixel = ctx.getImageData(200, 50, 1, 1).data;
        const bgPixel = ctx.getImageData(10, 50, 1, 1).data;

        assert(linePixel[3] > 0 || linePixel[0] + linePixel[1] + linePixel[2] > 0, "COL_RESIZE 线位置有绘制内容");
    } catch (e) {
        console.log(`  ❌ render COL_RESIZE 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 5. render — ROW_RESIZE 绘制横线\n");

    try {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext("2d");

        const renderer = new ResizeHandleRenderer();
        renderer.setResizeLine(HIT_TYPE.ROW_RESIZE, 5, 150);
        renderer.render(ctx, 400, 300);

        const linePixel = ctx.getImageData(50, 150, 1, 1).data;
        assert(linePixel[3] > 0 || linePixel[0] + linePixel[1] + linePixel[2] > 0, "ROW_RESIZE 线位置有绘制内容");
    } catch (e) {
        console.log(`  ❌ render ROW_RESIZE 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 6. 多次设置覆盖\n");

    try {
        const renderer = new ResizeHandleRenderer();

        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 0, 100);
        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 1, 200);

        const state = renderer.getResizeLine();
        assert(state.index === 1, "后设置的覆盖先前的");
        assert(state.position === 200, "position 更新为最新值");
    } catch (e) {
        console.log(`  ❌ 覆盖测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n📊 测试结果汇总:");
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);

    if (failed === 0) {
        console.log("\n✨ 完美！ResizeHandleRenderer 所有测试通过！");
    } else {
        console.log("\n⚠️ 存在失败用例，需要修复。");
    }

    return { passed, failed };
}

export { testResizeHandleRenderer };