async function testDragIndicatorRenderer() {
    console.log("🧪 DragIndicatorRenderer Unit Tests\n");
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

    const { DragIndicatorRenderer } = await import("../src/render/DragIndicatorRenderer.js");

    console.log("\n📋 1. 构造与初始状态\n");

    try {
        const renderer = new DragIndicatorRenderer();
        assert(renderer.hasColumnMove() === false, "初始无列拖拽");
        assert(renderer.hasRowMove() === false, "初始无行拖拽");
    } catch (e) {
        console.log(`  ❌ 构造测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 2. setColumnMoveState / setRowMoveState\n");

    try {
        const renderer = new DragIndicatorRenderer();

        renderer.setColumnMoveState({ sourceCol: 2, targetCol: 4, dragX: 300, dragStartX: 250, colW: 100 });
        assert(renderer.hasColumnMove() === true, "设置列状态后 hasColumnMove 返回 true");
        assert(renderer.hasRowMove() === false, "列状态不影响行状态");

        renderer.setRowMoveState({ sourceRow: 1, targetRow: 3, dragY: 100, dragStartY: 80, rowH: 30 });
        assert(renderer.hasRowMove() === true, "设置行状态后 hasRowMove 返回 true");
    } catch (e) {
        console.log(`  ❌ setState 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 3. 清除状态\n");

    try {
        const renderer = new DragIndicatorRenderer();

        renderer.setColumnMoveState({ sourceCol: 0, targetCol: 1, dragX: 0, dragStartX: 0, colW: 100 });
        assert(renderer.hasColumnMove() === true, "设置后有状态");

        renderer.setColumnMoveState(null);
        assert(renderer.hasColumnMove() === false, "null 清除列状态");

        renderer.setRowMoveState({ sourceRow: 0, targetRow: 1, dragY: 0, dragStartY: 0, rowH: 30 });
        renderer.setRowMoveState(null);
        assert(renderer.hasRowMove() === false, "null 清除行状态");
    } catch (e) {
        console.log(`  ❌ 清除状态测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 4. isColumnSource / isRowSource\n");

    try {
        const renderer = new DragIndicatorRenderer();

        assert(renderer.isColumnSource(0) === false, "无拖拽时 isColumnSource 返回 false");
        assert(renderer.isRowSource(0) === false, "无拖拽时 isRowSource 返回 false");

        renderer.setColumnMoveState({ sourceCol: 3, targetCol: 5, dragX: 0, dragStartX: 0, colW: 100 });
        assert(renderer.isColumnSource(3) === true, "源列返回 true");
        assert(renderer.isColumnSource(4) === false, "非源列返回 false");

        renderer.setColumnMoveState(null);
        renderer.setRowMoveState({ sourceRow: 2, targetRow: 4, dragY: 0, dragStartY: 0, rowH: 30 });
        assert(renderer.isRowSource(2) === true, "源行返回 true");
        assert(renderer.isRowSource(3) === false, "非源行返回 false");
    } catch (e) {
        console.log(`  ❌ isSource 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 5. renderColumnMoveIndicator — 无状态不绘制\n");

    try {
        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext("2d");

        const renderer = new DragIndicatorRenderer();
        ctx.clearRect(0, 0, 800, 600);

        const mockVt = {
            headerW: 46, headerH: 28,
            colToViewX: () => 100, colRightToViewX: () => 200,
        };

        renderer.renderColumnMoveIndicator(ctx, {}, mockVt, 800, 600);
        const pixel = ctx.getImageData(150, 50, 1, 1).data;
        assert(pixel[3] === 0, "无列拖拽状态时不绘制");
    } catch (e) {
        console.log(`  ❌ render 无状态测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 6. renderRowMoveIndicator — 无状态不绘制\n");

    try {
        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext("2d");

        const renderer = new DragIndicatorRenderer();
        ctx.clearRect(0, 0, 800, 600);

        const mockVt = {
            headerW: 46, headerH: 28,
            rowToViewY: () => 50, rowBottomToViewY: () => 80,
        };

        renderer.renderRowMoveIndicator(ctx, {}, mockVt, 800, 600);
        const pixel = ctx.getImageData(50, 100, 1, 1).data;
        assert(pixel[3] === 0, "无行拖拽状态时不绘制");
    } catch (e) {
        console.log(`  ❌ renderRow 无状态测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n📊 测试结果汇总:");
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);

    if (failed === 0) {
        console.log("\n✨ 完美！DragIndicatorRenderer 所有测试通过！");
    } else {
        console.log("\n⚠️ 存在失败用例，需要修复。");
    }

    return { passed, failed };
}

export { testDragIndicatorRenderer };