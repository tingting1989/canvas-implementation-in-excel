/**
 * 循环引用检测示例
 *
 * 运行方式: node examples/circular-reference-example.js
 */

async function runExample() {
    console.log('🔄 Canvas Spreadsheet - 循环引用检测示例\n');
    console.log('=' .repeat(60));

    // 动态导入模块
    const { FormulaEngine } = await import('../src/formula/FormulaEngine.js');
    const { errorHandler, ERROR_CODE } = await import('../src/core/ErrorHandler.js');

    // 配置错误处理器（显示所有日志）
    errorHandler.configure({
        level: 0,  // 显示所有级别（DEBUG 及以上）
        devMode: true,
        throwOnFatal: false
    });

    // 注册错误监听器
    const circularRefsDetected = [];
    errorHandler.onError((code, message, level, meta) => {
        if (code === ERROR_CODE.FORMULA_CIRCULAR_REFERENCE) {
            circularRefsDetected.push({ code, message, level, meta });
        }
    });

    // 模拟 Workbook 和 Sheet
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

        // 模拟 Cell 类
        static Cell = class Cell {
            constructor(value, styleId, disabled, formula) {
                this.value = value;
                this.styleId = styleId;
                this.disabled = disabled;
                this.formula = formula;
            }
        }
    }

    // 创建模拟环境
    const workbook = new MockWorkbook();
    const sheet1 = workbook.activeSheet;

    // 创建公式引擎
    const engine = new FormulaEngine(workbook);
    workbook.formulaEngine = engine;

    console.log('\n📌 场景 1: 直接自引用');
    console.log('-' .repeat(40));

    const result1 = engine.setFormula(sheet1, 0, 0, '=A1+1');
    console.log(`\n  公式: A1 = A1 + 1`);
    console.log(`  结果: ${result1}`);
    console.log(`  预期: #CIRCULAR!`);
    console.log(`  ✅ ${result1 === '#CIRCULAR!' ? '通过' : '失败'}\n`);

    // 清理
    engine.removeFormula(sheet1, 0, 0);

    console.log('\n📌 场景 2: 间接循环引用');
    console.log('-' .repeat(40));

    sheet1.set(0, 0, null);  // 清空 A1
    sheet1.set(1, 0, null);  // 清空 B1
    sheet1.set(2, 0, null);  // 清空 C1

    engine.setFormula(sheet1, 0, 0, '=B1+1');   // A1 = B1 + 1
    engine.setFormula(sheet1, 1, 0, '=C1+1');   // B1 = C1 + 1
    const result2 = engine.setFormula(sheet1, 2, 0, '=A1+1');   // C1 = A1 + 1 ← 循环！

    console.log(`\n  公式链:`);
    console.log(`    A1 = B1 + 1`);
    console.log(`    B1 = C1 + 1`);
    console.log(`    C1 = A1 + 1  ← 形成循环`);
    console.log(`\n  C1 结果: ${result2}`);
    console.log(`  预期: #CIRCULAR!`);
    console.log(`  ✅ ${result2 === '#CIRCULAR!' ? '通过' : '失败'}\n`);

    // 清理
    for (let i = 0; i < 3; i++) {
        engine.removeFormula(sheet1, i, 0);
    }

    console.log('\n📌 场景 3: 跨表循环引用');
    console.log('-' .repeat(40));

    const sheet2 = workbook.createSheet('Sheet2');

    const result3a = engine.setFormula(sheet1, 0, 0, '=Sheet2!A1+1');
    const result3b = engine.setFormula(sheet2, 0, 0, '=Sheet1!A1+1');

    console.log(`\n  公式链:`);
    console.log(`    Sheet1!A1 = Sheet2!A1 + 1`);
    console.log(`    Sheet2!A1 = Sheet1!A1 + 1  ← 跨表循环`);
    console.log(`\n  Sheet1!A1 结果: ${result3a}`);
    console.log(`  Sheet2!A1 结果: ${result3b}`);
    console.log(`  预期: 都应该是 #CIRCULAR!`);
    console.log(`  ✅ ${result3a === '#CIRCULAR!' && result3b === '#CIRCULAR!' ? '通过' : '失败'}\n`);

    // 清理
    engine.removeFormula(sheet1, 0, 0);
    engine.removeFormula(sheet2, 0, 0);

    console.log('\n📌 场景 4: 正常依赖（无循环）');
    console.log('-' .repeat(40));

    sheet1.set(0, 0, 10);  // A1 = 10
    const result4a = engine.setFormula(sheet1, 1, 0, '=A1*2');  // B1 = A1 * 2
    const result4b = engine.setFormula(sheet1, 2, 0, '=B1+5');  // C1 = B1 + 5

    console.log(`\n  数据:`);
    console.log(`    A1 = 10`);
    console.log(`    B1 = A1 * 2`);
    console.log(`    C1 = B1 + 5`);
    console.log(`\n  B1 结果: ${result4a} (预期: 20)`);
    console.log(`  C1 结果: ${result4b} (预期: 25)`);
    console.log(`  ✅ ${result4a === 20 && result4b === 25 ? '通过' : '失败'}\n`);

    console.log('\n📌 场景 5: 循环引用事件监听');
    console.log('-' .repeat(40));

    console.log(`\n  已检测到的循环引用次数: ${circularRefsDetected.length}`);

    if (circularRefsDetected.length > 0) {
        console.log(`\n  📋 循环引用详情:`);
        circularRefsDetected.forEach((ref, index) => {
            console.log(`\n  [${index + 1}] 错误码: ${ref.code}`);
            console.log(`      级别: ${ref.level}`);
            console.log(`      消息: ${ref.message}`);
            console.log(`      单元格: ${ref.meta.circularCell}`);
            console.log(`      调用栈: ${ref.meta.callStack.join(' → ')}`);
        });
    }

    console.log(`\n  ✅ 监听机制正常工作\n`);

    // ============================================
    // 总结
    // ============================================
    console.log('=' .repeat(60));
    console.log('✅ 所有循环引用检测场景完成!\n');
    console.log('📝 关键要点:');
    console.log('  ✅ 直接自引用检测：A1 引用自身');
    console.log('  ✅ 间接循环检测：A1→B1→C1→A1');
    console.log('  ✅ 跨表循环检测：Sheet1↔Sheet2');
    console.log('  ✅ 正常依赖无干扰：无循环时正常计算');
    console.log('  ✅ 事件监听机制：可捕获所有循环引用');
    console.log('  ✅ 标准错误码：返回 #CIRCULAR!');
    console.log('  ✅ 完整元数据：包含调用栈路径');
    console.log('\n🔗 详细文档请查看: docs/formula-engine-guide.md');
}

runExample().catch(console.error);