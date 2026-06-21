/**
 * COUNTBLANK 函数测试套件
 *
 * 运行方式: node examples/test-countblank.js
 *
 * 测试覆盖：
 * - 基础空单元格计数
 * - 混合数据（数值、文本、空值）
 * - 多维数组处理
 * - 边界情况（全空、全非空）
 * - 与其他函数配合使用
 */

async function runTests() {
    console.log('🧪 COUNTBLANK 函数测试\n');
    console.log('='.repeat(70));

    let passed = 0;
    let failed = 0;

    const { FormulaEngine } = await import('../src/formula/FormulaEngine.js');

    // 创建测试环境
    class Cell {
        constructor(value) {
            this.value = value;
        }
    }

    // 模拟 ChunkedCellStore 的结构
    class SimpleCellStore {
        constructor() { this.data = new Map(); }
        get(row, col) { return this.data.get(`${row},${col}`); }
        set(row, col, cell) { this.data.set(`${row},${col}`, cell); }
    }

    class Sheet {
        constructor() {
            this.name = 'TestSheet';
            this.cellStore = new SimpleCellStore();
        }
    }

    class Workbook {
        constructor() {
            this.sheets = new Map([['Sheet1', new Sheet()]]);
            this.formulaEngine = null;
        }
    }

    const workbook = new Workbook();
    const sheet = workbook.sheets.get('Sheet1');
    const engine = new FormulaEngine(workbook);
    workbook.formulaEngine = engine;

    /**
     * 测试辅助函数
     */
    function test(name, formula, expected, description = '') {
        try {
            const result = engine.setFormula(sheet, 100 + passed + failed, 0, formula);
            const success = result === expected || (isNaN(result) && isNaN(expected));

            if (success) {
                console.log(`✅ ${name}`);
                if (description) console.log(`   ${description}`);
                console.log(`   结果: ${result} | 预期: ${expected}\n`);
                passed++;
            } else {
                console.log(`❌ ${name}`);
                if (description) console.log(`   ${description}`);
                console.log(`   结果: ${result} | 预期: ${expected}\n`);
                failed++;
            }
        } catch (e) {
            console.error(`❌ ${name} - 异常: ${e.message}\n`);
            failed++;
        }
    }

    // ═══════════════════════════════════════════
    // 第一部分：基础功能测试
    // ═══════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第一部分：基础功能测试');
    console.log('═'.repeat(70), '\n');

    // 设置测试数据：混合空值和非空值
    // A1:A10 - 包含各种类型的值
    sheet.cellStore.set(0, 0, new Cell(100));       // A1 = 100 (数值)
    sheet.cellStore.set(1, 0, new Cell(""));         // A2 = "" (空字符串)
    sheet.cellStore.set(2, 0, new Cell("Hello"));     // A3 = "Hello" (文本)
    sheet.cellStore.set(3, 0, new Cell(null));        // A4 = null (null 值)
    sheet.cellStore.set(4, 0, new Cell(0));           // A5 = 0 (零值，不算空)
    sheet.cellStore.set(5, 0, new Cell(false));       // A6 = false (布尔值，不算空)
    sheet.cellStore.set(6, 0, new Cell(undefined));   // A7 = undefined (undefined 值)
    sheet.cellStore.set(7, 0, new Cell(" "));         // A8 = " " (空格字符，不算空)
    sheet.cellStore.set(8, 0, new Cell(3.14));        // A9 = 3.14 (浮点数)
    // A9 不设置（模拟真正未初始化的单元格）

    console.log('测试数据:');
    console.log('  A1 = 100      (数值)');
    console.log('  A2 = ""       (空字符串)');
    console.log('  A3 = "Hello"  (文本)');
    console.log('  A4 = null     (null)');
    console.log('  A5 = 0        (零值)');
    console.log('  A6 = false    (布尔值)');
    console.log('  A7 = undefined (undefined)');
    console.log('  A8 = " "      (空格)');
    console.log('  A9 = 3.14     (浮点数)');
    console.log('  A10 = [未设置] (未初始化)\n');

    test(
        'COUNTBLANK-01: 计算混合范围中的空单元格',
        '=COUNTBLANK(A1:A10)',
        4,
        'A2(""), A4(null), A7(undefined), A10(未设置) = 4个空单元格'
    );

    test(
        'COUNTBLANK-02: 全部为空的范围',
        '=COUNTBLANK(B1:B5)',
        5,
        'B列未设置任何值，全部为空'
    );

    // 设置 B 列部分数据
    sheet.cellStore.set(0, 1, new Cell(1));  // B1 = 1
    sheet.cellStore.set(2, 1, new Cell(2));  // B3 = 2

    test(
        'COUNTBLANK-03: 部分有数据的范围',
        '=COUNTBLANK(B1:B5)',
        3,
        'B1=1, B3=2 有数据，其余 3 个为空'
    );

    test(
        'COUNTBLANK-04: 全部非空的范围',
        '=COUNTBLANK(C1:C3)',
        0,
        'C列设置后无空值'
    );

    // 设置 C 列数据
    for (let i = 0; i < 3; i++) {
        sheet.cellStore.set(i, 2, new Cell(i + 10));
    }

    // ═══════════════════════════════════════════
    // 第二部分：特殊场景测试
    // ═══════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第二部分：特殊场景测试');
    console.log('═'.repeat(70), '\n');

    test(
        'COUNTBLANK-05: 单个单元格（空）',
        '=COUNTBLANK(D1)',
        1,
        'D1 未设置为空'
    );

    test(
        'COUNTBLANK-06: 单个单元格（非空）',
        '=COUNTBLANK(A1)',
        0,
        'A1 = 100，非空'
    );

    test(
        'COUNTBLANK-07: 空字符串 vs 零值',
        '=COUNTBLANK(A2:A6)',
        2,
        'A2("") 和 A4(null) 为空；A5=0 不算空'
    );

    // ═══════════════════════════════════════════
    // 第三部分：与 SUMIF/COUNT 配合使用
    // ═══════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第三部分：与其他函数配合使用');
    console.log('═'.repeat(70), '\n');

    test(
        'COUNTBLANK-08: 数据完整性检查',
        '=IF(COUNTBLANK(A1:A10)>0,"存在空数据","完整")',
        '存在空数据',
        '如果范围内有空单元格则提示'
    );

    test(
        'COUNTBLANK-09: 计算填充率',
        '=(10-COUNTBLANK(A1:A10))/10*100',
        60,
        'A1:A10 中 60% 的单元格有数据'
    );

    test(
        'COUNTBLANK-10: 结合 COUNT 使用',
        '=COUNT(A1:A10)+COUNTBLANK(A1:A10)',
        10,
        'COUNT(数值) + COUNTBLANK(空) = 总数'
    );

    // ═══════════════════════════════════════════
    // 第四部分：边界情况和错误处理
    // ═══════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第四部分：边界情况和错误处理');
    console.log('═'.repeat(70), '\n');

    test(
        'EDGE-01: 参数不足',
        '=COUNTBLANK()',
        '#VALUE!',
        '没有参数时应返回错误'
    );

    test(
        'EDGE-02: 参数过多',
        '=COUNTBLANK(A1:A10,B1:B10)',
        '#VALUE!',  // 注意：实际行为可能是只取第一个参数或报错
        '多个参数时的行为'
    );

    // ═══════════════════════════════════════════
    // 第五部分：性能测试
    // ═══════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第五部分：性能测试');
    console.log('═'.repeat(70), '\n');

    // 创建大量测试数据
    for (let i = 20; i < 120; i++) {
        if (i % 3 === 0) {
            // 每 3 个留 1 个空
            continue;  // 不设置，保持未定义状态
        }
        sheet.cellStore.set(i, 0, new Cell(Math.random() * 100));
    }

    const perfStart = performance.now();

    for (let i = 0; i < 100; i++) {
        engine.setFormula(sheet, 200 + i, 0, `=COUNTBLANK(A20:A119)`);
    }

    const perfEnd = performance.now();
    const perfDuration = perfEnd - perfStart;

    console.log(`⚡ 性能测试: 100次 COUNTBLANK 计算（100个单元格范围）`);
    console.log(`   总耗时: ${perfDuration.toFixed(2)}ms`);
    console.log(`   平均每次: ${(perfDuration / 100).toFixed(2)}ms`);
    console.log(`   性能评级: ${perfDuration < 500 ? '✅ 优秀' : perfDuration < 1000 ? '⚠️ 一般' : '❌ 需优化'}\n`);

    // ═══════════════════════════════════════════
    // 总结
    // ═══════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📊 测试总结');
    console.log('═'.repeat(70));

    const total = passed + failed;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log(`
┌─────────────────────────────────────┐
│  总测试数:  ${total.toString().padEnd(20)}│
│  ✅ 通过:   ${passed.toString().padEnd(20)}│
│  ❌ 失败:   ${failed.toString().padEnd(20)}│
│  通过率:   ${passRate.padEnd(19)}%│
└─────────────────────────────────────┘
`);

    if (passRate >= 90) {
        console.log('✨ 优秀！COUNTBLANK 实现质量很高！');
    } else if (passRate >= 70) {
        console.log('👍 良好！基本功能正常。');
    } else {
        console.log('⚠️ 需要改进！请检查失败用例。');
    }

    console.log('\n💡 COUNTBLANK 使用提示:');
    console.log('- 用于数据质量检查和清洗');
    console.log('- 可与 IF 函数结合进行条件判断');
    console.log('- 注意：空格字符 " " 不算作空白\n');

    return { total, passed, failed, passRate };
}

runTests()
    .then(result => {
        process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(error => {
        console.error('💥 测试执行异常:', error);
        process.exit(1);
    });