async function runAllTests() {
    const startTime = performance.now();
    console.log("🚀 Canvas Spreadsheet — 全部单元测试\n");
    console.log("═".repeat(60));

    let totalPassed = 0;
    let totalFailed = 0;

    const tests = [
        { name: "BaseLayer", file: "./test-base-layer.js", fn: "testBaseLayer" },
        { name: "Tile", file: "./test-tile.js", fn: "testTile" },
        { name: "TileCache", file: "./test-tile-cache.js", fn: "testTileCache" },
        { name: "ViewportTransform", file: "./test-viewport-transform.js", fn: "testViewportTransform" },
        { name: "ResizeHandleRenderer", file: "./test-resize-handle-renderer.js", fn: "testResizeHandleRenderer" },
        { name: "DragIndicatorRenderer", file: "./test-drag-indicator-renderer.js", fn: "testDragIndicatorRenderer" },
        { name: "OverlayRenderer", file: "./test-overlay-renderer.js", fn: "testOverlayRenderer" },
        { name: "HeaderRenderer", file: "./test-header-renderer.js", fn: "testHeaderRenderer" },
        { name: "TileRenderer", file: "./test-tile-renderer.js", fn: "testTileRenderer" },
        { name: "RenderEngine", file: "./test-render-engine.js", fn: "testRenderEngine" },
        { name: "FrozenLayer", file: "./test-frozen-layer.js", fn: "testFrozenLayer" },
    ];

    for (const test of tests) {
        console.log(`\n${"═".repeat(60)}`);
        try {
            const mod = await import(test.file);
            const result = await mod[test.fn]();
            totalPassed += result.passed;
            totalFailed += result.failed;
        } catch (e) {
            console.log(`\n  💥 ${test.name} 测试套件加载/执行异常:`);
            console.log(`     ${e.message}`);
            if (e.stack) {
                console.log(`     ${e.stack.split("\n").slice(0, 3).join("\n     ")}`);
            }
            totalFailed++;
        }
    }

    const elapsed = (performance.now() - startTime).toFixed(1);

    console.log(`\n${"═".repeat(60)}`);
    console.log("\n🏁 全部测试完成\n");
    console.log("┌────────────────────────────────────┐");
    console.log(`│  总通过: ${String(totalPassed).padStart(4)}                     │`);
    console.log(`│  总失败: ${String(totalFailed).padStart(4)}                     │`);
    console.log(`│  耗时:   ${elapsed.padStart(6)} ms                │`);
    console.log("└────────────────────────────────────┘");

    if (totalFailed === 0) {
        console.log("\n✨🎉 所有测试全部通过！完美！🎉✨");
    } else {
        console.log(`\n⚠️  有 ${totalFailed} 个测试用例失败，请检查上方输出。`);
    }

    return { passed: totalPassed, failed: totalFailed, elapsed };
}

export { runAllTests };