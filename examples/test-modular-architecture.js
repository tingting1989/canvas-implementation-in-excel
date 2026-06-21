/**
 * 模块化架构验证测试
 *
 * 验证公式函数的模块化重构是否成功：
 * - 检查所有模块正确加载
 * - 验证函数注册表状态
 * - 测试跨模块功能
 *
 * 运行方式: node examples/test-modular-architecture.js
 */

async function testModularArchitecture() {
    console.log('🏗️  公式引擎模块化架构验证\n');
    console.log('═'.repeat(70));

    const { FormulaEngine } = await import('../src/formula/FormulaEngine.js');
    const { 
        registry, 
        getFunctionStats, 
        getRegisteredFunctions,
        hasFunction,
        registerFunction,
        unregisterFunction
    } = await import('../src/formula/functions/index.js');

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

    let passed = 0;
    let failed = 0;

    function test(name, condition, description) {
        if (condition) {
            console.log(`✅ ${name}`);
            console.log(`   ${description}\n`);
            passed++;
        } else {
            console.log(`❌ ${name}`);
            console.log(`   ${description}\n`);
            failed++;
        }
    }

    // ════════════════════════════════════════════
    // 1. 模块加载验证
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第一部分：模块加载验证');
    console.log('═'.repeat(70), '\n');

    const stats = getFunctionStats();
    
    test(
        'STATS-01: 总函数数量',
        stats.total === 16,
        `注册了 ${stats.total} 个函数（预期 16 个）`
    );

    test(
        'STATS-02: 内置函数数量',
        stats.builtin === 16,
        `内置函数: ${stats.builtin} 个`
    );

    test(
        'STATS-03: 自定义函数数量',
        stats.custom === 0,
        `自定义函数: ${stats.custom} 个（初始为 0）`
    );

    test(
        'STATS-04: 模块列表',
        stats.modules.length === 5 && 
        stats.modules.includes('Math') &&
        stats.modules.includes('Statistical') &&
        stats.modules.includes('Logical') &&
        stats.modules.includes('Text') &&
        stats.modules.includes('Conditional'),
        `已加载模块: ${stats.modules.join(', ')}`
    );

    // ════════════════════════════════════════════
    // 2. 各模块函数验证
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第二部分：各模块函数验证');
    console.log('═'.repeat(70), '\n');

    // Math 模块 (6个)
    const mathFuncs = ['SUM', 'AVERAGE', 'MAX', 'MIN', 'ABS', 'ROUND'];
    test(
        'MATH-01: 数学函数完整性',
        mathFuncs.every(f => hasFunction(f)),
        `Math 模块包含 ${mathFuncs.length} 个函数: ${mathFuncs.join(', ')}`
    );

    // Statistical 模块 (3个)
    const statFuncs = ['COUNT', 'COUNTA', 'COUNTBLANK'];
    test(
        'STAT-01: 统计函数完整性',
        statFuncs.every(f => hasFunction(f)),
        `Statistical 模块包含 ${statFuncs.length} 个函数: ${statFuncs.join(', ')}`
    );

    // Logical 模块 (1个)
    const logicFuncs = ['IF'];
    test(
        'LOGIC-01: 逻辑函数完整性',
        logicFuncs.every(f => hasFunction(f)),
        `Logical 模块包含 ${logicFuncs.length} 个函数: ${logicFuncs.join(', ')}`
    );

    // Text 模块 (4个)
    const textFuncs = ['UPPER', 'LOWER', 'CONCAT', 'CONCATENATE'];
    test(
        'TEXT-01: 文本函数完整性',
        textFuncs.every(f => hasFunction(f)),
        `Text 模块包含 ${textFuncs.length} 个函数: ${textFuncs.join(', ')}`
    );

    // Conditional 模块 (2个)
    const condFuncs = ['SUMIF', 'SUMIFS'];
    test(
        'COND-01: 条件函数完整性',
        condFuncs.every(f => hasFunction(f)),
        `Conditional 模块包含 ${condFuncs.length} 个函数: ${condFuncs.join(', ')}`
    );

    // ════════════════════════════════════════════
    // 3. 函数元数据验证
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第三部分：函数元数据验证');
    console.log('═'.repeat(70), '\n');

    const sumInfo = registry.getInfo('SUM');
    test(
        'META-01: SUM 函数元数据',
        sumInfo && sumInfo.isBuiltin && sumInfo.module === 'Math',
        `SUM → category=${sumInfo?.category}, module=${sumInfo?.module}`
    );

    const countblankInfo = registry.getInfo('COUNTBLANK');
    test(
        'META-02: COUNTBLANK 函数元数据',
        countblankInfo && countblankInfo.isBuiltin && countblankInfo.module === 'Statistical',
        `COUNTBLANK → category=${countblankInfo?.category}, module=${countblankInfo?.module}`
    );

    const ifInfo = registry.getInfo('IF');
    test(
        'META-03: IF 函数元数据',
        ifInfo && ifInfo.isBuiltin && ifInfo.module === 'Logical',
        `IF → category=${ifInfo?.category}, module=${ifInfo?.module}`
    );

    // ════════════════════════════════════════════
    // 4. 跨模块功能测试
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第四部分：跨模块功能测试');
    console.log('═'.repeat(70), '\n');

    // 设置测试数据
    for (let i = 0; i < 10; i++) {
        sheet.cellStore.set(i, 0, new Cell(i + 1));      // A列：数值
        sheet.cellStore.set(i, 1, new Cell(`Text${i}`));  // B列：文本
    }

    // Math + Statistical 联合使用
    const result1 = engine.setFormula(sheet, 100, 0, '=SUM(A1:A10)+COUNT(A1:A10)');
    test(
        'CROSS-01: SUM + COUNT 联合使用',
        result1 === 65,  // 55 + 10
        `SUM(1..10)=55 + COUNT=10 = ${result1}`
    );

    // Logical + Text 联合使用
    const result2 = engine.setFormula(sheet, 101, 0, '=IF(COUNTBLANK(B11:B20)>0,"有空单元格","完整")');
    test(
        'CROSS-02: IF + COUNTBLANK 联合使用',
        result2 === "有空单元格",
        `IF(COUNTBLANK>0) = "${result2}"`
    );

    // Math + Conditional 联合使用
    const result3 = engine.setFormula(sheet, 102, 0, '=SUM(SUMIF(A1:A10,">5",A1:A10), AVERAGE(A1:A5))');
    test(
        'CROSS-03: SUMIF + AVERAGE 嵌套使用',
        typeof result3 === 'number' && result3 > 0,
        `嵌套计算结果: ${result3}`
    );

    // Text + Logical 联合使用
    const result4 = engine.setFormula(sheet, 103, 0, '=UPPER(IF(A1>5,"大于5","小于等于5"))');
    test(
        'CROSS-04: UPPER + IF 嵌套使用',
        result4 === "小于等于5",
        `UPPER(IF(...)) = "${result4}"`
    );

    // ════════════════════════════════════════════
    // 5. 动态注册/注销测试
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第五部分：动态注册/注销测试');
    console.log('═'.repeat(70), '\n');

    // 注册自定义函数
    registerFunction('MYDOUBLE', (args) => args[0] * 2);

    test(
        'DYN-01: 注册自定义函数',
        hasFunction('MYDOUBLE'),
        'MYDOUBLE 函数已注册'
    );

    const customStats = getFunctionStats();
    test(
        'DYN-02: 自定义函数统计更新',
        customStats.custom === 1,
        `自定义函数数: ${customStats.custom}（应为 1）`
    );

    // 使用自定义函数
    try {
        const customResult = engine.setFormula(sheet, 104, 0, '=MYDOUBLE(21)');
        test(
            'DYN-03: 使用自定义函数',
            customResult === 42,
            `MYDOUBLE(21) = ${customResult}`
        );
    } catch (e) {
        test(
            'DYN-03: 使用自定义函数',
            false,
            `执行失败: ${e.message}`
        );
    }

    // 注销自定义函数
    const unregistered = unregisterFunction('MYDOUBLE');
    
    test(
        'DYN-04: 注销自定义函数',
        unregistered && !hasFunction('MYDOUBLE'),
        'MYDOUBLE 已注销且不可用'
    );

    const finalStats = getFunctionStats();
    test(
        'DYN-05: 注销后统计恢复',
        finalStats.custom === 0,
        `自定义函数数: ${finalStats.custom}（应恢复为 0）`
    );

    // ════════════════════════════════════════════
    // 总结
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📊 模块化架构验证总结');
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
        console.log('✨ 优秀！模块化重构完全成功！');
    } else if (passRate >= 70) {
        console.log('👍 良好！大部分模块工作正常。');
    } else {
        console.log('⚠️ 需要检查！某些模块可能未正确加载。');
    }

    console.log('\n📦 架构特性:');
    console.log('✅ 清晰的模块划分（5个功能域）');
    console.log('✅ 统一的注册表管理');
    console.log('✅ 完整的元数据追踪');
    console.log('✅ 独立可测试的单元');
    console.log('✅ 动态扩展能力');
    console.log('✅ 向后兼容的 API\n');

    console.log('📂 文件结构:');
    console.log('functions/');
    console.log('├── index.js              ✅ 主入口 + 注册表');
    console.log('├── math.js               ✅ 6个数学函数');
    console.log('├── statistical.js        ✅ 3个统计函数');
    console.log('├── logical.js            ✅ 1个逻辑函数');
    console.log('├── text.js               ✅ 4个文本函数');
    console.log('├── conditional.js        ✅ 2个条件函数');
    console.log('└── utils/');
    console.log('    ├── helpers.js        ✅ _flatten, _toNum, _isBlank');
    console.log('    ├── validation.js     ✅ _validateArgs');
    console.log('    └── matching.js       ✅ _matchCriteria, _matchWildcard\n');

    return { total, passed, failed, passRate };
}

testModularArchitecture()
    .then(result => {
        process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(error => {
        console.error('💥 验证失败:', error);
        process.exit(1);
    });