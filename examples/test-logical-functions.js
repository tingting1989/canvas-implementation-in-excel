/**
 * AND/OR/NOT 逻辑函数测试套件
 *
 * 验证逻辑运算函数的正确性：
 * - AND: 逻辑与（所有条件都为真）
 * - OR: 逻辑或（任一条件为真）
 * - NOT: 逻辑非（反转逻辑值）
 *
 * 运行方式: node examples/test-logical-functions.js
 */

async function testLogicalFunctions() {
    console.log('🧪 AND/OR/NOT 逻辑函数测试\n');
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

    // 设置测试数据
    sheet.cellStore.set(0, 0, new Cell(100));      // A1 = 100
    sheet.cellStore.set(1, 0, new Cell(50));       // A2 = 50
    sheet.cellStore.set(2, 0, new Cell(-10));      // A3 = -10
    sheet.cellStore.set(3, 0, new Cell(0));        // A4 = 0
    sheet.cellStore.set(4, 0, new Cell(true));     // A5 = true
    sheet.cellStore.set(5, 0, new Cell(false));    // A6 = false

    let passed = 0;
    let failed = 0;

    function test(name, formula, expected, description) {
        try {
            const result = engine.setFormula(sheet, 100 + passed + failed, 0, formula);
            
            let success;
            if (typeof expected === 'boolean') {
                success = result === expected || 
                         (result === true && expected === true) ||
                         (result === false && expected === false);
            } else {
                success = result === expected;
            }

            if (success) {
                console.log(`✅ ${name}`);
                console.log(`   ${description}`);
                console.log(`   结果: ${result} | 预期: ${expected}\n`);
                passed++;
            } else {
                console.log(`❌ ${name}`);
                console.log(`   ${description}`);
                console.log(`   结果: ${result} | 预期: ${expected}\n`);
                failed++;
            }
        } catch (e) {
            console.error(`❌ ${name} - 异常: ${e.message}\n`);
            failed++;
        }
    }

    // ════════════════════════════════════════════
    // 第一部分：AND 函数基础测试
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第一部分：AND 函数基础测试');
    console.log('═'.repeat(70), '\n');

    test(
        'AND-01: 全 TRUE',
        '=AND(TRUE, TRUE, TRUE)',
        true,
        '所有参数为 TRUE 时返回 TRUE'
    );

    test(
        'AND-02: 包含 FALSE',
        '=AND(TRUE, FALSE, TRUE)',
        false,
        '任一参数为 FALSE 时返回 FALSE'
    );

    test(
        'AND-03: 全 FALSE',
        '=AND(FALSE, FALSE, FALSE)',
        false,
        '所有参数为 FALSE 时返回 FALSE'
    );

    test(
        'AND-04: 单个参数 TRUE',
        '=AND(TRUE)',
        true,
        '单个 TRUE 参数返回 TRUE'
    );

    test(
        'AND-05: 单个参数 FALSE',
        '=AND(FALSE)',
        false,
        '单个 FALSE 参数返回 FALSE'
    );

    // ════════════════════════════════════════════
    // 第二部分：AND 函数类型转换测试
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第二部分：AND 函数类型转换测试');
    console.log('═'.repeat(70), '\n');

    test(
        'AND-06: 非零数值',
        '=AND(1, 2, 3)',
        true,
        '非零数值视为 TRUE'
    );

    test(
        'AND-07: 包含零值',
        '=AND(1, 0, 3)',
        false,
        '零值视为 FALSE，导致整体返回 FALSE'
    );

    test(
        'AND-08: 正数',
        '=AND(1, 2, 3)',
        true,
        '正数视为 TRUE（非零）'
    );

    test(
        'AND-09: 字符串 "TRUE"',
        '=AND("TRUE", "TRUE")',
        true,
        '字符串 "TRUE" 视为 TRUE'
    );

    test(
        'AND-10: 字符串 "FALSE"',
        '=AND("TRUE", "FALSE")',
        false,
        '字符串 "FALSE" 视为 FALSE'
    );

    test(
        'AND-11: 混合类型',
        '=AND(1, TRUE, "yes")',
        true,
        '混合类型都转换为 TRUE'
    );

    // ════════════════════════════════════════════
    // 第三部分：OR 函数基础测试
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第三部分：OR 函数基础测试');
    console.log('═'.repeat(70), '\n');

    test(
        'OR-01: 全 TRUE',
        '=OR(TRUE, TRUE, TRUE)',
        true,
        '所有参数为 TRUE 时返回 TRUE'
    );

    test(
        'OR-02: 包含 TRUE',
        '=OR(FALSE, TRUE, FALSE)',
        true,
        '任一参数为 TRUE 时返回 TRUE'
    );

    test(
        'OR-03: 全 FALSE',
        '=OR(FALSE, FALSE, FALSE)',
        false,
        '所有参数为 FALSE 时返回 FALSE'
    );

    test(
        'OR-04: 单个参数 TRUE',
        '=OR(TRUE)',
        true,
        '单个 TRUE 参数返回 TRUE'
    );

    test(
        'OR-05: 单个参数 FALSE',
        '=OR(FALSE)',
        false,
        '单个 FALSE 参数返回 FALSE'
    );

    // ════════════════════════════════════════════
    // 第四部分：OR 函数类型转换测试
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第四部分：OR 函数类型转换测试');
    console.log('═'.repeat(70), '\n');

    test(
        'OR-06: 全零值',
        '=OR(0, 0, 0)',
        false,
        '所有零值视为 FALSE'
    );

    test(
        'OR-07: 包含非零值',
        '=OR(0, 0, 5)',
        true,
        '非零值视为 TRUE，导致整体返回 TRUE'
    );

    test(
        'OR-08: 非零值',
        '=OR(0, 0, 1)',
        true,
        '非零值视为 TRUE'
    );

    test(
        'OR-09: 字符串组合',
        '=OR("", "FALSE", 0)',
        false,
        '空字符串、"FALSE"、0 都视为 FALSE'
    );

    test(
        'OR-10: 混合类型有 TRUE',
        '=OR(0, "", NULL, 1)',
        true,
        '只要有 1 个非零值就返回 TRUE'
    );

    // ════════════════════════════════════════════
    // 第五部分：NOT 函数测试
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第五部分：NOT 函数测试');
    console.log('═'.repeat(70), '\n');

    test(
        'NOT-01: 反转 TRUE',
        '=NOT(TRUE)',
        false,
        'TRUE → FALSE'
    );

    test(
        'NOT-02: 反转 FALSE',
        '=NOT(FALSE)',
        true,
        'FALSE → TRUE'
    );

    test(
        'NOT-03: 反转非零值',
        '=NOT(1)',
        false,
        '1→TRUE→FALSE'
    );

    test(
        'NOT-04: 反转零值',
        '=NOT(0)',
        true,
        '0→FALSE→TRUE'
    );

    test(
        'NOT-05: 双重否定',
        '=NOT(NOT(TRUE))',
        true,
        '双重否定恢复原值'
    );

    // ════════════════════════════════════════════
    // 第六部分：与 IF 函数配合使用
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第六部分：与 IF 函数配合使用');
    console.log('═'.repeat(70), '\n');

    test(
        'COMBO-01: IF + AND',
        '=IF(AND(A1>50, A2>20), "满足条件", "不满足")',
        "满足条件",
        'A1=100>50 且 A2=50>20，应返回"满足条件"'
    );

    test(
        'COMBO-02: IF + OR',
        '=IF(OR(A1<0, A3<0), "存在负数", "无负数")',
        "存在负数",
        'A3=-10<0，应返回"存在负数"'
    );

    test(
        'COMBO-03: IF + NOT',
        '=IF(NOT(A4=0), "非零", "为零")',
        "为零",
        'A4=0，NOT(0)=FALSE，应返回"为零"'
    );

    test(
        'COMBO-04: 复合逻辑',
        '=IF(AND(A1>0, NOT(A6)), "正且非假", "其他")',
        "正且非假",
        'A1=100>0 且 NOT(false)=true，应返回"正且非假"'
    );

    test(
        'COMBO-05: 多层嵌套',
        '=IF(OR(AND(A1>90, A2>40), A3<0), "通过", "未通过")',
        "通过",
        '(A1>90且A2>40) 或 (A3<0)，两个条件都满足'
    );

    // ════════════════════════════════════════════
    // 第七部分：短路求值验证
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第七部分：短路求值验证');
    console.log('═'.repeat(70), '\n');

    test(
        'SHORT-01: AND 短路（第一个 FALSE）',
        '=AND(FALSE, 1/0)',
        false,
        '遇到 FALSE 应立即返回，不计算后续（避免除零错误）'
    );

    test(
        'SHORT-02: OR 短路（第一个 TRUE）',
        '=OR(TRUE, 1/0)',
        true,
        '遇到 TRUE 应立即返回，不计算后续'
    );

    // ════════════════════════════════════════════
    // 第八部分：边界情况和错误处理
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第八部分：边界情况和错误处理');
    console.log('═'.repeat(70), '\n');

    test(
        'EDGE-01: AND 无参数',
        '=AND()',
        '#VALUE!',
        '没有参数时应返回错误'
    );

    test(
        'EDGE-02: OR 无参数',
        '=OR()',
        '#VALUE!',
        '没有参数时应返回错误'
    );

    test(
        'EDGE-03: NOT 无参数',
        '=NOT()',
        '#VALUE!',
        '没有参数时应返回错误'
    );

    test(
        'EDGE-04: NOT 多参数',
        '=NOT(TRUE, FALSE)',
        '#VALUE!',
        'NOT 只接受 1 个参数'
    );

    test(
        'EDGE-05: AND 处理空值',
        '=AND(0, "")',
        false,
        '0 和空字符串视为 FALSE'
    );

    test(
        'EDGE-06: OR 处理空值',
        '=OR(0, "", 0)',
        false,
        '0、空字符串都视为 FALSE'
    );

    // ════════════════════════════════════════════
    // 第九部分：实际应用场景
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第九部分：实际应用场景');
    console.log('═'.repeat(70), '\n');

    test(
        'APP-01: 成绩评级（多条件）',
        '=IF(AND(A1>=80, A2>=30, A3<0), "优秀", "一般")',
        "优秀",
        'A1=100, A2=50, A3=-10 都满足条件'
    );

    test(
        'APP-02: 数据有效性检查',
        '=IF(OR(A4=0, A3<0), "无效数据", "有效")',
        "无效数据",
        'A4=0 或 A3<0 时数据无效（A3=-10）'
    );

    test(
        'APP-03: 权限判断',
        '=IF(AND(A5, NOT(A6)), "有权限", "无权限")',
        "有权限",
        'A5=true 且 A6=false 时有权限'
    );

    // ════════════════════════════════════════════
    // 第十部分：性能测试
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📌 第十部分：性能测试');
    console.log('═'.repeat(70), '\n');

    const perfStart = performance.now();

    for (let i = 0; i < 1000; i++) {
        engine.setFormula(sheet, 200 + i, 0, `=AND(${i}>0, ${i}<1000)`);
        engine.setFormula(sheet, 200 + i, 1, `=OR(${i}<0, ${i}>500)`);
        engine.setFormula(sheet, 200 + i, 2, `=NOT(${i % 2 === 0})`);
    }

    const perfEnd = performance.now();
    const perfDuration = perfEnd - perfStart;

    console.log(`⚡ 性能测试: 3000次逻辑计算（1000次 × 3函数）`);
    console.log(`   总耗时: ${perfDuration.toFixed(2)}ms`);
    console.log(`   平均每次: ${(perfDuration / 3000).toFixed(3)}ms`);
    console.log(`   性能评级: ${perfDuration < 500 ? '✅ 优秀' : perfDuration < 1000 ? '⚠️ 一般' : '❌ 需优化'}\n`);

    // ════════════════════════════════════════════
    // 总结
    // ════════════════════════════════════════════

    console.log('═'.repeat(70));
    console.log('📊 AND/OR/NOT 测试总结');
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

    if (passRate >= 95) {
        console.log('✨ 完美！AND/OR/NOT 实现质量极高！');
    } else if (passRate >= 85) {
        console.log('👍 优秀！核心功能完全正确。');
    } else if (passRate >= 70) {
        console.log('✅ 良好！基本功能正常，需检查边界情况。');
    } else {
        console.log('⚠️ 需要改进！请检查失败用例。');
    }

    console.log('\n💡 AND/OR/NOT 使用提示:');
    console.log('- AND: 用于多重条件判断（必须全部满足）');
    console.log('- OR: 用于备选条件判断（满足其一即可）');
    console.log('- NOT: 用于逻辑反转和排除性条件');
    console.log('- 推荐与 IF 配合使用实现复杂业务逻辑\n');
    
    console.log('🎯 典型应用场景:');
    console.log('=IF(AND(成绩>=60, 出勤>=90%), "合格", "不合格")');
    console.log('=IF(OR(状态="已完成", 优先级="紧急"), "处理", "等待")');
    console.log('=IF(NOT(ISERROR(VLOOKUP(...))), "找到", "未找到")\n');

    return { total, passed, failed, passRate };
}

testLogicalFunctions()
    .then(result => {
        process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(error => {
        console.error('💥 测试执行异常:', error);
        process.exit(1);
    });