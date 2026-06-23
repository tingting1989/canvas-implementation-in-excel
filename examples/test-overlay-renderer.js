async function testOverlayRenderer() {
    console.log("🧪 OverlayRenderer Unit Tests\n");
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

    const { OverlayRenderer } = await import("../src/render/OverlayRenderer.js");
    const { HIT_TYPE } = await import("../src/constants/hitType.js");

    console.log("\n📋 1. 构造与初始状态\n");

    try {
        const renderer = new OverlayRenderer();
        assert(renderer !== undefined, "实例创建成功");
    } catch (e) {
        console.log(`  ❌ 构造测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 2. setResizeLine / clearResizeLine\n");

    try {
        const renderer = new OverlayRenderer();
        assert(renderer.getResizeLine() === null, "初始 resizeLine 为 null");

        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 100);
        const line = renderer.getResizeLine();
        assert(line !== null, "设置后非 null");
        assert(line.type === HIT_TYPE.COL_RESIZE, "type 正确");
        assert(line.position === 100, "position 正确");

        renderer.clearResizeLine();
        assert(renderer.getResizeLine() === null, "清除后为 null");
    } catch (e) {
        console.log(`  ❌ set/clear 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 3. renderMerges — 无合并不绘制\n");

    try {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext("2d");

        const renderer = new OverlayRenderer();
        const mockSheet = {
            getAllMerges: () => [],
            rowColManager: { pageStartRow: -1 },
        };
        const mockVt = { mergeToViewRect: () => ({ x: 0, y: 0, w: 0, h: 0 }) };

        ctx.clearRect(0, 0, 400, 300);
        renderer.renderMerges(ctx, mockSheet, mockVt);

        const pixel = ctx.getImageData(10, 10, 1, 1).data;
        assert(pixel[3] === 0, "无合并时不绘制边框内容");
    } catch (e) {
        console.log(`  ❌ renderMerges 空合并测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 4. renderSelection — 基本渲染\n");

    try {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext("2d");

        const renderer = new OverlayRenderer();

        const mockSheet = {
            selection: {
                getRange: () => ({ topRow: 0, topCol: 0, bottomRow: 1, bottomCol: 1 }),
                getFocus: () => [0, 0],
            },
            getMerge: () => null,
        };
        const mockVt = {
            headerW: 46,
            headerH: 28,
            colToViewX: (c) => 46 + c * 100,
            colRightToViewX: (c) => 146 + c * 100,
            rowToViewY: (r) => 28 + r * 30,
            rowBottomToViewY: (r) => 58 + r * 30,
            mergeToViewRect: (m) => ({ x: 46, y: 28, w: 200, h: 60 }),
            cellToViewRect: () => ({ x: 46, y: 28, w: 100, h: 30 }),
        };

        ctx.clearRect(0, 0, 400, 300);
        renderer.renderSelection(ctx, mockSheet, mockVt, 400, 300);

        const selPixel = ctx.getImageData(50, 35, 1, 1).data;
        assert(selPixel[3] > 0 || selPixel[0] + selPixel[1] + selPixel[2] > 0, "选区区域有绘制内容（高亮或边框）");
    } catch (e) {
        console.log(`  ❌ renderSelection 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 5. renderSelection — 包含 resizeLine\n");

    try {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext("2d");

        const renderer = new OverlayRenderer();
        renderer.setResizeLine(HIT_TYPE.COL_RESIZE, 150);

        const mockSheet = {
            selection: { getRange: () => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 }), getFocus: () => [0, 0] },
            getMerge: () => null,
        };
        const mockVt = { headerW: 46, headerH: 28, colToViewX: () => 46, colRightToViewX: () => 146, rowToViewY: () => 28, rowBottomToViewY: () => 58, mergeToViewRect: () => ({ x: 46, y: 28, w: 100, h: 30 }), cellToViewRect: () => ({ x: 46, y: 28, w: 100, h: 30 }) };

        ctx.clearRect(0, 0, 400, 300);
        renderer.renderSelection(ctx, mockSheet, mockVt, 400, 300);
        assert(renderer.getResizeLine() !== null, "render 后 resizeLine 仍存在（不被自动清除）");
    } catch (e) {
        console.log(`  ❌ renderSelection with line 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n📊 测试结果汇总:");
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);

    if (failed === 0) {
        console.log("\n✨ 完美！OverlayRenderer 所有测试通过！");
    } else {
        console.log("\n⚠️ 存在失败用例，需要修复。");
    }

    return { passed, failed };
}

export { testOverlayRenderer };