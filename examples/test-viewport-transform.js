async function testViewportTransform() {
    console.log("🧪 ViewportTransform Unit Tests\n");
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

    const { ViewportTransform } = await import("../src/render/ViewportTransform.js");

    function createMockSheet(overrides = {}) {
        const colWidths = overrides.colWidths || [100, 80, 120];
        const rowHeights = overrides.rowHeights || [30, 50, 40];
        const headerW = overrides.headerW ?? 46;
        const headerH = overrides.headerH ?? 28;
        const fixedCols = overrides.fixedCols ?? 0;
        const fixedRows = overrides.fixedRows ?? 0;

        let colXAccum = 0;
        const colXMap = {};
        for (let i = 0; i < colWidths.length; i++) {
            colXMap[i] = colXAccum;
            colXAccum += colWidths[i];
        }

        let rowYAccum = 0;
        const rowYMap = {};
        for (let i = 0; i < rowHeights.length; i++) {
            rowYMap[i] = rowYAccum;
            rowYAccum += rowHeights[i];
        }

        return {
            getHeaderWidth: () => headerW,
            getHeaderHeight: () => headerH,
            fixedColumnsStart: fixedCols,
            fixedRowsTop: fixedRows,
            frozenColsWidth: fixedCols > 0 ? (colWidths.slice(0, fixedCols).reduce((a, b) => a + b, 0)) : 0,
            frozenRowsHeight: fixedRows > 0 ? (rowHeights.slice(0, fixedRows).reduce((a, b) => a + b, 0)) : 0,
            rowColManager: {
                getColWidth: (c) => colWidths[c] ?? 100,
                getColX: (c) => colXMap[c] ?? c * 100,
                getRowHeight: (r) => rowHeights[r] ?? 28,
                getRowY: (r) => rowYMap[r] ?? r * 28,
                colAt: (px) => {
                    let acc = 0;
                    for (let i = 0; i < colWidths.length; i++) {
                        acc += colWidths[i];
                        if (acc > px) return Math.min(i, colWidths.length - 1);
                    }
                    return colWidths.length - 1;
                },
                rowAt: (py) => {
                    let acc = 0;
                    for (let i = 0; i < rowHeights.length; i++) {
                        acc += rowHeights[i];
                        if (acc > py) return Math.min(i, rowHeights.length - 1);
                    }
                    return rowHeights.length - 1;
                },
                rowCount: rowHeights.length,
                colCount: colWidths.length,
            },
        };
    }

    console.log("\n📋 1. 构造函数\n");

    try {
        const sheet = createMockSheet();
        const vt = new ViewportTransform(sheet, 10, 20);
        assert(vt.sheet === sheet, "sheet 正确存储");
        assert(vt.scrollX === 10, "scrollX 正确存储");
        assert(vt.scrollY === 20, "scrollY 正确存储");
        assert(vt.headerW === 46, "headerW 从 sheet 获取");
        assert(vt.headerH === 28, "headerH 从 sheet 获取");
    } catch (e) {
        console.log(`  ❌ 构造测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 2. 列坐标转换 — 无冻结、无滚动\n");

    try {
        const sheet = createMockSheet({ colWidths: [100, 80, 120] });
        const vt = new ViewportTransform(sheet, 0, 0);

        assert(vt.colToViewX(0) === 46, "col0 视口 X = headerW + 0 = 46");
        assert(vt.colToViewX(1) === 146, "col1 视口 X = headerW + 100 = 146");
        assert(vt.colToViewX(2) === 226, "col2 视口 X = headerW + 180 = 226");
        assert(vt.colRightToViewX(0) === 146, "col0 右边缘 = 46 + 100 = 146");
        assert(vt.colRightToViewX(1) === 226, "col1 右边缘 = 146 + 80 = 226");
    } catch (e) {
        console.log(`  ❌ 无冻结列坐标测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 3. 列坐标转换 — 有滚动\n");

    try {
        const sheet = createMockSheet({ colWidths: [100, 80, 120] });
        const vt = new ViewportTransform(sheet, 50, 0);

        assert(vt.colToViewX(1) === 96, "scrollX=50 时 col1 视口 X = 46+100-50=96");
        assert(vt.colToViewX(2) === 176, "scrollX=50 时 col2 视口 X = 46+180-50=176");
    } catch (e) {
        console.log(`  ❌ 滚动列坐标测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 4. 冻结列 — 不随水平滚动移动\n");

    try {
        const sheet = createMockSheet({
            colWidths: [100, 80, 120],
            fixedCols: 2,
        });
        const vt = new ViewportTransform(sheet, 200, 0);

        assert(vt.isInFrozenCols(0) === true, "col0 在冻结区域");
        assert(vt.isInFrozenCols(1) === true, "col1 在冻结区域");
        assert(vt.isInFrozenCols(2) === false, "col2 不在冻结区域");

        assert(vt.colToViewX(0) === 46, "冻结列0 scrollX=200 时仍为 46（不受滚动影响）");
        assert(vt.colToViewX(1) === 146, "冻结列1 scrollX=200 时仍为 146");
        assert(vt.colToViewX(2) < 146, "非冻结列2 受滚动影响向左偏移");
    } catch (e) {
        console.log(`  ❌ 冻结列测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 5. viewXToDataX / viewXToCol\n");

    try {
        const sheet = createMockSheet({ colWidths: [100, 80, 120] });
        const vt = new ViewportTransform(sheet, 0, 0);

        assert(vt.viewXToDataX(46) === 0, "表头右边缘 dataX=0");
        assert(vt.viewXToDataX(96) === 50, "视口 X=96 对应 dataX=50（在col0中间）");
        assert(vt.viewXToCol(46) === 0, "视口 X=46 命中 col0");
        assert(vt.viewXToCol(140) === 1, "视口 X=140 命中 col1");
    } catch (e) {
        console.log(`  ❌ viewX 转换测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 6. 行坐标转换\n");

    try {
        const sheet = createMockSheet({ rowHeights: [30, 50, 40] });
        const vt = new ViewportTransform(sheet, 0, 0);

        assert(vt.rowToViewY(0) === 28, "row0 视口 Y = headerH + 0 = 28");
        assert(vt.rowToViewY(1) === 58, "row1 视口 Y = headerH + 30 = 58");
        assert(vt.rowBottomToViewY(0) === 58, "row0 底部 = 28 + 30 = 58");
    } catch (e) {
        console.log(`  ❌ 行坐标测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 7. 冻结行 — 不随垂直滚动移动\n");

    try {
        const sheet = createMockSheet({
            rowHeights: [30, 50, 40],
            fixedRows: 1,
        });
        const vt = new ViewportTransform(sheet, 0, 100);

        assert(vt.isInFrozenRows(0) === true, "row0 在冻结区域");
        assert(vt.isInFrozenRows(1) === false, "row1 不在冻结区域");
        assert(vt.rowToViewY(0) === 28, "冻结行0 scrollY=100 时仍为 28");
    } catch (e) {
        console.log(`  ❌ 冻结行测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 8. cellToViewRect\n");

    try {
        const sheet = createMockSheet({ colWidths: [100, 80], rowHeights: [30, 40] });
        const vt = new ViewportTransform(sheet, 0, 0);

        const rect = vt.cellToViewRect(0, 0);
        assert(rect.x === 46, "cell(0,0) x = headerW");
        assert(rect.y === 28, "cell(0,0) y = headerH");
        assert(rect.w === 100, "cell(0,0) w = col0 宽度");
        assert(rect.h === 30, "cell(0,0) h = row0 高度");
    } catch (e) {
        console.log(`  ❌ cellToViewRect 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 9. mergeToViewRect\n");

    try {
        const sheet = createMockSheet({ colWidths: [100, 80, 120], rowHeights: [30, 40] });
        const vt = new ViewportTransform(sheet, 0, 0);

        const merge = { topRow: 0, topCol: 0, bottomRow: 1, bottomCol: 1 };
        const rect = vt.mergeToViewRect(merge);
        assert(rect.x === 46, "合并区 x = col0 左边缘");
        assert(rect.y === 28, "合并区 y = row0 顶边缘");
        assert(rect.w === 180, "合并区 w = col0+col1 宽度");
        assert(rect.h === 70, "合并区 h = row0+row1 高度");
    } catch (e) {
        console.log(`  ❌ mergeToViewRect 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n📋 10. isCellVisible\n");

    try {
        const sheet = createMockSheet({ colWidths: [100, 80], rowHeights: [30, 40] });
        const vt = new ViewportTransform(sheet, 0, 0);

        assert(vt.isCellVisible(0, 0, 800, 600) === true, "可见区域内单元格应返回 true");
        assert(vt.isCellVisible(0, 0, 10, 10) === false, "超出视口的单元格应返回 false");
    } catch (e) {
        console.log(`  ❌ isCellVisible 测试异常: ${e.message}`);
        failed++;
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n📊 测试结果汇总:");
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);

    if (failed === 0) {
        console.log("\n✨ 完美！ViewportTransform 所有测试通过！");
    } else {
        console.log("\n⚠️ 存在失败用例，需要修复。");
    }

    return { passed, failed };
}

export { testViewportTransform };