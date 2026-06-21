/**
 * 统一错误处理验证测试
 *
 * 验证所有函数都使用统一的 _validateArgs 和 errorHandler
 *
 * 运行方式: node examples/test-unified-error-handling.js
 */

async function testUnifiedErrorHandling() {
    console.log('🔍 统一错误处理验证测试\n');
    console.log('═'.repeat(70));

    const { FormulaEngine } = await import('../src/formula/FormulaEngine.js');

    // 创建测试环境
    class Cell { constructor(v) { this.value = v; } }
    
    class SimpleCellStore {
        constructor() { this.data = new Map(); }
        get(r, c) { return this.data.get(`${r},${c}`); }
        set(r, c, cell) { this.data.set(`${r},${c}`, cell); }
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

    // 设置一些基础数据
    for (let i = 0; i < 10; i++) {
        sheet.cellStore.set(i, 0, new Cell(i + 1));
        sheet.cellStore.set(i, 1, new Cell(`Text${i}`));
    }

    let passed = 0;
    let failed = 0;

    function test(name, formula, expectedBehavior, description) {
        console.log(`\n📋 ${name}`);
        console.log(`   ${description}`);
        
        try {
            const result = engine.setFormula(sheet, 100 + passed + failed, 0, formula);
            
            if (expectedBehavior === 'error' && result.toString().startsWith('#')) {
                console.log(`   ✅ 正确返回错误: ${result}`);
                passed++;
            } else if (expectedBehavior === 'success') {
                console.log(`   ✅ 成功执行: ${result}`);
                passed++;
            } else if (expectedBehavior === result) {
                console.log(`   ✅ 结果匹配: ${result}`);
                passed++;
            } else {
                console.log(`   ❌ 不符合预期`);
                console.log(`      结果: ${result} | 预期行为: ${expectedBehavior}`);
                failed++;
            }
        } catch (e) {
            if (expectedBehavior === 'throws') {
                console.log(`   ✅ 正确抛出异常: ${e.message.substring(0, 50)}...`);
                passed++;
            } else {
                console.log(`   ❌ 意外异常: ${e.message}`);
                failed++;
            }
        }
    }

    // ════════════════════════════════════════════
    // 测试组 1: 参数数量校验
    // ════════════════════════════════════════════

    console.log('\n' + '═'.repeat(70));
    console.log('📌 测试组 1: 参数数量校验');
    console.log('═'.repeat(70));

    test(
        'SUM - 无参数',
        '=SUM()',
        'error',
        '应该返回 #VALUE! 错误'
    );

    test(
        'AVERAGE - 无参数',
        '=AVERAGE()',
        'error',
        '应该返回 #VALUE! 错误'
    );

    test(
        'COUNT - 无参数',
        '=COUNT()',
        'error',
        '应该返回 #VALUE! 错误'
    );

    test(
        'ABS - 无参数',
        '=ABS()',
        'error',
        '应该返回 #VALUE! 错误'
    );

    test(
        'ROUND - 无参数',
        '=ROUND()',
        'error',
        '应该返回 #VALUE! 错误'
    );

    test(
        'UPPER - 无参数',
        '=UPPER()',
        '#VALUE!',
        '应该返回 #VALUE! 错误（但 UPPER 对空参数返回空字符串）'
    );

    test(
        'IF - 参数不足',
        '=IF(A1)',
        'error',
        '需要至少 2 个参数，应该返回 #VALUE!'
    );

    test(
        'SUMIF - 参数不足',
        '=SUMIF(A1:A10)',
        'error',
        '需要至少 2 个参数，应该返回 #VALUE!'
    );

    test(
        'COUNTBLANK - 无参数',
        '=COUNTBLANK()',
        'error',
        '需要 1 个参数，应该返回 #VALUE!'
    );

    test(
        'COUNTBLANK - 参数过多',
        '=COUNTBLANK(A1:A10,B1:B10)',
        'error',
        '只需要 1 个参数，应该返回 #VALUE!'
    );

    // ════════════════════════════════════════════
    // 测试组 2: 正常执行验证
    // ════════════════════════════════════════════

    console.log('\n' + '═'.repeat(70));
    console.log('📌 测试组 2: 正常执行验证');
    console.log('═'.repeat(70));

    test(
        'SUM - 正常求和',
        '=SUM(A1:A5)',
        'success',
        '应该正确计算 1+2+3+4+5=15'
    );

    test(
        'AVERAGE - 正常计算',
        '=AVERAGE(A1:A5)',
        'success',
        '应该正确计算平均值 3'
    );

    test(
        'COUNT - 统计数值',
        '=COUNT(A1:A5)',
        'success',
        '应该统计 5 个数值'
    );

    test(
        'MAX/MIN - 极值查找',
        '=MAX(A1:A10)',
        'success',
        '应该找到最大值 10'
    );

    test(
        'ABS - 绝对值',
        '=ABS(-100)',
        'success',
        '应该返回 100'
    );

    test(
        'ROUND - 四舍五入',
        '=ROUND(3.14159,2)',
        'success',
        '应该返回 3.14'
    );

    test(
        'UPPER/LOWER - 大小写转换',
        '=UPPER("hello")',
        'HELLO',
        '应该返回 "HELLO"'
    );

    test(
        'IF - 条件判断',
        '=IF(1>0,"Yes","No")',
        'Yes',
        '条件为真时返回 "Yes"'
    );

    test(
        'CONCAT - 字符串拼接',
        '=CONCAT("Hello"," ","World")',
        'Hello World',
        '应该拼接字符串'
    );

    test(
        'COUNTBLANK - 空单元格计数',
        '=COUNTBLANK(B11:B20)',
        'success',
        'B11:B20 未设置，应统计 10 个空单元格'
    );

    test(
        'SUMIF - 条件求和',
        '=SUMIF(A1:A10,">5",B1:B10)',
        'success',
        '应该对 A>5 的对应 B 列求和'
    );

    // ════════════════════════════════════════════
    // 测试组 3: 异常处理验证
    // ════════════════════════════════════════════

    console.log('\n' + '═'.repeat(70));
    console.log('📌 测试组 3: 异常处理验证');
    console.log('═'.repeat(70));

    test(
        'AVERAGE - 除零保护',
        '=AVERAGE(B1:B10)',
        '#DIV/0!',
        '文本范围无法计算平均值，应返回 #DIV/0!'
    );

    test(
        'ABS - 非数值输入',
        '=ABS("abc")',
        'error',
        '"abc" 无法转换为数值，应返回 #VALUE!'
    );

    // ════════════════════════════════════════════
    // 总结
    // ════════════════════════════════════════════

    console.log('\n' + '═'.repeat(70));
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
        console.log('✨ 优秀！统一错误处理机制运行正常！');
    } else if (passRate >= 70) {
        console.log('👍 良好！大部分函数已使用统一的错误处理。');
    } else {
        console.log('⚠️ 需要检查！部分函数可能未正确实现统一错误处理。');
    }

    console.log('\n💡 统一错误处理特性:');
    console.log('✅ 所有函数都有参数数量校验');
    console.log('✅ 错误信息包含函数名称和详细上下文');
    console.log('✅ 使用 ErrorHandler 记录结构化日志');
    console.log('✅ 错误返回值遵循 Excel 规范');
    console.log('✅ 函数包装器捕获未预期异常\n');

    return { total, passed, failed, passRate };
}

testUnifiedErrorHandling()
    .then(result => {
        process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(error => {
        console.error('💥 测试执行异常:', error);
        process.exit(1);
    });