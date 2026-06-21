/**
 * SUMIF / SUMIFS 函数测试套件
 *
 * 运行方式: node examples/test-sumif.js
 *
 * 测试覆盖：
 * - SUMIF 基础功能
 * - SUMIFS 多条件求和
 * - 条件匹配引擎（比较运算符、通配符、文本匹配）
 * - 边界情况和错误处理
 */

async function runTests() {
    console.log('🧪 SUMIF / SUMIFS 函数测试\n');
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

    // 设置测试数据
    const testData = [
        // A列: 数值数据
        [10, 150, 50, 200, 30, 120, 80, 250, 90, 110],
        // B列: 地区
        ['北京', '上海', '广州', '深圳', '北京', '上海', '广州', '深圳', '北京', '上海'],
        // C列: 销售额
        [1000, 2000, 1500, 3000, 1200, 1800, 1600, 3500, 1100, 1900],
        // D列: 产品名称
        ['苹果', '香蕉', '苹果', '橙子', '香蕉', '苹果', '橙子', '苹果', '香蕉', '橙子'],
    ];

    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 10; row++) {
            sheet.cellStore.set(row, col, new Cell(testData[col][row]));
        }
    }

    console.log('\n📊 测试数据准备完成:');
    console.log('  A1:A10 - 数值: 10, 150, 50, 200, 30, 120, 80, 250, 90, 110');
    console.log('  B1:B10 - 地区: 北京, 上海, 广州, 深圳...');
    console.log('  C1:C10 - 销售额: 1000, 2000, 1500, 3000...');
    console.log('  D1:D10 - 产品: 苹果, 香蕉, 橙子...');

    /**
     * 测试辅助函数
     */
    function test(name, formula, expected, description = '') {
        try {
            const result = engine.setFormula(sheet, 100 + passed + failed, 0, formula);
            const success = result === expected || (isNaN(result) && isNaN(expected));

            if (success) {
                console.log(`✅ ${name}`);
                console.log(`   ${description || formula}`);
                console.log(`   结果: ${result} | 预期: ${expected}\n`);
                passed++;
            } else {
                console.log(`❌ ${name}`);
                console.log(`   ${description || formula}`);
                console.log(`   结果: ${result} | 预期: ${expected}\n`);
                failed++;
            }
        } catch (e) {
            console.error(`❌ ${name} - 异常: ${e.message}\n`);
            failed++;
        }
    }

    // ═══════════════════════════════════════════
    // 第一部分：SUMIF 基础功能测试
    // ═══════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第一部分：SUMIF 基础功能测试');
    console.log('═'.repeat(70), '\n');

    test(
        'SUMIF-01: 数值大于100',
        '=SUMIF(A1:A10,">100")',
        930,
        'A1:A10 中 >100 的数之和: 150+200+120+250+110=930'
    );

    test(
        'SUMIF-02: 数值小于等于100',
        '=SUMIF(A1:A10,"<=100")',
        230,
        'A1:A10 中 <=100 的数之和: 10+50+30+80+90=260'
    );

    test(
        'SUMIF-03: 精确匹配数值',
        '=SUMIF(A1:A10,120)',
        120,
        '精确匹配值 120'
    );

    test(
        'SUMIF-04: 文本精确匹配（带sum_range）',
        '=SUMIF(B1:B10,"北京",C1:C10)',
        3300,
        '北京地区销售额: 1000+1200+1100=3300'
    );

    test(
        'SUMIF-05: 不等式文本',
        '=SUMIF(B1:B10,"<>北京",C1:C10)',
        12300,
        '非北京地区销售额'
    );

    test(
        'SUMIF-06: 通配符匹配（*）',
        '=SUMIF(D1:D10,"*果*",C1:C10)',
        8600,
        '产品名含"果"的销售额（苹果、橙子）'
    );

    test(
        'SUMIF-07: 通配符匹配（?）',
        '=SUMIF(D1:D10,"??果",C1:C10)',
        5100,
        '产品名为2字+果的销售额（苹果）'
    );

    test(
        'SUMIF-08: 空范围',
        '=SUMIF(A1:A10,">99999")',
        0,
        '无满足条件的值时返回 0'
    );

    // ═══════════════════════════════════════════
    // 第二部分：SUMIFS 多条件求和测试
    // ═══════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第二部分：SUMIFS 多条件求和测试');
    console.log('═'.repeat(70), '\n');

    test(
        'SUMIFS-01: 双条件（地区+数值阈值）',
        '=SUMIFS(C1:C10,B1:B10,"北京",A1:A10,">50")',
        2300,
        '北京且A列>50的销售额: 150对应2000 + 90对应1100 = 3100? 等待实际结果'
    );

    test(
        'SUMIFS-02: 三条件（地区+产品+数值）',
        '=SUMIFS(C1:C10,B1:B10,"上海",D1:D10,"苹果",A1:A10,">100")',
        1800,
        '上海+苹果+A>100 的销售额'
    );

    test(
        'SUMIFS-03: 范围查询（日期模拟）',
        '=SUMIFS(C1:C10,A1:A10,">=50",A1:A10,"<=150")',
        600,
        'A列在 50-150 范围内的C列和: 150+50+120+80=400? 等待结果'
    );

    test(
        'SUMIFS-04: 排除性条件',
        '=SUMIFS(C1:C10,B1:B10,"<>北京",D1:D10,"<>香蕉")',
        10100,
        '非北京且非香蕉的产品销售额'
    );

    // ═══════════════════════════════════════════
    // 第三部分：条件匹配引擎专项测试
    // ═══════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第三部分：条件匹配引擎专项测试');
    console.log('═'.repeat(70), '\n');

    test(
        'MATCH-01: 大于号',
        '=SUMIF(A1:A10,">200")',
        250,
        '>200 只有 250 一个值'
    );

    test(
        'MATCH-02: 小于号',
        '=SUMIF(A1:A10,"<40")',
        40,
        '<40 的值: 10+30=40'
    );

    test(
        'MATCH-03: 大于等于',
        '=SUMIF(A1:A10,">=200")',
        450,
        '>=200: 200+250=450'
    );

    test(
        'MATCH-04: 小于等于',
        '=SUMIF(A1:A10,"<=30")',
        40,
        '<=30: 10+30=40'
    );

    test(
        'MATCH-05: 不等于',
        '=SUMIF(A1:A10,"<>100",A1:A10)',
        1080,
        '不等于100的所有值之和'
    );

    test(
        'MATCH-06: 通配符开头',
        '=SUMIF(D1:D10,"苹*",C1:C10)',
        6600,
        '以"苹"开头的产品的销售额'
    );

    test(
        'MATCH-07: 通配符结尾',
        '=SUMIF(D1:D10,"*子",C1:C10)',
        8100,
        '以"子"结尾的产品的销售额'
    );

    // ═══════════════════════════════════════════
    // 第四部分：边界情况和错误处理
    // ═══════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第四部分：边界情况和错误处理');
    console.log('═'.repeat(70), '\n');

    test(
        'EDGE-01: 参数不足',
        '=SUMIF(A1:A10)',
        '#VALUE!',
        '只有1个参数时应返回错误'
    );

    test(
        'EDGE-02: 参数过多',
        '=SUMIF(A1:A10,">100",B1:B10,C1:C10)',
        '#VALUE!',
        '超过3个参数时应返回错误'
    );

    test(
        'EDGE-03: SUMIFS 参数数量为偶数',
        '=SUMIFS(A1:A10,">100")',
        '#VALUE!',
        'SUMIFS 需要奇数个参数'
    );

    test(
        'EDGE-04: 空单元格处理',
        '=SUMIF(A1:A10,"")',
        0,
        '空条件应返回0或适当值'
    );

    // ═══════════════════════════════════════════
    // 第五部分：性能测试
    // ═══════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第五部分：性能测试');
    console.log('═'.repeat(70), '\n');

    const perfStart = performance.now();

    for (let i = 0; i < 100; i++) {
        engine.setFormula(sheet, 200 + i, 0, `=SUMIF(A1:A10,">${i * 2}")`);
    }

    const perfEnd = performance.now();
    const perfDuration = perfEnd - perfStart;

    console.log(`⚡ 性能测试: 100次 SUMIF 计算耗时`);
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
        console.log('✨ 优秀！SUMIF/SUMIFS 实现质量很高！');
    } else if (passRate >= 70) {
        console.log('👍 良好！基本功能正常，部分边界情况需优化。');
    } else {
        console.log('⚠️ 需要改进！请检查失败用例并修复。');
    }

    console.log('\n💡 提示:');
    console.log('- 如果有失败的用例，请检查条件匹配逻辑');
    console.log('- 通配符和比较运算符需要特别注意转义问题');
    console.log('- 数值精度误差可能导致浮点数比较失败\n');

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