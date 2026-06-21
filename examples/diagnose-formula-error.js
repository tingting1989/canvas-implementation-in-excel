/**
 * 公式计算错误诊断工具
 *
 * 运行方式: node examples/diagnose-formula-error.js
 *
 * 用途：诊断 #NAME? 等公式错误的原因
 */

async function diagnose() {
    console.log('🔍 Canvas Spreadsheet - 公式错误诊断工具\n');
    console.log('=' .repeat(60));

    try {
        // 1. 测试模块导入
        console.log('\n📦 步骤 1: 检查模块导入...\n');

        let functionsModule, errorHandlerModule, formulaEngineModule, evaluatorModule;

        try {
            functionsModule = await import('../src/formula/functions/index.js');
            console.log('✅ functions/index.js 导入成功');
        } catch (e) {
            console.error('❌ functions/index.js 导入失败:', e.message);
            return;
        }

        try {
            errorHandlerModule = await import('../src/core/ErrorHandler.js');
            console.log('✅ core/ErrorHandler.js 导入成功');
        } catch (e) {
            console.error('❌ core/ErrorHandler.js 导入失败:', e.message);
            return;
        }

        // 2. 检查 FUNCTIONS 对象
        console.log('\n📊 步骤 2: 检查函数注册表...\n');

        const { FUNCTIONS, getRegisteredFunctions } = functionsModule;

        console.log('FUNCTIONS 类型:', typeof FUNCTIONS);
        console.log('FUNCTIONS 是否为 Map:', FUNCTIONS instanceof Map);

        if (typeof FUNCTIONS.get === 'function') {
            console.log('✅ FUNCTIONS 支持 .get() 方法 (Map 对象)');
        } else if (typeof FUNCTIONS === 'object' && FUNCTIONS !== null) {
            console.log('⚠️  FUNCTIONS 是普通对象（不支持 .get()）');
        } else {
            console.error('❌ FUNCTIONS 无效:', FUNCTIONS);
            return;
        }

        // 3. 列出已注册的函数
        console.log('\n📋 步骤 3: 已注册的函数列表:\n');

        if (typeof getRegisteredFunctions === 'function') {
            const registeredFuncs = getRegisteredFunctions();
            console.log(`共 ${registeredFuncs.length} 个函数已注册:`);
            registeredFuncs.forEach((name, index) => {
                const fn = FUNCTIONS.get(name);
                console.log(`  ${index + 1}. ${name} - ${typeof fn === 'function' ? '✅ 有效' : '❌ 无效'}`);
            });
        } else {
            console.error('❌ getRegisteredFunctions 不是函数');
        }

        // 4. 测试 SUM 函数查找
        console.log('\n🔎 步骤 4: 测试 SUM 函数查找...\n');

        const testNames = ['SUM', 'sum', 'Sum', 'AVERAGE', 'IF'];
        for (const name of testNames) {
            const fn = FUNCTIONS.get(name.toUpperCase());
            console.log(`  查找 "${name}" → ${fn ? '✅ 找到' : '❌ 未找到'}`);
        }

        // 5. 创建模拟环境测试完整流程
        console.log('\n🧪 步骤 5: 完整公式计算测试...\n');

        const { FormulaEngine } = await import('../src/formula/FormulaEngine.js');
        const { errorHandler, ERROR_CODE } = errorHandlerModule;

        // 配置错误处理器（显示所有日志）
        errorHandler.configure({
            level: 0,
            devMode: true,
            throwOnFatal: false
        });

        // Mock Workbook
        class MockWorkbook {
            constructor() {
                this.sheets = new Map();
                this.formulaEngine = null;
                this.createSheet('Sheet1');
            }

            createSheet(name) {
                const sheet = new MockSheet(this, name);
                this.sheets.set(name, sheet);
                return sheet;
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
                const cellData = typeof value === 'object' ? value : { value };
                if (!cellData.styleId) cellData.styleId = null;
                if (!cellData.disabled) cellData.disabled = false;
                if (!cellData.formula) cellData.formula = null;
                this.cellStore.set(`${row},${col}`, cellData);
            }

            static Cell = class Cell {
                constructor(value, styleId, disabled, formula) {
                    this.value = value;
                    this.styleId = styleId;
                    this.disabled = disabled;
                    this.formula = formula;
                }
            }
        }

        const workbook = new MockWorkbook();
        const sheet = workbook.activeSheet;

        // 设置测试数据
        sheet.set(0, 0, 1);   // A1 = 1
        sheet.set(1, 0, 2);   // A2 = 2

        console.log('测试数据:');
        console.log('  A1 = 1');
        console.log('  A2 = 2\n');

        // 创建引擎
        const engine = new FormulaEngine(workbook);
        workbook.formulaEngine = engine;

        // 测试 SUM 函数
        console.log('测试公式: =SUM(A1:A2)');
        try {
            const result = engine.setFormula(sheet, 2, 0, '=SUM(A1:A2)');
            console.log(`结果: ${result}`);
            console.log(`预期: 3`);
            console.log(`状态: ${result === 3 ? '✅ 通过' : '❌ 失败'}\n`);
        } catch (e) {
            console.error(`异常: ${e.message}\n`);
        }

        // 测试其他函数
        const testCases = [
            { formula: '=AVERAGE(A1:A2)', expected: 1.5, desc: '平均值' },
            { formula: '=MAX(A1:A2)', expected: 2, desc: '最大值' },
            { formula: '=MIN(A1:A2)', expected: 1, desc: '最小值' },
            { formula: '=IF(A1>0,"正数","负数")', expected: '正数', desc: '条件判断' },
            { formula: '=ABS(-5)', expected: 5, desc: '绝对值' },
            { formula: '=ROUND(3.14159,2)', expected: 3.14, desc: '四舍五入' },
        ];

        console.log('\n更多测试用例:');
        console.log('-'.repeat(60));

        for (const tc of testCases) {
            try {
                const result = engine.setFormula(sheet, 10, 0, tc.formula);
                const status = result === tc.expected ? '✅' : '❌';
                console.log(`${status} ${tc.desc}: ${tc.formula} = ${result} (预期: ${tc.expected})`);
            } catch (e) {
                console.log(`❌ ${tc.desc}: 异常 - ${e.message}`);
            }
        }

        // 6. 错误场景测试
        console.log('\n\n错误处理测试:');
        console.log('-'.repeat(60));

        // 测试未定义函数
        console.log('\n测试未定义函数: =NONEXISTENT(A1)');
        const errorResult = engine.setFormula(sheet, 20, 0, '=NONEXISTENT(A1)');
        console.log(`结果: ${errorResult}`);
        console.log(`预期: #NAME?`);
        console.log(`状态: ${errorResult === '#NAME?' ? '✅ 正确返回错误码' : '❌ 异常'}\n`);

        // 7. 总结
        console.log('=' .repeat(60));
        console.log('\n🎯 诊断总结:\n');

        const allFuncs = getRegisteredFunctions();
        const sumWorks = engine.setFormula(sheet, 30, 0, '=SUM(1,2)') === 3;

        console.log('检查项:');
        console.log(`  ✅ 模块导入: 正常`);
        console.log(`  ✅ 函数数量: ${allFuncs.length} 个`);
        console.log(`  ✅ SUM 函数: ${sumWorks ? '正常工作' : '❌ 存在问题'}`);
        console.log(`  ✅ Map 结构: ${FUNCTIONS instanceof Map ? '正确' : '⚠️ 需要检查'}`);

        if (sumWorks && allFuncs.length >= 13) {
            console.log('\n✨ 结论: 公式引擎运行正常！如果仍有问题，请检查：');
            console.log('  1. 单元格数据是否正确设置');
            console.log('  2. 工作表名称是否匹配');
            console.log('  3. 是否有缓存需要清理');
        } else {
            console.log('\n⚠️ 结论: 发现潜在问题！建议：');
            console.log('  1. 清除 node_modules 缓存后重新安装');
            console.log('  2. 检查是否有多个版本的模块');
            console.log('  3. 重启开发服务器');
        }

    } catch (error) {
        console.error('\n💥 诊断过程发生异常:', error);
        console.error(error.stack);
    }
}

diagnose().catch(console.error);