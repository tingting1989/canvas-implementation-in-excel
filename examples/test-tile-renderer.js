async function testTileRenderer() {
    console.log("🧪 TileRenderer Unit Tests\n");
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
    const { TileRenderer } = await import("../src/render/TileRenderer.js");

    function createMinimalSheet(overrides = {}) {
        const colWidths = overrides.colWidths || [100, 80, 120];
        const rowHeights = overrides.rowHeights || [30, 40];

        let colXAccum = 0;
        const colXMap = {};
        for (let i = 0; i < colWidths.length; i++) { colXMap[i] = colXAccum; colXAccum += colWidths[i]; }

        let rowYAccum = 0;
        const rowYMap = {};
        for (let i = 0; i < rowHeights.length; i++) { rowYMap[i] = rowYAccum; rowYAccum += rowHeights[i]; }

        return {
            getHeaderWidth: () => 46,
            getHeaderHeight: () => 28,
            cellPadding: 6,
            textOverflowEllipsis: true,
            workbook: { clipboard: { getCellContent: () => null } },
            formatCellValue: (r, c, v) => String(v ?? ""),
            resolveStyle: () => ({ fontSize: 12, fontFamily: "sans-serif", color: "#222" }),
            toRealRow: (r) => r,
            toPageRow: (r) => r,
            rawRowAt: (y) => Math.floor(y / 30),
            getRealRowY: (r) => r * 30,
            getRealRowHeight: (r) => rowHeights[r] ?? 30,
            getNestedHeaderRowCount: () => 1,
            getAllMerges: () => [],
            getMerge: () => null,
            isMergedCell: () => false,
            cellStore: {
                get: (r, c) => ({ value: r === 0 && c === 0 ? "Hello" : undefined, disabled: false }),
            },
            rowColManager: {
                getColWidth: (c) => colWidths[c] ?? 100,
                getColX: (c) => colXMap[c] ?? c * 100,
                getRowHeight: (r) => rowHeights[r] ?? 28,
                getRowY: (r) => rowYMap[r] ?? r * 28,
                colAt: (px) => {
                    let acc = 0;
                    for (let i = 0; i < colWidths.length; i++) { acc += colWidths[i]; if (acc > px) return i; }
                    return colWidths.length - 1;
                },
                rowAt: (py) => {
                    let acc = 0;
                    for (let i = 0; i < rowHeights.length; i++) { acc += rowHeights[i]; if (acc > py) return i; }
                    return rowHeights.length - 1;
                },
                rowCount: rowHeights.length,
                colCount: colWidths.length,
                pageStartRow: -1,
            },
        };
    }

    console.log("\n📋 1. 构造函数\n");

    try {
        const cache = new TileCache();
        const renderer = new TileRenderer(cache);
        assert(renderer.tileCache === cache, "tileCache 正确存储");
        assert(renderer.onContentReady === null, "onContentReady 初始为 null");
    } catch (e) {
        console.log(`  ❌ 构造测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 2. render — 基本渲染\n");

    try {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext("2d");

        const cache = new TileCache();
        const renderer = new TileRenderer(cache);
        const sheet = createMinimalSheet({ colWidths: [100, 80], rowHeights: [30, 40] });

        ctx.clearRect(0, 0, 400, 300);
        renderer.render(ctx, sheet, 0, 0, 400, 300);

        const dataAreaPixel = ctx.getImageData(50, 40, 1, 1).data;
        assert(dataAreaPixel[3] > 0 || dataAreaPixel[0] + dataAreaPixel[1] + dataAreaPixel[2] > 0, "数据区有绘制内容");
    } catch (e) {
        console.log(`  ❌ render 基础测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 3. render — 视口尺寸为0时跳过\n");

    try {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext("2d");

        const cache = new TileCache();
        const renderer = new TileRenderer(cache);
        const sheet = createMinimalSheet();

        const sizeBefore = cache.size;
        renderer.render(ctx, sheet, 0, 0, 46, 28);
        assert(cache.size === sizeBefore, "viewW<=headerW 时跳过渲染，不创建瓦片");
    } catch (e) {
        console.log(`  ❌ render 跳过测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 4. invalidateCell — 标记单个瓦片脏\n");

    try {
        const cache = new TileCache();
        const renderer = new TileRenderer(cache);
        const sheet = createMinimalSheet();

        renderer.render({}, sheet, 0, 0, 400, 300);

        const tile00 = cache.get(0, 0);
        tile00.dirty = false;

        renderer.invalidateCell(0, 0, sheet.rowColManager);
        assert(tile00.dirty === true, "invalidateCell 标记对应瓦片为脏");
    } catch (e) {
        console.log(`  ❌ invalidateCell 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 5. invalidateAll — 标记所有瓦片脏\n");

    try {
        const cache = new TileCache();
        const renderer = new TileRenderer(cache);
        const sheet = createMinimalSheet();

        renderer.render({}, sheet, 0, 0, 400, 300);
        const tile = cache.get(0, 0);
        tile.dirty = false;

        renderer.invalidateAll();
        assert(tile.dirty === true, "invalidateAll 后所有瓦片被标记为脏");
    } catch (e) {
        console.log(`  ❌ invalidateAll 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 6. render — 滚动偏移影响瓦片范围\n");

    try {
        const cache = new TileCache();
        const renderer = new TileRenderer(cache);
        const sheet = createMinimalSheet({ colWidths: Array(20).fill(100), rowHeights: Array(20).fill(30) });

        renderer.render({}, sheet, 0, 0, 400, 300);
        const tilesAtZero = cache.size;

        cache.clear();
        renderer.render({}, sheet, 500, 200, 400, 300);
        const tilesAtScrolled = cache.size;

        assert(tilesAtZero > 0, "scroll=0 创建了瓦片");
        assert(tilesAtScrolled > 0, "scroll=500,200 也创建了瓦片");
    } catch (e) {
        console.log(`  ❌ 滚动瓦片范围测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 7. render — 脏瓦片重绘、干净瓦片复用\n");

    try {
        const cache = new TileCache();
        const renderer = new TileRenderer(cache);
        const sheet = createMinimalSheet();

        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext("2d");

        renderer.render(ctx, sheet, 0, 0, 400, 300);
        const tile = cache.get(0, 0);
        tile.dirty = false;

        const firstRenderData = ctx.getImageData(60, 40, 1, 1).data;

        renderer.render(ctx, sheet, 0, 0, 400, 300);
        assert(tile.dirty === false, "第二次 render 干净瓦片仍为 clean（复用缓存）");
    } catch (e) {
        console.log(`  ❌ 脏标记复用测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n📊 测试结果汇总:");
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);

    if (failed === 0) {
        console.log("\n✨ 完美！TileRenderer 所有测试通过！");
    } else {
        console.log("\n⚠️ 存在失败用例，需要修复。");
    }

    return { passed, failed };
}

export { testTileRenderer };