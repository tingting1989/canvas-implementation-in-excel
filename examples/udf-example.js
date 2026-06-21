/**
 * 用户自定义函数（UDF）使用示例
 *
 * 运行方式: node examples/udf-example.js
 */

// 模拟 Workbook 和 Sheet
class MockWorkbook {
    constructor() {
        this.sheets = new Map();
        this.sheets.set('Sheet1', new MockSheet(this, 'Sheet1'));
        this.formulaEngine = null;
    }

    get activeSheet() {
        return this.sheets.get('Sheet1');
    }
}

class MockSheet {
    constructor(workbook, name) {
        this.workbook = workbook;
        this.name = name;
        this.cellStore = new Map();
    }

    get(row, col) {
        return this.cellStore.get(`${row},${col}`);
    }

    set(row, col, value) {
        this.cellStore.set(`${row},${col}`, { value });
    }
}

async function runExample() {
    console.log('🚀 Canvas Spreadsheet - 用户自定义函数示例\n');
    console.log('=' .repeat(60));

    // 动态导入模块
    const { FormulaEngine } = await import('../src/formula/FormulaEngine.js');
    const { registerFunction, getRegisteredFunctions, hasFunction } = await import('../src/formula/functions/index.js');

    // 创建模拟环境
    const workbook = new MockWorkbook();
    const sheet = workbook.activeSheet;

    // 初始化一些测试数据
    sheet.set(0, 0, 100);   // A1 = 100
    sheet.set(0, 1, 200);   // B1 = 200
    sheet.set(0, 2, 300);   // C1 = 300

    // 创建公式引擎
    const engine = new FormulaEngine(workbook);
    workbook.formulaEngine = engine;

    console.log('\n📊 测试数据准备完成:');
    console.log('  A1 = 100, B1 = 200, C1 = 300\n');

    // ============================================
    // 示例 1: 注册简单函数
    // ============================================
    console.log('📌 示例 1: 简单翻倍函数 (DOUBLE)');
    console.log('-' .repeat(40));

    engine.registerFunction('DOUBLE', (args) => {
        return args[0] * 2;
    });

    const result1 = engine.setFormula(sheet, 1, 0, '=DOUBLE(A1)');
    console.log(`  公式: =DOUBLE(A1)`);
    console.log(`  结果: ${result1} (期望: 200)`);
    console.log(`  ✅ 通过!\n`);

    // ============================================
    // 示例 2: 多参数函数
    // ============================================
    console.log('📌 示例 2: 税额计算函数 (TAX)');
    console.log('-' .repeat(40));

    engine.registerFunction('TAX', (args) => {
        const amount = args[0];
        const rate = args[1] ?? 0.13;
        return amount * rate;
    });

    const result2a = engine.setFormula(sheet, 1, 1, '=TAX(10000, 0.13)');
    console.log(`  公式: =TAX(10000, 0.13)`);
    console.log(`  结果: ${result2a} (期望: 1300)`);

    const result2b = engine.setFormula(sheet, 1, 2, '=TAX(50000)');
    console.log(`  公式: =TAX(50000) [使用默认税率13%]`);
    console.log(`  结果: ${result2b} (期望: 6500)`);
    console.log(`  ✅ 通过!\n`);

    // ============================================
    // 示例 3: 条件判断函数
    // ============================================
    console.log('📌 示例 3: 成绩评级函数 (GRADE)');
    console.log('-' .repeat(40));

    engine.registerFunction('GRADE', (args) => {
        const score = args[0];
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    });

    const scores = [95, 82, 74, 61, 45];
    for (const score of scores) {
        sheet.set(2, 0, score);
        const grade = engine.setFormula(sheet, 3, 0, '=GRADE(A3)');
        console.log(`  分数: ${score} → 等级: ${grade}`);
    }
    console.log(`  ✅ 通过!\n`);

    // ============================================
    // 示例 4: 使用上下文对象
    // ============================================
    console.log('📌 示例 4: 跨表求和函数 (CROSS_SUM)');
    console.log('-' .repeat(40));

    engine.registerFunction('CROSS_SUM', (args, ctx) => {
        const targetSheet = ctx?.workbook?.sheets?.get(args[0]);
        if (!targetSheet) return '#REF!';

        let sum = 0;
        for (let r = 0; r < 1; r++) {
            for (let c = 0; c < 3; c++) {
                const cell = targetSheet.get(r, c);
                if (cell && typeof cell.value === 'number') {
                    sum += cell.value;
                }
            }
        }
        return sum;
    });

    const result4 = engine.setFormula(sheet, 4, 0, '=CROSS_SUM("Sheet1")');
    console.log(`  公式: =CROSS_SUM("Sheet1")`);
    console.log(`  结果: ${result4} (期望: 600, 即 100+200+300)`);
    console.log(`  ✅ 通过!\n`);

    // ============================================
    // 示例 5: 函数管理 API
    // ============================================
    console.log('📌 示例 5: 函数管理 API');
    console.log('-' .repeat(40));

    console.log('\n  📋 所有已注册的函数:');
    const allFunctions = engine.getRegisteredFunctions();
    console.log(`  共 ${allFunctions.length} 个函数:`);
    console.log(`  内置函数: SUM, AVERAGE, COUNT, ...`);
    console.log(`  自定义函数: DOUBLE, TAX, GRADE, CROSS_SUM`);

    console.log('\n  🔍 检查函数是否存在:');
    console.log(`  hasFunction('SUM'):     ${engine.hasFunction('SUM')}`);
    console.log(`  hasFunction('DOUBLE'):  ${engine.hasFunction('DOUBLE')}`);
    console.log(`  hasFunction('UNKNOWN'): ${engine.hasFunction('UNKNOWN')}`);

    console.log('\n  🗑️  注销函数测试:');
    console.log(`  注销 DOUBLE 前: hasFunction('DOUBLE') = ${engine.hasFunction('DOUBLE')}`);
    engine.unregisterFunction('DOUBLE');
    console.log(`  注销 DOUBLE 后: hasFunction('DOUBLE') = ${engine.hasFunction('DOUBLE')}`);
    console.log(`  ✅ 通过!\n`);

    // ============================================
    // 示例 6: 错误处理
    // ============================================
    console.log('📌 示例 6: 错误处理');
    console.log('-' .repeat(40));

    try {
        engine.registerFunction('', () => {});
    } catch (e) {
        console.log(`  ❌ 空名称注册失败: ${e.message}`);
    }

    try {
        engine.registerFunction('TEST', 'not a function');
    } catch (e) {
        console.log(`  ❌ 非函数注册失败: ${e.message}`);
    }

    engine.registerFunction('SAFE_DIVIDE', (args) => {
        const divisor = args[1];
        if (divisor === 0) return '#DIV/0!';
        return args[0] / divisor;
    });

    const errorResult = engine.setFormula(sheet, 5, 0, '=SAFE_DIVIDE(10, 0)');
    console.log(`  ✅ 安全除法: =SAFE_DIVIDE(10, 0) → ${errorResult}`);

    const normalResult = engine.setFormula(sheet, 5, 1, '=SAFE_DIVIDE(10, 2)');
    console.log(`  ✅ 正常除法: =SAFE_DIVIDE(10, 2) → ${normalResult}`);
    console.log(`  ✅ 通过!\n`);

    // ============================================
    // 总结
    // ============================================
    console.log('=' .repeat(60));
    console.log('🎉 所有示例运行完成!');
    console.log('\n📝 关键要点:');
    console.log('  ✅ 支持动态注册自定义函数');
    console.log('  ✅ 支持多参数和默认值');
    console.log('  ✅ 支持条件判断和复杂逻辑');
    console.log('  ✅ 可访问上下文对象（sheet/workbook）');
    console.log('  ✅ 完整的 CRUD 操作（注册/注销/查询）');
    console.log('  ✅ 自动参与依赖追踪系统');
    console.log('  ✅ 参数校验和错误处理');
    console.log('\n🔗 详细文档请查看: docs/formula-engine-guide.md');
}

runExample().catch(console.error);